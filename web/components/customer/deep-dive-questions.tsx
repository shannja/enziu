"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Lightbulb, ShieldAlert, PiggyBank, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InsightCard as InsightCardType } from "@/types";

interface DeepDiveQuestionsProps {
  sessionId: string;
  insightCards?: InsightCardType[];
  onPageClick?: (page: number) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  risk:       <ShieldAlert className="w-4 h-4 text-brand-grade-f" />,
  savings:    <PiggyBank   className="w-4 h-4 text-brand-grade-a" />,
  action:     <TrendingUp  className="w-4 h-4 text-brand-amber" />,
  comparison: <Info        className="w-4 h-4 text-brand-blue" />,
  explain:    <Lightbulb   className="w-4 h-4 text-brand-amber" />,
};

const categoryColors: Record<string, string> = {
  risk:       "border-brand-grade-f/30 bg-brand-grade-f/5",
  savings:    "border-brand-grade-a/30 bg-brand-grade-a/5",
  action:     "border-brand-amber/30 bg-brand-amber/5",
  comparison: "border-brand-blue/30 bg-brand-blue/5",
  explain:    "border-brand-amber/30 bg-brand-amber/5",
};

export function DeepDiveQuestions({
  sessionId,
  insightCards,
  onPageClick,
}: DeepDiveQuestionsProps) {
  if (!insightCards || insightCards.length === 0) {
    return (
      <Card className="border-border bg-card/50 mt-8">
        <CardHeader>
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-amber" />
            Policy Q&amp;A
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>Generate a full report to see common questions answered.</p>
            <p className="text-sm mt-1">Each answer is anchored to a page in your policy.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...insightCards].sort((a, b) => a.priority - b.priority);

  /**
   * Navigate using excerpt only — no page number fallback.
   * PDFViewer's cross-page search will find the correct page automatically,
   * avoiding cover-page / TOC offset issues.
   */
  const handleCardClick = (card: InsightCardType) => {
    const excerpt = card.excerpt?.trim();
    if (!excerpt) return;

    // Pass page as hint only if we have one; PDFViewer will search all pages anyway.
    onPageClick?.(card.page ?? 1);

    window.dispatchEvent(
      new CustomEvent("enziu-highlight", {
        detail: {
          page:    card.page ?? 1,
          excerpt,
        },
      }),
    );
  };

  return (
    <Card className="border-border bg-card/50 mt-8">
      <CardHeader>
        <CardTitle className="text-lg text-foreground flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-brand-amber" />
            Common Questions
          </span>
          <span className="text-sm text-muted-foreground">{sorted.length} questions</span>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sorted.map((card, index) => {
            const hasExcerpt = !!card.excerpt?.trim();

            return (
              <button
                key={index}
                onClick={() => handleCardClick(card)}
                disabled={!hasExcerpt}
                className={cn(
                  "text-left border rounded-lg p-4 transition-all duration-200 h-full",
                  categoryColors[card.category] || "border-border bg-card/50",
                  hasExcerpt
                    ? "cursor-pointer hover:scale-[1.02] hover:shadow-md"
                    : "cursor-default",
                )}
              >
                <div className="flex flex-col items-start justify-start gap-3 w-full h-full">

                  {/* Category icon + label */}
                  <div className="flex items-center gap-1.5">
                    <span>{categoryIcons[card.category] || <Info className="w-4 h-4" />}</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {card.category}
                    </span>
                  </div>

                  {/* Question + answer */}
                  <div className="space-y-2 flex-grow">
                    <p className="text-sm text-foreground leading-snug line-clamp-2">
                      {card.question}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                      {card.answer}
                    </p>
                  </div>

                  {/* Verbatim excerpt for context */}
                  {card.excerpt && (
                    <blockquote className="w-full text-xs text-muted-foreground italic border-l-2 border-brand-amber pl-2 line-clamp-2">
                      &ldquo;{card.excerpt}&rdquo;
                    </blockquote>
                  )}

                  {/* Navigate to excerpt badge — no page number shown */}
                  {hasExcerpt && (
                    <span className="mt-auto inline-flex items-center gap-1 text-xs text-brand-amber bg-brand-amber/10 px-2 py-0.5 rounded hover:bg-brand-amber/20 transition-colors">
                      <FileText className="w-3 h-3" />
                      Navigate to Excerpt
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-center text-muted-foreground mt-6">
          ENZIU provides analysis, not legal advice. Each answer cites a specific page in your policy.
        </p>
      </CardContent>
    </Card>
  );
}