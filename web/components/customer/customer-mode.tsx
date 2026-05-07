"use client";

import { useState, useEffect } from "react";
import { CustomerDropzone } from "./dropzone";
import { SneakPeekBento } from "./sneak-peek-bento";
import { PaddleCheckout } from "./paddle-checkout";
import { FullReport } from "./full-report";
import { DeepDiveChat } from "./deep-dive-chat";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisResult } from "@/types";
import { storePDF, storeText, getText, getFactSheet, storeFactSheet, deleteSession, cleanupExpiredSessions } from "@/lib/pdf-storage";

type CustomerStep =
  | "idle"
  | "uploading"
  | "analyzing"
  | "sneak-peek"
  | "paid"
  | "full-report"
  | "chat";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.4, ease: "easeOut" }
};

export function CustomerMode() {
  const [step, setStep] = useState<CustomerStep>("idle");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );
  const [fullReportResult, setFullReportResult] = useState<AnalysisResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Clean up stale IndexedDB records on mount
  useEffect(() => {
    cleanupExpiredSessions();
  }, []);

  const handleFileUploaded = async (file: File) => {
    setStep("uploading");

    try {
      setStep("analyzing");

      // Stream file to API for extraction + sneak peek
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Upload failed");
      }

      const result = await response.json();
      setAnalysisResult(result);
      setSessionId(result.session_id);
      
      // Store session ID in localStorage for PDF viewer recovery
      localStorage.setItem("recent_session", result.session_id);
      
      // Gold-Handoff: Store PDF in IndexedDB for viewer
      try {
        await storePDF(result.session_id, file);
      } catch (err) {
        console.error('[CustomerMode] Failed to store PDF:', err);
      }
      
      // Gold-Handoff: Store extracted text in sessionStorage + IndexedDB
      try {
        sessionStorage.setItem("enziu_vault", result.extracted_text);
        await storeText(result.session_id, result.extracted_text);
        console.log('[CustomerMode] Text stored via Gold-Handoff pattern');
      } catch (err) {
        console.error('[CustomerMode] Failed to store text:', err);
      }

      setStep("sneak-peek");
    } catch (error) {
      console.error("Upload error:", error);
      const message = error instanceof Error ? error.message : "Upload failed";
      // Show error in UI - scanned doc message comes from server
      setReportError(message);
      setStep("idle");
      // Reset error after 5 seconds
      setTimeout(() => setReportError(null), 5000);
    }
  };

  const handlePaymentComplete = () => {
    generateFullReport();
  };

  const generateFullReport = async () => {
    if (!sessionId) {
      console.error("Cannot generate report - missing session");
      setStep("full-report");
      return;
    }

    setIsGeneratingReport(true);
    setReportError(null);
    setStep("paid");

    try {
      // Gold-Handoff: Get text from sessionStorage or IndexedDB
      let extractedText = sessionStorage.getItem("enziu_vault");
      if (!extractedText) {
        extractedText = await getText(sessionId);
      }
      
      if (!extractedText) {
        throw new Error("No extracted text found. Please re-upload your PDF.");
      }

      // First check if we already have a fact sheet in IndexedDB
      const existingFactSheet = await getFactSheet(sessionId);
      if (existingFactSheet) {
        console.log('[CustomerMode] Using cached fact sheet from IndexedDB');
        setFullReportResult({
          session_id: sessionId,
          ...existingFactSheet,
        });
        setStep("full-report");
        setIsGeneratingReport(false);
        return;
      }

      // Try the new Map-Reduce policy auditor first
      try {
        console.log('[CustomerMode] Using Map-Reduce policy auditor');
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 300000);

        const auditResponse = await fetch("/api/policy/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            extracted_text: extractedText,
          }),
          signal: abortController.signal,
        });

        clearTimeout(timeoutId);

        if (!auditResponse.ok) {
          // Let the fallback handle specific error cases
          throw new Error(`Audit failed: ${auditResponse.status}`);
        }

        const auditResult = await auditResponse.json();
        
        // Store the fact sheet in IndexedDB for future use
        await storeFactSheet(sessionId, auditResult.fact_sheet);
        
        // Convert fact sheet to analysis result format
        const factSheet = auditResult.fact_sheet;
        const result = {
          session_id: sessionId,
          grade: factSheet.grade,
          topRisk: factSheet.top_risk,
          redFlags: factSheet.red_flags.map((flag: any) => flag.type),
          summary: factSheet.summary,
          detailedFlags: factSheet.red_flags.map((flag: any) => ({
            name: flag.type,
            severity: flag.severity,
            page: flag.page,
            quote: flag.description,
          })),
          clauses: factSheet.clauses.map((clause: any, index: number) => ({
            id: `clause-${index}`,
            type: clause.type,
            page: clause.page,
            text: clause.summary,
            plainEnglish: clause.summary,
            concern: clause.risk_level === "high" ? "High risk" : 
                    clause.risk_level === "medium" ? "Medium risk" : null,
          })),
        };
        
        setFullReportResult(result);
        setStep("full-report");
        return;
      } catch (auditError) {
        // Log the error but fall back to the legacy endpoint
        console.warn('[CustomerMode] Map-Reduce audit failed, falling back to legacy endpoint:', auditError);
      }

      // Fallback to legacy /api/analyze/full endpoint
      console.log('[CustomerMode] Falling back to legacy analysis endpoint');
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 300000);

      const response = await fetch("/api/analyze/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          extracted_text: extractedText,
        }),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 408 || response.status === 504) {
          throw new Error("Analysis timed out. Please try again.");
        }
        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please wait before trying again.");
        }
        throw new Error(`Analysis failed: ${response.status}`);
      }

      const result = await response.json();
      setFullReportResult(result);
      setStep("full-report");
    } catch (error) {
      console.error("Full analysis error:", error);
      
      let errorMessage = "Failed to generate analysis";
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
          errorMessage = "Analysis timed out. The policy may be too large. Please try again.";
        } else {
          errorMessage = error.message;
        }
      }
      setReportError(errorMessage);
      setStep("full-report");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleReset = () => {
    // Clean up IndexedDB for the previous session
    if (sessionId) {
      deleteSession(sessionId).catch(console.error);
    }
    // Clean up localStorage keys
    localStorage.removeItem("recent_session");
    localStorage.removeItem("enziu_payment");
    localStorage.removeItem("enziu_pdf");
    sessionStorage.removeItem("enziu_vault");
    sessionStorage.removeItem("enziu_last_excerpt");
    
    setStep("idle");
    setAnalysisResult(null);
    setFullReportResult(null);
    setSessionId(null);
    setIsGeneratingReport(false);
    setReportError(null);
  };

  useEffect(() => {
    const handleResetEvent = () => {
      handleReset();
    };

    window.addEventListener("enziu-reset", handleResetEvent);
    return () => window.removeEventListener("enziu-reset", handleResetEvent);
  }, []);

  const handleChatComplete = () => {
    setStep("chat");
  };

  const shouldHideToggle = ["sneak-peek", "paid", "full-report", "chat"].includes(step);

  useEffect(() => {
    if (shouldHideToggle) {
      window.dispatchEvent(new CustomEvent("enziu-hide-toggle", { detail: { hide: true } }));
      window.dispatchEvent(new CustomEvent("enziu-hide-footer", { detail: { hide: true } }));
    } else {
      window.dispatchEvent(new CustomEvent("enziu-hide-toggle", { detail: { hide: false } }));
      window.dispatchEvent(new CustomEvent("enziu-hide-footer", { detail: { hide: false } }));
    }
    
    return () => {
      window.dispatchEvent(new CustomEvent("enziu-hide-toggle", { detail: { hide: false } }));
      window.dispatchEvent(new CustomEvent("enziu-hide-footer", { detail: { hide: false } }));
    };
  }, [step]);

  return (
    <div className="max-w-6xl mx-auto">
      <AnimatePresence mode="wait">
        {step === "idle" && (
          <motion.div
            key="idle"
            {...fadeInUp}
            className="text-center py-16"
          >
            {reportError && (
              <div className="max-w-md mx-auto mb-6 bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-sm text-red-400">
                {reportError}
              </div>
            )}
            <h1 className="text-4xl md:text-5xl font-normal mb-4 font-display">
              Understand what you{" "}
              <span className="text-gradient">actually bought.</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-4xl mx-auto">
              Complex insurance policies, simplified. Upload for instant scoring and clarity.
            </p>
            <CustomerDropzone onFileUploaded={handleFileUploaded} />
          </motion.div>
        )}

        {step === "uploading" && (
          <motion.div
            key="uploading"
            {...fadeInUp}
            className="text-center py-16"
          >
            <div className="inline-flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-brand-amber border-t-transparent rounded-full animate-spin" />
              <p className="text-lg text-muted-foreground">Extracting text from your PDF...</p>
            </div>
          </motion.div>
        )}

        {step === "analyzing" && (
          <motion.div
            key="analyzing"
            {...fadeInUp}
            className="text-center py-16"
          >
            <div className="inline-flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-brand-amber border-t-transparent rounded-full animate-spin" />
              <p className="text-lg text-muted-foreground">Analyzing your policy...</p>
            </div>
          </motion.div>
        )}

        {step === "sneak-peek" && analysisResult && (
          <motion.div
            key="sneak-peek"
            {...fadeInUp}
            className="py-8"
          >
            <SneakPeekBento result={analysisResult} />
            <div className="mt-8 text-center">
              <PaddleCheckout
                amount={4.99}
                sessionId={sessionId || ""}
                onPaymentComplete={handlePaymentComplete}
              />
            </div>
          </motion.div>
        )}

        {step === "paid" && isGeneratingReport && (
          <motion.div
            key="paid"
            {...fadeInUp}
            className="text-center py-16"
          >
            <div className="inline-flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-brand-amber border-t-transparent rounded-full animate-spin" />
              <p className="text-lg text-muted-foreground">Generating your full report...</p>
              {reportError && (
                <p className="text-sm text-brand-grade-d mt-2">{reportError}</p>
              )}
            </div>
          </motion.div>
        )}

        {step === "full-report" && (fullReportResult || analysisResult) && (
          <motion.div
            key="full-report"
            {...fadeInUp}
            className="py-8"
          >
            <FullReport 
              result={fullReportResult || analysisResult} 
              isGenerating={isGeneratingReport}
              sessionId={sessionId || undefined}
            />
            <DeepDiveChat
              sessionId={sessionId || ""}
              onChatComplete={handleChatComplete}
            />
          </motion.div>
        )}

        {step === "chat" && (fullReportResult || analysisResult) && (
          <motion.div
            key="chat"
            {...fadeInUp}
            className="py-8"
          >
            <FullReport result={fullReportResult || analysisResult} />
            <DeepDiveChat
              sessionId={sessionId || ""}
              onChatComplete={handleChatComplete}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}