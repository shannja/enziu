"use client";

import { useState, useEffect } from "react";
import { CustomerDropzone } from "./dropzone";
import { SneakPeekBento } from "./sneak-peek-bento";
import { PaddleCheckout } from "./paddle-checkout";
import { FullReport } from "./full-report";
import { DeepDiveQuestions } from "./deep-dive-questions";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisResult } from "@/types";
import { isNaGrade } from "@/lib/utils";
import {
  storePDF, storeEncryptedText, getEncryptedText, getFactSheet, storeFactSheet,
  getPDF, deleteSession, cleanupExpiredSessions, cleanupOrphanedSessions,
  storeEncryptedFactSheet, getEncryptedFactSheet,
  storeRecoveryVault, getRecoveryVault, blobToDataURL,
  encryptForSessionStorage, decryptFromSessionStorage,
  type RecoveryVaultData,
} from "@/lib/pdf-storage";
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
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -20 },
  transition: { duration: 0.4, ease: "easeOut" },
};

// ---------------------------------------------------------------------------
// Helpers — encryption envelope unwrapping
// ---------------------------------------------------------------------------

/**
 * Parse a value that may be a JSON string (double-serialised by some
 * IndexedDB wrapper implementations).
 */
function ensureParsed(value: any): any {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

/**
 * A "valid auditor report" has EITHER a `grade` object with an `overall` key
 * OR a `red_flags` array at the top level.
 */
function isValidFactSheet(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  return (
    (obj.grade != null && typeof obj.grade === "object" && "overall" in obj.grade) ||
    Array.isArray(obj.red_flags)
  );
}

/**
 * Unwrap any encryption / storage envelope so the caller always receives
 * the raw auditor report object.
 *
 * Known envelope shapes:
 *   { data: <report|string>, iv: "...", salt: "..." }   ← Web Crypto AES-GCM
 *   { value: <report|string>, ... }                     ← generic wrapper
 *   { factSheet: <report|string>, ... }                 ← accidental double-wrap
 *
 * If the top-level object already passes isValidFactSheet it is returned as-is.
 */
function unwrapFactSheet(raw: any): any {
  let obj = ensureParsed(raw);
  if (!obj || typeof obj !== "object") return obj;

  if (isValidFactSheet(obj)) return obj;

  if ("data" in obj && obj.data != null) {
    const inner = ensureParsed(obj.data);
    if (isValidFactSheet(inner)) return inner;
  }

  if ("value" in obj && obj.value != null) {
    const inner = ensureParsed(obj.value);
    if (isValidFactSheet(inner)) return inner;
  }

  if ("factSheet" in obj && obj.factSheet != null) {
    const inner = ensureParsed(obj.factSheet);
    if (isValidFactSheet(inner)) return inner;
  }

  return obj;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CustomerMode() {
  const [step, setStep]                               = useState<CustomerStep>("idle");
  const [analysisResult, setAnalysisResult]           = useState<AnalysisResult | null>(null);
  const [fullReportResult, setFullReportResult]       = useState<AnalysisResult | null>(null);
  const [sessionId, setSessionId]                     = useState<string | null>(null);
  const [voucherCode, setVoucherCode]                 = useState<string | null>(null);
  const [recoveredPdfData, setRecoveredPdfData]       = useState<string | undefined>(undefined);
  const [isGeneratingReport, setIsGeneratingReport]   = useState(false);
  const [reportError, setReportError]                 = useState<string | null>(null);
  const [sneakPeekRemaining, setSneakPeekRemaining]   = useState(3);
  const [loadingMessage, setLoadingMessage]           = useState("Generating your full report...");
  const [analyzingMessage, setAnalyzingMessage]       = useState("Analyzing your policy...");

  // Tracks the PDF page that DeepDiveQuestions last navigated to, so FullReport
  // and its PDFViewer stay in sync when a Q&A card is clicked.
  const [deepDivePage, setDeepDivePage] = useState<number | undefined>(undefined);

  const renderFlagName = (flagId: string): string =>
    flagId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  /**
   * Convert a raw auditor fact sheet to the AnalysisResult shape the UI expects.
   * Calls unwrapFactSheet first so it handles any storage envelope transparently.
   */
  const convertFactSheetToResult = (sid: string, rawFactSheet: any): AnalysisResult => {
    if (!rawFactSheet) throw new Error("No fact sheet data");

    const factSheet = unwrapFactSheet(rawFactSheet);
    if (!factSheet || typeof factSheet !== "object") {
      throw new Error("Fact sheet is not a valid object after parsing");
    }

    const gradeObj        = factSheet.grade         || {};
    const overallGrade    = (gradeObj.overall === "N/A" || gradeObj.overall) ? gradeObj.overall : "C";
    const redFlagsArray   = Array.isArray(factSheet.red_flags)    ? factSheet.red_flags    : [];
    const exclusionsArray = Array.isArray(factSheet.exclusions)   ? factSheet.exclusions   : [];
    const clausesArray    = Array.isArray(factSheet.clauses)      ? factSheet.clauses      : [];

    // insight_cards come directly from the Auditor (Step 6 of the scoring prompt).
    // They are already validated and normalised by _validate_insight_cards in inference.py.
    // We map them here with safe defaults so the frontend never throws on a bad card.
    const insightCards = Array.isArray(factSheet.insight_cards) ? factSheet.insight_cards : [];

    return {
      session_id: sid,
      grade: {
        overall:          overallGrade,
        clarity:          (gradeObj.clarity === "N/A" || gradeObj.clarity) ? gradeObj.clarity : overallGrade,
        coverage:         (gradeObj.coverage === "N/A" || gradeObj.coverage) ? gradeObj.coverage : overallGrade,
        claimsEfficiency: (gradeObj.claimsEfficiency === "N/A" || gradeObj.claimsEfficiency) ? gradeObj.claimsEfficiency : overallGrade,
      },
      topRisk: factSheet.top_risk
        || (redFlagsArray.length > 0 ? redFlagsArray[0].plain_english : "No major risks detected"),
      redFlags: redFlagsArray.map((f: any) => f.flag_id || f.type || "unknown"),
      summary:  factSheet.plain_english_summary || factSheet.summary || "",
      detailedFlags: redFlagsArray.map((flag: any) => ({
        flag_id:       flag.flag_id       || "unknown",
        source:        flag.source        || "structural",
        severity:      flag.severity      || "minor",
        deduction:     flag.deduction     || 0,
        page:          flag.page,
        excerpt:       flag.excerpt       || "",
        plain_english: flag.plain_english || renderFlagName(flag.flag_id || "unknown"),
        legal_basis:   flag.legal_basis   || "",
      })),
      exclusions: exclusionsArray.map((e: any) => ({
        type:       e.type       || "Unknown",
        summary:    e.summary    || "",
        page:       e.page       || 0,
        risk_level: e.risk_level || "medium",
      })),
      clauses: clausesArray.map((c: any) => ({
        type:       c.type       || "Unknown",
        summary:    c.summary    || "",
        page:       c.page       || 0,
        risk_level: c.risk_level || "medium",
      })),
      // Map each insight card with safe defaults.
      // page and excerpt are the citation fields used by PDFViewer.
      insight_cards: insightCards.map((card: any) => ({
        question: card.question || "",
        answer:   card.answer   || "",
        category: card.category || "explain",
        priority: typeof card.priority === "number" ? card.priority : 5,
        page:     typeof card.page === "number" && card.page > 0 ? card.page : null,
        excerpt:  card.excerpt  || "",
      })),
      clarity:               factSheet.clarity,
      coverage:              factSheet.coverage,
      claim_efficiency:      factSheet.claim_efficiency,
      total_deductions:      factSheet.total_deductions    || 0,
      plain_english_summary: factSheet.plain_english_summary || "",
      comparison_ready:      factSheet.comparison_ready,
    };
  };

  const ANALYZING_MESSAGES = [
    "Analyzing your policy...", "Reading the fine print...", "Scanning for red flags...",
    "Calculating your score...", "Almost done...", "Scoring the policy...",
    "Looking for fine print...", "Identifying red flags...", "Building your report...",
    "Calculating Enziu Index benchmarks...", "Quantifying liability exposure...",
    "Scanning endorsements...", "Cross-referencing limits...",
    "Detecting coverage gaps in fine print...", "Validating safeguards...", "Almost done...",
  ];
  const REPORT_MESSAGES = [
    "Scoring the policy...", "Looking for fine print...", "Identifying red flags...",
    "Building your report...", "Calculating Enziu Index benchmarks...",
    "Quantifying liability exposure...", "Scanning endorsements...",
    "Cross-referencing limits...", "Detecting coverage gaps in fine print...",
    "Validating safeguards...", "Almost done...",
  ];

  useEffect(() => { cleanupExpiredSessions(); cleanupOrphanedSessions("pending_"); }, []);

  useEffect(() => {
    if (!isGeneratingReport) { setLoadingMessage("Generating your full report..."); return; }
    let idx = 0;
    const iv = setInterval(() => {
      idx = (idx + 1) % REPORT_MESSAGES.length;
      setLoadingMessage(REPORT_MESSAGES[idx]);
    }, 4000);
    return () => clearInterval(iv);
  }, [isGeneratingReport]);

  useEffect(() => {
    if (step !== "analyzing") { setAnalyzingMessage("Analyzing your policy..."); return; }
    let idx = 0;
    const iv = setInterval(() => {
      idx = (idx + 1) % ANALYZING_MESSAGES.length;
      setAnalyzingMessage(ANALYZING_MESSAGES[idx]);
    }, 3000);
    return () => clearInterval(iv);
  }, [step]);

  useEffect(() => {
    const KEY = "enziu_sneak_count";
    const today = new Date().toDateString();
    try {
      const stored = localStorage.getItem(KEY);
      const data = stored ? JSON.parse(stored) : { date: today, count: 0 };
      if (data.date !== today) {
        localStorage.setItem(KEY, JSON.stringify({ date: today, count: 0 }));
        setSneakPeekRemaining(3);
      } else {
        setSneakPeekRemaining(Math.max(0, 3 - data.count));
      }
    } catch {
      setSneakPeekRemaining(3);
    }
  }, []);

  // ── Upload & Sneak Peek ────────────────────────────────────────────────────

  const handleFileUploaded = async (file: File) => {
    if (sneakPeekRemaining <= 0) {
      setReportError(
        "You've reached the daily limit of 3 free sneak peeks. " +
        "Please try again tomorrow or purchase a full report."
      );
      return;
    }
    setStep("uploading");
    try {
      setStep("analyzing");
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/extract", { method: "POST", body: formData });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Upload failed");
      }
      const result = await response.json();
      setAnalysisResult(result);
      setSessionId(result.session_id);
      localStorage.setItem("recent_session", result.session_id);
      try {
        await storePDF(result.session_id, file);
        await deleteSession(`pending_${file.name}`);
      } catch (err) {
        console.error("[CustomerMode] Failed to store PDF:", err);
      }
      try {
        // Store encrypted text in sessionStorage
        const encryptedText = await encryptForSessionStorage(result.extracted_text, result.session_id);
        sessionStorage.setItem("enziu_vault", encryptedText);
        await storeEncryptedText(result.session_id, result.extracted_text);
      } catch (err) {
        console.error("[CustomerMode] Failed to store text:", err);
      }
      if (result.full_report) {
        try {
          // Store the plain report object — NOT re-wrapped — so getEncryptedFactSheet
          // returns it directly and unwrapFactSheet finds it immediately.
          await storeEncryptedFactSheet(result.session_id, result.full_report);
        } catch (err) {
          console.error("[CustomerMode] Failed to cache encrypted fact sheet:", err);
        }
      }
      setStep("sneak-peek");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      deleteSession(`pending_${file.name}`).catch(() => {});
      setReportError(message);
      setStep("idle");
      setTimeout(() => setReportError(null), 5000);
    }
  };

  // ── Payment & Report Generation ───────────────────────────────────────────

  const handlePaymentComplete = (code?: string) => {
    if (code) setVoucherCode(code);
    generateFullReport();
  };

  /** Store the unwrapped factSheet in the recovery vault (no envelope). */
  const saveRecoveryVault = async (sid: string, factSheet: any) => {
    if (!voucherCode) return;

    try {
      let normalizedFactSheet = factSheet;

      // HARD GUARANTEE:
      // recovery vault NEVER stores encrypted nested payloads
      if (
        normalizedFactSheet &&
        typeof normalizedFactSheet === "object" &&
        Array.isArray(normalizedFactSheet.salt) &&
        Array.isArray(normalizedFactSheet.iv) &&
        Array.isArray(normalizedFactSheet.ciphertext)
      ) {
        console.log("[saveRecoveryVault] Nested encrypted payload detected");

        const decrypted = await getEncryptedFactSheet(sid);

        if (!decrypted) {
          throw new Error("Failed to decrypt factSheet before vault storage");
        }

        normalizedFactSheet = decrypted;
      }

      console.log(
        "[saveRecoveryVault] Final factSheet keys:",
        Object.keys(normalizedFactSheet || {})
      );

      const sessionText = sessionStorage.getItem("enziu_vault");

      const extractedText = sessionText
        ? await decryptFromSessionStorage(sessionText, sid)
        : (await getEncryptedText(sid)) || "";

      const pdfBlob = await getPDF(sid);
      const pdfData = pdfBlob
        ? await blobToDataURL(pdfBlob)
        : undefined;

      await storeRecoveryVault(voucherCode, {
        factSheet: normalizedFactSheet,
        extractedText,
        sessionId: sid,
        pdfData,
      });

      console.log("[saveRecoveryVault] Recovery vault saved successfully");
    } catch (err) {
      console.error("[saveRecoveryVault] Failed:", err);
    }
  };

  const generateFullReport = async () => {
    if (!sessionId) { setStep("full-report"); return; }
    setIsGeneratingReport(true);
    setReportError(null);
    setStep("paid");

    try {
      // 1. Encrypted cache (instant access — stored during sneak peek)
      const rawEncrypted = await getEncryptedFactSheet(sessionId);
      if (rawEncrypted) {
        const factSheet = unwrapFactSheet(rawEncrypted);
        if (isValidFactSheet(factSheet)) {
          const result = convertFactSheetToResult(sessionId, factSheet);
          setFullReportResult(result);
          setStep("full-report");
          setIsGeneratingReport(false);
          await saveRecoveryVault(sessionId, factSheet);
          return;
        }
        console.warn("[CustomerMode] Encrypted cache had unexpected shape, falling through");
      }

      // 2. Unencrypted cache
      const existing = await getFactSheet(sessionId);
      if (existing) {
        const factSheet = unwrapFactSheet(existing);
        const result    = convertFactSheetToResult(sessionId, factSheet);
        setFullReportResult(result);
        setStep("full-report");
        setIsGeneratingReport(false);
        await saveRecoveryVault(sessionId, factSheet);
        return;
      }

      // 3. Cache miss — full audit via API
      const sessionText = sessionStorage.getItem("enziu_vault");
      const extractedText = sessionText
        ? await decryptFromSessionStorage(sessionText, sessionId)
        : (await getEncryptedText(sessionId));
      if (!extractedText)
        throw new Error("No extracted text found. Please re-upload your PDF.");

      const ac  = new AbortController();
      const tid = setTimeout(() => ac.abort(), 480_000);
      const auditResponse = await fetch("/api/policy/audit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_id: sessionId, extracted_text: extractedText }),
        signal:  ac.signal,
      });
      clearTimeout(tid);
      if (!auditResponse.ok)
        throw new Error(`Audit failed: ${auditResponse.status}`);

      const auditResult = await auditResponse.json();
      const factSheet   = unwrapFactSheet(auditResult.report);
      if (!factSheet) throw new Error("No fact sheet data received from audit");

      await storeFactSheet(sessionId, factSheet);
      const result = convertFactSheetToResult(sessionId, factSheet);
      setFullReportResult(result);
      setStep("full-report");
      await saveRecoveryVault(sessionId, factSheet);

    } catch (error) {
      if (sessionId) {
        deleteSession(sessionId).catch(console.error);
        sessionStorage.removeItem("enziu_vault");
      }
      const errorMessage =
        error instanceof Error
          ? error.name === "AbortError" || error.message.includes("aborted")
            ? "Analysis timed out. Please try again."
            : error.message
          : "Failed to generate analysis";
      setReportError(errorMessage);
      setStep("full-report");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // ── Reset ──────────────────────────────────────────────────────────────────

  const handleReset = () => {
    if (sessionId) deleteSession(sessionId).catch(console.error);
    localStorage.removeItem("recent_session");
    localStorage.removeItem("enziu_payment");
    sessionStorage.removeItem("enziu_vault");
    setStep("idle");
    setAnalysisResult(null);
    setFullReportResult(null);
    setSessionId(null);
    setRecoveredPdfData(undefined);
    setDeepDivePage(undefined);
    setIsGeneratingReport(false);
    setReportError(null);
  };

  // ── Voucher Recovery ───────────────────────────────────────────────────────

  const handleVoucherRecovery = async (data: RecoveryVaultData) => {
    console.log('[CustomerMode] handleVoucherRecovery called with:');
    console.log('  - sessionId:', data.sessionId);
    console.log('  - extractedText length:', data.extractedText?.length);
    console.log('  - pdfData present:', !!data.pdfData);
    console.log('  - factSheet type:', typeof data.factSheet);
    console.log('  - factSheet keys:', data.factSheet && !Array.isArray(data.factSheet) && typeof data.factSheet === 'object' && 'salt' in data.factSheet ? 'encrypted payload' : Object.keys(data.factSheet as any || {}));
    console.log('  - factSheet has grade:', data.factSheet && typeof data.factSheet === 'object' && !Array.isArray(data.factSheet) && !('salt' in data.factSheet) && (data.factSheet as any).grade ? 'yes' : 'no');
    console.log('  - factSheet has red_flags:', data.factSheet && typeof data.factSheet === 'object' && !Array.isArray(data.factSheet) && !('salt' in data.factSheet) && Array.isArray((data.factSheet as any).red_flags) ? 'yes' : 'no');
    console.log('  - factSheet has overall:', data.factSheet && typeof data.factSheet === 'object' && !Array.isArray(data.factSheet) && !('salt' in data.factSheet) && (data.factSheet as any).grade?.overall ? 'yes' : 'no');

    setSessionId(data.sessionId);
    // Store encrypted text in sessionStorage - handle null case
    const textToEncrypt = data.extractedText || "";
    const encryptedText = await encryptForSessionStorage(textToEncrypt, data.sessionId);
    sessionStorage.setItem("enziu_vault", encryptedText);
    storeEncryptedText(data.sessionId, textToEncrypt).catch(console.error);
    if (data.pdfData) setRecoveredPdfData(data.pdfData);

    console.log('[CustomerMode] Calling unwrapFactSheet...');
    const factSheet = unwrapFactSheet(data.factSheet);
    console.log('[CustomerMode] After unwrapFactSheet:');
    console.log('  - factSheet type:', typeof factSheet);
    console.log('  - factSheet keys:', factSheet ? Object.keys(factSheet) : 'null');
    console.log('  - factSheet has grade:', factSheet?.grade ? 'yes' : 'no');
    console.log('  - factSheet has red_flags:', Array.isArray(factSheet?.red_flags) ? 'yes' : 'no');

    console.log('[CustomerMode] Calling isValidFactSheet...');
    const isValid = isValidFactSheet(factSheet);
    console.log('[CustomerMode] isValidFactSheet result:', isValid);

    if (!isValid) {
      console.error(
        "[CustomerMode] Recovery factSheet failed shape check. Keys:",
        factSheet && typeof factSheet === "object"
          ? Object.keys(factSheet)
          : typeof factSheet,
      );
      setReportError(
        "Could not read the recovered report. The data may be corrupted. " +
        "Please re-upload your policy PDF to generate a fresh report.",
      );
      setStep("idle");
      return;
    }

    try {
      const result = convertFactSheetToResult(data.sessionId, factSheet);
      setFullReportResult(result);
      setStep("full-report");
    } catch (err) {
      console.error("[CustomerMode] convertFactSheetToResult failed during recovery:", err);
      setReportError("Failed to parse the recovered report. Please re-upload your policy.");
      setStep("idle");
    }
  };

  useEffect(() => {
    window.addEventListener("enziu-reset", handleReset);
    return () => window.removeEventListener("enziu-reset", handleReset);
  }, []);

  const shouldHideToggle = [
    "uploading", "analyzing", "sneak-peek", "paid", "full-report",
  ].includes(step);

  useEffect(() => {
    const hide = shouldHideToggle;
    window.dispatchEvent(new CustomEvent("enziu-hide-toggle", { detail: { hide } }));
    window.dispatchEvent(new CustomEvent("enziu-hide-footer", { detail: { hide } }));
    return () => {
      window.dispatchEvent(new CustomEvent("enziu-hide-toggle", { detail: { hide: false } }));
      window.dispatchEvent(new CustomEvent("enziu-hide-footer", { detail: { hide: false } }));
    };
  }, [step]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto">
      <AnimatePresence mode="wait">

        {step === "idle" && (
          <motion.div key="idle" {...fadeInUp} className="text-center py-16">
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
          <motion.div key="recovery" {...fadeInUp} className="py-16">
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
          <motion.div key="sneak-peek" {...fadeInUp} className="py-8">
            <SneakPeekBento result={analysisResult} />
            {!isNaGrade(analysisResult.grade.overall) && (
              <div className="mt-8 text-center">
                <PaddleCheckout
                  amount={4.99}
                  sessionId={sessionId || ""}
                  onPaymentComplete={handlePaymentComplete}
                />
              </div>
            )}
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
          <motion.div key="full-report" {...fadeInUp} className="py-8">
            {/*
              FullReport owns the sticky PDF viewer.
              It listens for "enziu-highlight" events dispatched by DeepDiveQuestions
              so clicking a Q&A card navigates and highlights the PDF automatically.
            */}
            <FullReport
              result={fullReportResult || analysisResult}
              pdfData={recoveredPdfData}
              isGenerating={isGeneratingReport}
              sessionId={sessionId || undefined}
              voucherCode={voucherCode || undefined}
            />

            {/*
              DeepDiveQuestions renders the Policy Q&A tab (insight_cards only).
              onPageClick fires the "enziu-highlight" custom event internally, which
              FullReport's useEffect picks up to sync its PDFViewer.  We also store
              the page in deepDivePage so the parent knows where the viewer is.
            */}
            <DeepDiveQuestions
              sessionId={sessionId || ""}
              insightCards={(fullReportResult || analysisResult)?.insight_cards}
              onPageClick={(page) => setDeepDivePage(page)}
            />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}