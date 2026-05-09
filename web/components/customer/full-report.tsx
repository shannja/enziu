"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, FileText, ExternalLink,
  Loader2, ShieldAlert, PiggyBank, TrendingUp, Info, Lightbulb, Copy, Check,
} from "lucide-react";
import { cn, getGradeColor } from "@/lib/utils";
import type { AnalysisResult, InsightCard as InsightCardType } from "@/types";
import { PDFViewer } from "./pdf-viewer";
import { getPDF, blobToDataURL } from "@/lib/pdf-storage";

// ─── Constants ───────────────────────────────────────────────────────────────

// These structural flags produce noisy plain_english strings that are
// meaningless to a policyholder — the actual issue is already captured
// by the scoring deduction, so we hide the card-level duplicate.
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

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  risk:       <ShieldAlert className="w-4 h-4 text-brand-grade-f" />,
  savings:    <PiggyBank   className="w-4 h-4 text-brand-grade-a" />,
  action:     <TrendingUp  className="w-4 h-4 text-brand-amber" />,
  comparison: <Info        className="w-4 h-4 text-brand-blue" />,
  explain:    <Lightbulb   className="w-4 h-4 text-brand-amber" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  risk:       "border-brand-grade-f/30 bg-brand-grade-f/5 hover:bg-brand-grade-f/10",
  savings:    "border-brand-grade-a/30 bg-brand-grade-a/5 hover:bg-brand-grade-a/10",
  action:     "border-brand-amber/30 bg-brand-amber/5 hover:bg-brand-amber/10",
  comparison: "border-brand-blue/30 bg-brand-blue/5 hover:bg-brand-blue/10",
  explain:    "border-brand-amber/30 bg-brand-amber/5 hover:bg-brand-amber/10",
};

// ─── Shared util ─────────────────────────────────────────────────────────────

function fireHighlight(page: number, excerpt?: string) {
  window.dispatchEvent(
    new CustomEvent("enziu-highlight", { detail: { page, excerpt } }),
  );
}

function gradeToPercentage(grade: string): number {
  const map: Record<string, number> = {
    "A+": 95, A: 84, "B+": 77, B: 72, "C+": 67, C: 62, D: 54, F: 25,
  };
  return map[grade] ?? 50;
}

// ─── ScoreBar ─────────────────────────────────────────────────────────────────

function ScoreBar({ label, grade, description }: { label: string; grade: string; description: string }) {
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
// Source: red_flags[]
// What it is: a scored finding that *deducted points* from the policy grade.
// Fields used: severity, plain_english (the risk description), excerpt
//   (verbatim clause from the policy), legal_basis, page.
// Citation: clicks highlight the exact excerpt in the PDF viewer.
// Distinct from exclusions (coverage gaps) and insight cards (Q&A).

function RedFlagItem({ flag, onCite }: { flag: any; onCite: (page: number, excerpt?: string) => void }) {
  const hasCitation = flag.page != null && flag.page > 0;
  return (
    <div className="border border-border rounded-lg p-3 bg-secondary/20 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground leading-snug flex-1">
          {flag.plain_english}
        </p>
        {flag.severity && (
          <span className={cn("text-xs px-2 py-0.5 rounded shrink-0", SEVERITY_BADGE[flag.severity])}>
            {flag.severity.toUpperCase()}
          </span>
        )}
      </div>

      {/* Verbatim clause text — this is what the PDF viewer highlights */}
      {flag.excerpt && (
        <blockquote className="text-xs text-muted-foreground italic border-l-2 border-brand-amber pl-2 line-clamp-3">
          &ldquo;{flag.excerpt}&rdquo;
        </blockquote>
      )}

      {flag.legal_basis && (
        <p className="text-xs text-muted-foreground">Legal basis: {flag.legal_basis}</p>
      )}

      {hasCitation && (
        <button
          onClick={() => { onCite(flag.page, flag.excerpt ?? undefined); fireHighlight(flag.page, flag.excerpt ?? undefined); }}
          className="inline-flex items-center gap-1 text-xs text-gradient hover:underline"
        >
          <FileText className="w-3 h-3" />
          Page {flag.page}
          <ExternalLink className="w-3 h-3 opacity-50" />
        </button>
      )}
    </div>
  );
}

// ─── ExclusionItem ────────────────────────────────────────────────────────────
// Source: exclusions[]
// What it is: a category of events or conditions the policy does NOT cover.
// Fields used: type (exclusion name), summary (plain-English description),
//   page, risk_level, excerpt (verbatim clause text).
// Citation: clicks highlight the exact excerpt in the PDF viewer.
// Distinct from red flags (which penalise the score) and clauses (procedural rules).

function ExclusionItem({ exclusion, onCite }: { exclusion: any; onCite: (page: number, excerpt?: string) => void }) {
  const hasCitation = exclusion.page != null && exclusion.page > 0;
  return (
    <div className="border border-border rounded-lg p-4 bg-secondary/20 space-y-2">
      <div className="flex items-start justify-between mb-2">
        <span className="font-medium text-foreground">{exclusion.type}</span>
        {exclusion.risk_level && (
          <span className={cn("text-xs px-2 py-1 rounded", RISK_BADGE[exclusion.risk_level])}>
            {exclusion.risk_level.toUpperCase()}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{exclusion.summary}</p>

      {/* Verbatim clause text — this is what the PDF viewer highlights */}
      {exclusion.excerpt && (
        <blockquote className="text-xs text-muted-foreground italic border-l-2 border-brand-amber pl-2 line-clamp-3">
          &ldquo;{exclusion.excerpt}&rdquo;
        </blockquote>
      )}

      {hasCitation && (
        <button
          onClick={() => { onCite(exclusion.page, exclusion.excerpt ?? undefined); fireHighlight(exclusion.page, exclusion.excerpt ?? undefined); }}
          className="inline-flex items-center gap-1 text-xs text-gradient hover:underline"
        >
          <FileText className="w-3 h-3" />
          Page {exclusion.page}
          <ExternalLink className="w-3 h-3 opacity-50" />
        </button>
      )}
    </div>
  );
}

// ─── InsightCardItem ──────────────────────────────────────────────────────────
// Source: insight_cards[]
// What it is: a Q&A card answering a real question a policyholder would ask
//   ("Am I covered if…?", "What happens when…?").
// Fields used: question, answer, category, priority, page, excerpt
//   (verbatim policy text backing the answer).
// Citation: clicks highlight the exact excerpt in the PDF viewer.
// Distinct from red flags (scoring deductions) and exclusions (coverage gaps).
// These explain implications; the others report problems.

function InsightCardItem({ card, onCite }: { card: InsightCardType; onCite: (page: number, excerpt?: string) => void }) {
  const hasCitation = card.page != null && card.page > 0;
  return (
    <div className={cn(
      "border rounded-lg p-4 flex flex-col gap-3 transition-colors duration-200",
      CATEGORY_COLORS[card.category] ?? "border-border bg-card/50",
    )}>
      <div className="flex items-center gap-1.5">
        {CATEGORY_ICON[card.category] ?? <Info className="w-4 h-4" />}
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {card.category}
        </span>
      </div>

      <div className="space-y-1.5 flex-1">
        <p className="text-sm font-medium text-foreground leading-snug">{card.question}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{card.answer}</p>
      </div>

      {/* Verbatim policy text that backs the answer — highlighted in the PDF */}
      {card.excerpt && (
        <blockquote className="text-xs text-muted-foreground italic border-l-2 border-brand-amber pl-2 line-clamp-2">
          &ldquo;{card.excerpt}&rdquo;
        </blockquote>
      )}

      {hasCitation && (
        <button
          onClick={() => { onCite(card.page!, card.excerpt ?? undefined); fireHighlight(card.page!, card.excerpt ?? undefined); }}
          className="mt-auto self-start inline-flex items-center gap-1 text-xs text-brand-amber bg-brand-amber/10 px-2 py-0.5 rounded hover:bg-brand-amber/20 transition-colors"
        >
          <FileText className="w-3 h-3" />
          Page {card.page}
        </button>
      )}
    </div>
  );
}

// ─── FullReport ───────────────────────────────────────────────────────────────

export function FullReport({
  result,
  pdfData: propPdfData,
  isGenerating = false,
  sessionId,
  voucherCode,
}: { result: AnalysisResult | null; pdfData?: string; isGenerating?: boolean; sessionId?: string; voucherCode?: string }) {
  if (!result) {
    return <div className="text-center py-8 text-muted-foreground"><p>No report data available.</p></div>;
  }

  const { grade, detailedFlags, exclusions, insight_cards } = result;

  const [highlightPage, setHighlightPage]       = useState<number | undefined>();
  const [highlightExcerpt, setHighlightExcerpt] = useState<string | undefined>();
  const [pdfPage, setPdfPage]                   = useState<number | undefined>();
  const [pdfData, setPdfData]                   = useState<string | undefined>(propPdfData);
  const [isLoadingPdf, setIsLoadingPdf]         = useState(false);
  const [copyFeedback, setCopyFeedback]         = useState(false);

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

  // Citation with excerpt → navigate + highlight verbatim text
  const handleCite = (page: number, excerpt?: string) => {
    setHighlightPage(page);
    setHighlightExcerpt(excerpt);
    setPdfPage(page);
  };

  const filteredFlags   = detailedFlags?.filter((f) => !NOISE_FLAGS.includes(f.plain_english)) ?? [];
  const validExclusions = exclusions?.filter((e) => e.type && e.summary && e.page > 0) ?? [];
  const sortedInsights  = [...(insight_cards ?? [])].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Your Full ENZIU Report</h2>
        <p className="text-sm text-muted-foreground">
          Click any page citation to jump there. Excerpts are highlighted in yellow.
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

        {/* RIGHT — scores, flags, voucher, exclusions, clauses */}
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
                <ScoreBar label="Clarity"          grade={grade.clarity}          description="How easy is the policy to understand?" />
                <ScoreBar label="Coverage"         grade={grade.coverage}         description="How comprehensive is the protection?" />
                <ScoreBar label="Claims Efficiency" grade={grade.claimsEfficiency} description="How smooth is the claims process?" />
              </div>
            </CardContent>
          </Card>

          {/* Red Flags — scored findings that penalised the grade; citable via excerpt */}
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
                  <RedFlagItem key={i} flag={flag} onCite={handleCite} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Voucher Code */}
          {voucherCode && (
            <Card className="border-brand-amber/30 bg-brand-amber/5">
              <CardContent className="pt-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Your voucher code</p>
                  <p className="text-lg font-mono font-bold text-brand-amber tracking-widest">
                    {voucherCode}
                  </p>
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(voucherCode); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); }}
                  className="p-2 rounded-lg bg-brand-amber/20 hover:bg-brand-amber/30 transition-colors"
                >
                  {copyFeedback ? <Check className="w-4 h-4 text-brand-amber" /> : <Copy className="w-4 h-4 text-brand-amber" />}
                </button>
              </CardContent>
            </Card>
          )}

          {/* Material Exclusions — what the policy does NOT cover; citable via excerpt */}
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
                  <ExclusionItem key={i} exclusion={exclusion} onCite={handleCite} />
                ))}
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {/* Full-width bottom: Insight Cards */}
      {/* Q&A answering "what does this mean for me?" — backed by verbatim excerpts */}
      {sortedInsights.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-gradient" />
            <h3 className="text-lg font-semibold text-foreground">
              Key Insights ({sortedInsights.length})
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Each answer cites a specific page and verbatim clause. Click the page badge to jump there and highlight the supporting text.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3">
            {sortedInsights.map((card, i) => (
              <InsightCardItem key={i} card={card} onCite={handleCite} />
            ))}
          </div>
          <p className="text-xs text-center text-muted-foreground pt-2">
            ENZIU provides analysis, not legal advice. All insights cite specific pages in your policy.
          </p>
        </div>
      )}

    </div>
  );
}