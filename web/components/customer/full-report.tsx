"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, FileText,
  Loader2, Copy, Check,
} from "lucide-react";
import { cn, getGradeColor } from "@/lib/utils";
import type { AnalysisResult } from "@/types";
import { PDFViewer } from "./pdf-viewer";
import { getPDF, blobToDataURL } from "@/lib/pdf-storage";

// ─── Constants ───────────────────────────────────────────────────────────────

const NOISE_FLAGS = [
  "No internal appeal process",
  "No waiting period stated",
  "No grace period stated",
];

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-brand-grade-f/20 text-brand-grade-f",
  major:    "bg-brand-grade-d/20 text-brand-grade-d",
  minor:    "bg-brand-grade-c/20 text-brand-grade-c",
};

const RISK_BADGE: Record<string, string> = {
  high:   "bg-brand-grade-f/20 text-brand-grade-f",
  medium: "bg-brand-grade-d/20 text-brand-grade-d",
  low:    "bg-brand-grade-c/20 text-brand-grade-c",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fire an enziu-highlight event. Uses excerpt-driven navigation so PDFViewer
 * searches all pages for the text — avoiding cover-page / TOC offset issues.
 * page is passed as a hint only; PDFViewer will still scan all pages.
 */
function fireHighlight(excerpt: string, page?: number) {
  window.dispatchEvent(
    new CustomEvent("enziu-highlight", {
      detail: { page: page ?? 1, excerpt },
    }),
  );
}

function gradeToPercentage(grade: string): number {
  const map: Record<string, number> = {
    "A+": 95, A: 84, "B+": 77, B: 72, "C+": 67, C: 62, D: 54, F: 25,
  };
  return map[grade] ?? 50;
}

/** Strip "WARNING:" prefix the LLM sometimes adds despite prompt instructions. */
function stripWarningPrefix(text: string): string {
  return text.replace(/^WARNING:\s*/i, "").trim();
}

// ─── ScoreBar ─────────────────────────────────────────────────────────────────

function ScoreBar({
  label,
  grade,
  description,
}: {
  label: string;
  grade: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-white">{label}</span>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className={cn("text-lg font-bold", getGradeColor(grade))}>{grade}</span>
      </div>
      <Progress value={gradeToPercentage(grade)} className="h-2" />
    </div>
  );
}

// ─── RedFlagItem ──────────────────────────────────────────────────────────────

function RedFlagItem({ flag }: { flag: any }) {
  const hasExcerpt = flag.excerpt != null && flag.excerpt.length > 0;
  const plainEnglish = stripWarningPrefix(flag.plain_english ?? "");

  const handleClick = () => {
    if (!hasExcerpt) return;
    fireHighlight(flag.excerpt, flag.page ?? undefined);
  };

  return (
    <button
      onClick={handleClick}
      disabled={!hasExcerpt}
      className={cn(
        "w-full text-left border rounded-lg p-4 transition-all duration-200 space-y-3",
        "bg-secondary/20",
        hasExcerpt
          ? "cursor-pointer hover:scale-[1.02] hover:shadow-md border-brand-grade-f/30"
          : "cursor-default border-border",
      )}
    >
      {/* Severity badge */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground leading-snug flex-1">
          {plainEnglish}
        </p>
        {flag.severity && (
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded shrink-0",
              SEVERITY_BADGE[flag.severity],
            )}
          >
            {flag.severity.toUpperCase()}
          </span>
        )}
      </div>

      {/* Excerpt */}
      {flag.excerpt && (
        <blockquote className="w-full text-xs text-muted-foreground italic border-l-2 border-brand-amber pl-2 line-clamp-3">
          &ldquo;{flag.excerpt}&rdquo;
        </blockquote>
      )}

      {/* Legal basis */}
      {flag.legal_basis && (
        <p className="text-xs text-muted-foreground">Legal basis: {flag.legal_basis}</p>
      )}

      {/* Navigate to excerpt badge — no page number shown */}
      {hasExcerpt && (
        <span className="inline-flex items-center gap-1 text-xs text-brand-amber bg-brand-amber/10 px-2 py-0.5 rounded">
          <FileText className="w-3 h-3" />
          Navigate to Excerpt
        </span>
      )}
    </button>
  );
}

// ─── ExclusionItem ────────────────────────────────────────────────────────────
//
// Exclusions from the Auditor schema include a `page` field but no `excerpt`.
// We support excerpt if it is ever added upstream, and fall back to page-only
// navigation (fireHighlight with no excerpt) so the viewer at least jumps to
// the correct page even without text highlighting.

function ExclusionItem({ exclusion }: { exclusion: any }) {
  const hasExcerpt = exclusion.excerpt != null && exclusion.excerpt.length > 0;
  // An exclusion is navigable if it has an excerpt OR a valid page number.
  const hasPage = exclusion.page != null && exclusion.page > 0;
  const isNavigable = hasExcerpt || hasPage;

  const handleClick = () => {
    if (!isNavigable) return;
    if (hasExcerpt) {
      fireHighlight(exclusion.excerpt, exclusion.page ?? undefined);
    } else {
      // No excerpt — jump to the page using a fragment of the exclusion type
      // as a best-effort search hint.
      fireHighlight(exclusion.type ?? "", exclusion.page);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={!isNavigable}
      className={cn(
        "w-full text-left border rounded-lg p-4 transition-all duration-200 space-y-3",
        "bg-secondary/20",
        isNavigable
          ? "cursor-pointer hover:scale-[1.02] hover:shadow-md border-brand-grade-d/30"
          : "cursor-default border-border",
      )}
    >
      {/* Type + Risk level badge */}
      <div className="flex items-start justify-between mb-2">
        <span className="font-medium text-foreground">{exclusion.type}</span>
        {exclusion.risk_level && (
          <span
            className={cn("text-xs px-2 py-1 rounded", RISK_BADGE[exclusion.risk_level])}
          >
            {exclusion.risk_level.toUpperCase()}
          </span>
        )}
      </div>

      {/* Summary */}
      <p className="text-sm text-muted-foreground">{exclusion.summary}</p>

      {/* Excerpt (if present) */}
      {hasExcerpt && (
        <blockquote className="w-full text-xs text-muted-foreground italic border-l-2 border-brand-amber pl-2 line-clamp-3">
          &ldquo;{exclusion.excerpt}&rdquo;
        </blockquote>
      )}

      {/* Navigate badge — no page number shown */}
      {isNavigable && (
        <span className="inline-flex items-center gap-1 text-xs text-brand-amber bg-brand-amber/10 px-2 py-0.5 rounded">
          <FileText className="w-3 h-3" />
          Navigate to Excerpt
        </span>
      )}
    </button>
  );
}

// ─── FullReport ───────────────────────────────────────────────────────────────

export function FullReport({
  result,
  pdfData: propPdfData,
  isGenerating = false,
  sessionId,
  voucherCode,
}: {
  result: AnalysisResult | null;
  pdfData?: string;
  isGenerating?: boolean;
  sessionId?: string;
  voucherCode?: string;
}) {
  if (!result) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No report data available.</p>
      </div>
    );
  }

  const { grade, detailedFlags, exclusions } = result;

  const [highlightPage, setHighlightPage]         = useState<number | undefined>();
  const [highlightExcerpt, setHighlightExcerpt]   = useState<string | undefined>();
  const [pdfPage, setPdfPage]                     = useState<number | undefined>();
  const [pdfData, setPdfData]                     = useState<string | undefined>(propPdfData);
  const [isLoadingPdf, setIsLoadingPdf]           = useState(false);
  const [copyFeedback, setCopyFeedback]           = useState(false);

  // Listen for highlight events fired by external components (e.g. DeepDiveQuestions)
  useEffect(() => {
    const handle = (e: CustomEvent<{ page: number; excerpt?: string }>) => {
      setHighlightPage(e.detail.page);
      setHighlightExcerpt(e.detail.excerpt);
      setPdfPage(e.detail.page);
    };
    window.addEventListener("enziu-highlight", handle as EventListener);
    return () => window.removeEventListener("enziu-highlight", handle as EventListener);
  }, []);

  useEffect(() => {
    const load = async () => {
      if (propPdfData) { setPdfData(propPdfData); return; }
      setIsLoadingPdf(true);
      try {
        const sid = sessionId || localStorage.getItem("recent_session");
        if (sid) {
          const blob = await getPDF(sid);
          if (blob) setPdfData(await blobToDataURL(blob));
        }
      } catch (err) {
        console.error("[FullReport] PDF load failed:", err);
      } finally {
        setIsLoadingPdf(false);
      }
    };
    load();
  }, [propPdfData, sessionId]);

  const filteredFlags   = detailedFlags?.filter(
    (f) => !NOISE_FLAGS.includes(stripWarningPrefix(f.plain_english ?? "")),
  ) ?? [];

  const validExclusions = exclusions?.filter(
    (e) => e.type && e.summary && e.page > 0,
  ) ?? [];

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Your Full ENZIU Report</h2>
        <p className="text-sm text-muted-foreground">
          Click any item to navigate to its excerpt in the policy.
        </p>
        {isGenerating && (
          <div className="flex items-center gap-2 mt-2 text-gradient text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating detailed analysis…
          </div>
        )}
        {isLoadingPdf && (
          <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading PDF…
          </div>
        )}
      </div>

      {/* Two-column: PDF left | Report right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* LEFT — sticky PDF viewer */}
        <div className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
          <PDFViewer
            pdfData={pdfData}
            currentPage={highlightPage ?? pdfPage}
            highlightExcerpt={highlightExcerpt}
            onPageChange={setPdfPage}
          />
        </div>

        {/* RIGHT — scores, flags, exclusions */}
        <div className="space-y-6 min-w-0">

          {/* ENZIU Index Scores */}
          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-lg text-gradient">ENZIU Index Scores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center py-4">
                <div className={cn("text-7xl font-bold mb-2", getGradeColor(grade.overall))}>
                  {grade.overall}
                </div>
                <p className="text-muted-foreground">Overall Policy Grade</p>
              </div>
              <div className="space-y-4">
                <ScoreBar
                  label="Clarity"
                  grade={grade.clarity}
                  description="How easy is the policy to understand?"
                />
                <ScoreBar
                  label="Coverage"
                  grade={grade.coverage}
                  description="How comprehensive is the protection?"
                />
                <ScoreBar
                  label="Claims Efficiency"
                  grade={grade.claimsEfficiency}
                  description="How smooth is the claims process?"
                />
              </div>
            </CardContent>
          </Card>

          {/* Red Flags */}
          {filteredFlags.length > 0 && (
            <Card className="border-border bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg text-foreground flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-brand-grade-f" />
                  Red Flags ({filteredFlags.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {filteredFlags.map((flag, i) => (
                  <RedFlagItem key={i} flag={flag} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Material Exclusions */}
          {validExclusions.length > 0 && (
            <Card className="border-border bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg text-foreground flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-brand-grade-d" />
                  Material Exclusions ({validExclusions.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {validExclusions.map((exclusion, i) => (
                  <ExclusionItem key={i} exclusion={exclusion} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}