"use client";

import { useState, useEffect } from "react";
import { CustomerDropzone } from "./dropzone";
import { SneakPeekBento } from "./sneak-peek-bento";
import { PaddleCheckout } from "./paddle-checkout";
import { FullReport } from "./full-report";
import { DeepDiveQuestions } from "./deep-dive-questions";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisResult } from "@/types";
import { storePDF, storeText, getText, getFactSheet, storeFactSheet, deleteSession, cleanupExpiredSessions, cleanupOrphanedSessions, storeEncryptedFactSheet, getEncryptedFactSheet, storeRecoveryVault } from "@/lib/pdf-storage";
import { VoucherRecovery } from "./voucher-recovery";

type CustomerStep =
  | "idle"
  | "uploading"
  | "analyzing"
  | "sneak-peek"
  | "paid"
  | "full-report"
  | "recovery";

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
  const [voucherCode, setVoucherCode] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [sneakPeekRemaining, setSneakPeekRemaining] = useState(3);
  const [loadingMessage, setLoadingMessage] = useState("Generating your full report...");
  const [analyzingMessage, setAnalyzingMessage] = useState("Analyzing your policy...");

  const renderFlagName = (flagId: string): string => {
    // Capitalize first letter of each word for snake_case fallback
    return flagId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  /**
   * Convert a fact sheet (from API or cache) to AnalysisResult format
   * Used by both instant cache access and fallback audit path
   * 
   * IMPORTANT: The API returns the full auditor report with these top-level fields:
   * - red_flags: array of RedFlag objects
   * - exclusions: array of Exclusion objects  
   * - clauses: array of Clause objects
   * - insight_cards: array of InsightCard objects
   * - plain_english_summary: string
   * - grade: object with overall, clarity, coverage, claimsEfficiency
   */
  const convertFactSheetToResult = (sid: string, factSheet: any): AnalysisResult => {
    if (!factSheet) {
      throw new Error("No fact sheet data");
    }
    
    // Handle grade: the API returns grade as an object with overall, clarity, coverage, claimsEfficiency
    const gradeObj = factSheet.grade || {};
    const overallGrade = gradeObj.overall || "C";
    const clarityGrade = gradeObj.clarity || overallGrade;
    const coverageGrade = gradeObj.coverage || overallGrade;
    const claimsGrade = gradeObj.claimsEfficiency || overallGrade;

    // Map red_flags array - each flag has: flag_id, source, severity, deduction, page, excerpt, plain_english, legal_basis
    const redFlagsArray = Array.isArray(factSheet.red_flags) ? factSheet.red_flags : [];
    
    // Map exclusions array - each exclusion has: type, summary, page, risk_level
    const exclusionsArray = Array.isArray(factSheet.exclusions) ? factSheet.exclusions : [];
    
    // Map clauses array - each clause has: type, summary, page, risk_level
    const clausesArray = Array.isArray(factSheet.clauses) ? factSheet.clauses : [];
    
    // Map insight_cards array - each card has: question, answer, category, priority, page, excerpt
    const insightCardsArray = Array.isArray(factSheet.insight_cards) ? factSheet.insight_cards : [];

    return {
      session_id: sid,
      grade: {
        overall: overallGrade,
        clarity: clarityGrade,
        coverage: coverageGrade,
        claimsEfficiency: claimsGrade,
      },
      topRisk: factSheet.top_risk || (redFlagsArray.length > 0 ? redFlagsArray[0].plain_english : "No major risks detected"),
      redFlags: redFlagsArray.map((flag: any) => flag.flag_id || flag.type || "unknown"),
      summary: factSheet.plain_english_summary || factSheet.summary || "",
      detailedFlags: redFlagsArray.map((flag: any) => ({
        flag_id: flag.flag_id || "unknown",
        source: flag.source || "structural",
        severity: flag.severity || "minor",
        deduction: flag.deduction || 0,
        page: flag.page,
        excerpt: flag.excerpt || "",
        plain_english: flag.plain_english || renderFlagName(flag.flag_id || "unknown"),
        legal_basis: flag.legal_basis || "",
      })),
      exclusions: exclusionsArray.map((exclusion: any) => ({
        type: exclusion.type || "Unknown",
        summary: exclusion.summary || "",
        page: exclusion.page || 0,
        risk_level: exclusion.risk_level || "medium",
      })),
      clauses: clausesArray.map((clause: any) => ({
        type: clause.type || "Unknown",
        summary: clause.summary || "",
        page: clause.page || 0,
        risk_level: clause.risk_level || "medium",
      })),
      insight_cards: insightCardsArray.map((card: any) => ({
        question: card.question || "",
        answer: card.answer || "",
        category: card.category || "explain",
        priority: card.priority || 5,
        page: card.page,
        excerpt: card.excerpt || "",
      })),
      clarity: factSheet.clarity,
      coverage: factSheet.coverage,
      claim_efficiency: factSheet.claim_efficiency,
      total_deductions: factSheet.total_deductions || 0,
      plain_english_summary: factSheet.plain_english_summary || "",
      comparison_ready: factSheet.comparison_ready,
    };
  };

  const ANALYZING_MESSAGES = [
    "Analyzing your policy...",
    "Reading the fine print...",
    "Scanning for red flags...",
    "Calculating your score...",
    "Almost done...",
  ];

  const REPORT_MESSAGES = [
    "Scoring the policy...",
    "Looking for fine print...",
    "Identifying red flags...",
    "Building your report...",
    "Calculating Enziu Index benchmarks...",
    "Quantifying liability exposure...",
    "Scanning endorsements...",
    "Cross-referencing limits...",
    "Detecting coverage gaps in fine print...",
    "Validating safeguards...",
    "Almost done...",
  ];

  // Clean up stale IndexedDB records on mount
  useEffect(() => {
    cleanupExpiredSessions();
    cleanupOrphanedSessions("pending_");
  }, []);

    // Cycle loading messages while generating report
    useEffect(() => {
      if (!isGeneratingReport) {
        setLoadingMessage("Generating your full report...");
        return;
      }
      let idx = 0;
      const interval = setInterval(() => {
        idx = (idx + 1) % REPORT_MESSAGES.length;
        setLoadingMessage(REPORT_MESSAGES[idx]);
      }, 4000);
      return () => clearInterval(interval);
    }, [isGeneratingReport]);

    // Cycle analyzing messages while analyzing sneak peek
    useEffect(() => {
      if (step !== "analyzing") {
        setAnalyzingMessage("Analyzing your policy...");
        return;
      }
      let idx = 0;
      const interval = setInterval(() => {
        idx = (idx + 1) % ANALYZING_MESSAGES.length;
        setAnalyzingMessage(ANALYZING_MESSAGES[idx]);
      }, 3000);
      return () => clearInterval(interval);
    }, [step]);

    // 3/day sneak peek rate limit
    useEffect(() => {
    const STORAGE_KEY = "enziu_sneak_count";
    const today = new Date().toDateString();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const data = stored ? JSON.parse(stored) : { date: today, count: 0 };
      // Reset if new day
      if (data.date !== today) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, count: 0 }));
        setSneakPeekRemaining(3);
      } else {
        setSneakPeekRemaining(Math.max(0, 3 - data.count));
      }
    } catch {
      setSneakPeekRemaining(3);
    }
  }, []);

  const handleFileUploaded = async (file: File) => {
    // Rate limit check — 3 sneak peeks per day
    if (sneakPeekRemaining <= 0) {
      setReportError("You've reached the daily limit of 3 free sneak peeks. Please try again tomorrow or purchase a full report.");
      return;
    }

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
      
      // Gold-Handoff: Store PDF in IndexedDB for viewer, clean up pending record
      try {
        await storePDF(result.session_id, file);
        await deleteSession(`pending_${file.name}`); // Clean orphaned pending record
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

      // Cache the full report (encrypted) for instant access after payment
      // The API already computed the full audit during sneak peek
      if (result.full_report) {
        try {
          await storeEncryptedFactSheet(result.session_id, result.full_report);
          console.log('[CustomerMode] Full report cached (encrypted) for instant access after payment');
        } catch (err) {
          console.error('[CustomerMode] Failed to cache encrypted fact sheet:', err);
          // Non-fatal - continue with sneak peek
        }
      }

      setStep("sneak-peek");
    } catch (error) {
      console.error("Upload error:", error);
      const message = error instanceof Error ? error.message : "Upload failed";
      // Clean up any orphaned data on error
      deleteSession(`pending_${file.name}`).catch(() => {});
      // Show error in UI - scanned doc message comes from server
      setReportError(message);
      setStep("idle");
      // Reset error after 5 seconds
      setTimeout(() => setReportError(null), 5000);
    }
  };

  const handlePaymentComplete = (voucherCode?: string) => {
    if (voucherCode) {
      setVoucherCode(voucherCode);
    }
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
      // INSTANT ACCESS: Check for encrypted cached fact sheet first
      // This was stored during sneak peek, so payment = instant unlock
      const encryptedFactSheet = await getEncryptedFactSheet(sessionId);
      if (encryptedFactSheet) {
        console.log('[CustomerMode] Using encrypted cached fact sheet - INSTANT ACCESS');
        
        // Convert to analysis result format
        const factSheet = encryptedFactSheet;
        const result = convertFactSheetToResult(sessionId, factSheet);
        
        setFullReportResult(result);
        setStep("full-report");
        setIsGeneratingReport(false);
        
        // Store as recovery vault if voucher code is available
        if (voucherCode) {
          try {
            const extractedText = sessionStorage.getItem("enziu_vault") || await getText(sessionId) || "";
            if (extractedText) {
              await storeRecoveryVault(voucherCode, {
                factSheet,
                extractedText,
                sessionId,
              });
              console.log('[CustomerMode] Recovery vault created for future access');
            }
          } catch (err) {
            console.error('[CustomerMode] Failed to create recovery vault:', err);
          }
        }
        return;
      }

      // Fallback: Check for unencrypted cached fact sheet
      const existingFactSheet = await getFactSheet(sessionId);
      if (existingFactSheet) {
        console.log('[CustomerMode] Using unencrypted cached fact sheet from IndexedDB');
        const result = convertFactSheetToResult(sessionId, existingFactSheet);
        setFullReportResult(result);
        setStep("full-report");
        setIsGeneratingReport(false);
        
        // Store as recovery vault if voucher code is available
        if (voucherCode) {
          try {
            const extractedText = sessionStorage.getItem("enziu_vault") || await getText(sessionId) || "";
            if (extractedText) {
              await storeRecoveryVault(voucherCode, {
                factSheet: existingFactSheet,
                extractedText,
                sessionId,
              });
              console.log('[CustomerMode] Recovery vault created for future access');
            }
          } catch (err) {
            console.error('[CustomerMode] Failed to create recovery vault:', err);
          }
        }
        return;
      }

      // Cache miss: Get text and run full audit
      console.log('[CustomerMode] Cache miss - running full audit');
      let extractedText = sessionStorage.getItem("enziu_vault");
      if (!extractedText) {
        extractedText = await getText(sessionId);
      }
      
      if (!extractedText) {
        throw new Error("No extracted text found. Please re-upload your PDF.");
      }

      // Single-shot full audit
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 480000);

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
        throw new Error(`Audit failed: ${auditResponse.status}`);
      }

      const auditResult = await auditResponse.json();
      
      // Store the fact sheet in IndexedDB for future use
      await storeFactSheet(sessionId, auditResult.report);
      
      // Convert fact sheet to analysis result format
      const factSheet = auditResult.report;
      
      if (!factSheet) {
        throw new Error("No fact sheet data received from audit");
      }
      
      // Use the same conversion logic as the cached path
      const result = convertFactSheetToResult(sessionId, factSheet);
      
      setFullReportResult(result);
      setStep("full-report");
    } catch (error) {
      console.error("Full analysis error:", error);
      
      // Clean up stale session data on failure
      if (sessionId) {
        deleteSession(sessionId).catch(console.error);
        sessionStorage.removeItem("enziu_vault");
      }
      
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
    sessionStorage.removeItem("enziu_vault");
    
    setStep("idle");
    setAnalysisResult(null);
    setFullReportResult(null);
    setSessionId(null);
    setIsGeneratingReport(false);
    setReportError(null);
  };

  const handleVoucherRecovery = (data: { factSheet: any; extractedText: string; sessionId: string }) => {
    // Restore session from encrypted vault — no re-upload, no re-inference
    setSessionId(data.sessionId);
    
    // Store text in sessionStorage + IndexedDB for chat
    sessionStorage.setItem("enziu_vault", data.extractedText);
    storeText(data.sessionId, data.extractedText).catch(console.error);
    
    // Convert fact sheet to analysis result format using the same logic as generateFullReport
    const factSheet = data.factSheet;
    
    if (!factSheet) {
      console.error('[CustomerMode] No fact sheet data in voucher recovery');
      setStep("idle");
      return;
    }
    
    // Use the same conversion logic as generateFullReport
    const result = convertFactSheetToResult(data.sessionId, factSheet);
    setFullReportResult(result);
    setStep("full-report");
  };

  useEffect(() => {
    const handleResetEvent = () => {
      handleReset();
    };

    window.addEventListener("enziu-reset", handleResetEvent);
    return () => window.removeEventListener("enziu-reset", handleResetEvent);
  }, []);

  const handlePageClick = (page: number) => {
    // Overview page navigation delegated to PDF viewer via full-report
    // This is handled internally by the insight card dispatch events
  };

  const shouldHideToggle = ["uploading", "analyzing", "sneak-peek", "paid", "full-report"].includes(step);

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
            <div className="mt-6">
              <button
                onClick={() => setStep("recovery")}
                className="text-sm text-muted-foreground hover:text-brand-amber transition-colors underline underline-offset-2"
              >
                Already paid? Recover your report
              </button>
            </div>
          </motion.div>
        )}

        {step === "recovery" && (
          <motion.div
            key="recovery"
            {...fadeInUp}
            className="py-16"
          >
            <VoucherRecovery onRecoveryComplete={handleVoucherRecovery} />
            <div className="mt-6 text-center">
              <button
                onClick={() => setStep("idle")}
                className="text-sm text-muted-foreground hover:text-brand-amber transition-colors underline underline-offset-2"
              >
                ← Back to upload
              </button>
            </div>
          </motion.div>
        )}

        {step === "uploading" && (
          <motion.div
            key="uploading"
            {...fadeInUp}
            className="min-h-[70vh] flex flex-col items-center justify-center"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-brand-amber border-t-transparent rounded-full animate-spin" />
              <p className="text-lg text-muted-foreground">Extracting text from your PDF...</p>
            </div>
          </motion.div>
        )}

        {step === "analyzing" && (
          <motion.div
            key="analyzing"
            {...fadeInUp}
            className="min-h-[70vh] flex flex-col items-center justify-center"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-brand-amber border-t-transparent rounded-full animate-spin" />
              <p className="text-lg text-muted-foreground">{analyzingMessage}</p>
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
            className="min-h-[70vh] flex flex-col items-center justify-center"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-brand-amber border-t-transparent rounded-full animate-spin" />
              <p className="text-lg text-muted-foreground">{loadingMessage}</p>
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
              voucherCode={voucherCode || undefined}
            />
            <DeepDiveQuestions
              sessionId={sessionId || ""}
              insightCards={fullReportResult?.insight_cards}
              onPageClick={handlePageClick}
            />
          </motion.div>
        )}      
      </AnimatePresence>
    </div>
  );
}