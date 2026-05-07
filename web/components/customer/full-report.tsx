"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, FileText, ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { cn, getGradeColor } from "@/lib/utils";
import type { AnalysisResult, Clause } from "@/types";
import { PDFViewer } from "./pdf-viewer";
import { getPDF, blobToDataURL } from "@/lib/pdf-storage";

interface FullReportProps {
  result: AnalysisResult | null;
  pdfData?: string; // Base64 encoded PDF from localStorage
  isGenerating?: boolean; // Show loading state while generating
  sessionId?: string; // Session ID for PDF retrieval from IndexedDB
}

export function FullReport({ result, pdfData: propPdfData, isGenerating = false, sessionId }: FullReportProps) {
  if (!result) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No report data available.</p>
      </div>
    );
  }

  const { grade, detailedFlags, clauses, summary } = result;
  const [selectedPage, setSelectedPage] = useState<number | undefined>(undefined);
  const [highlightExcerpt, setHighlightExcerpt] = useState<string | undefined>(undefined);
  const [highlightPage, setHighlightPage] = useState<number | undefined>(undefined);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfData, setPdfData] = useState<string | undefined>(propPdfData);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  // Listen for highlight events from Deep Dive chat
  useEffect(() => {
    const handleHighlight = (event: CustomEvent<{ page: number; excerpt: string }>) => {
      setHighlightPage(event.detail.page);
      setHighlightExcerpt(event.detail.excerpt);
      setSelectedPage(event.detail.page);
      setShowPdfViewer(true);
    };
    window.addEventListener("enziu-highlight", handleHighlight as EventListener);
    return () => window.removeEventListener("enziu-highlight", handleHighlight as EventListener);
  }, []);

  // Retrieve PDF from IndexedDB on mount
  useEffect(() => {
    const loadPDF = async () => {
      if (propPdfData) {
        setPdfData(propPdfData);
        setShowPdfViewer(true);
        return;
      }

      // Try to load from IndexedDB using session ID
      setIsLoadingPdf(true);
      try {
        // Try IndexedDB with session ID (preferred)
        const sessionToUse = sessionId || localStorage.getItem("recent_session");
        if (sessionToUse) {
          const blob = await getPDF(sessionToUse);
          if (blob) {
            const dataUrl = await blobToDataURL(blob);
            setPdfData(dataUrl);
            setShowPdfViewer(true);
          }
        }
      } catch (err) {
        console.error("Failed to load PDF from storage:", err);
      } finally {
        setIsLoadingPdf(false);
      }
    };

    loadPDF();
  }, [propPdfData, sessionId]);

  const handlePageClick = (page: number) => {
    setSelectedPage(page);
    setShowPdfViewer(true);
  };

  return (
    <div className="space-y-8">
      {/* PDF Viewer Toggle — always visible so user can show/hide */}
      <div className="flex items-center justify-between">
        <div className="text-left mb-8 flex-1">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Your Full ENZIU Report
          </h2>
          <p className="text-muted-foreground">
            Every answer anchored to a page number. Click citations to view the PDF.
          </p>
          {isGenerating && (
            <div className="flex items-center justify-center gap-2 mt-2 text-gradient text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating detailed analysis...
            </div>
          )}
        </div>
        <button
          onClick={() => setShowPdfViewer(!showPdfViewer)}
          className="ml-4 px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FileText className="w-4 h-4" />
          {showPdfViewer ? "Hide PDF" : "Show PDF"}
        </button>
      </div>

      {/* Loading state for PDF */}
      {isLoadingPdf && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading PDF...
        </div>
      )}

      {/* Split View: PDF + Report */}
      <div className={cn(
        "grid gap-2 transition-all duration-300",
        showPdfViewer ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
      )}>
        {/* PDF Viewer - Sticky on desktop */}
        {showPdfViewer && (
          <div className="lg:sticky lg:top-24 lg:self-start lg:h-[calc(100vh-8rem)]">
            <PDFViewer
              pdfData={pdfData}
              currentPage={highlightPage || selectedPage}
              highlightExcerpt={highlightExcerpt}
              onPageChange={setSelectedPage}
            />
          </div>
        )}

        {/* Report Content */}
        <div className={cn(showPdfViewer && "lg:pl-4")}>
          <div className="space-y-6">
          {/* ENZIU Index Scores */}
          <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg text-gradient flex items-left gap-2">
            ENZIU Index Scores
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Overall Grade */}
          <div className="text-center py-4">
            <div
              className={cn(
                "text-7xl font-bold mb-2",
                getGradeColor(grade.overall)
              )}
            >
              {grade.overall}
            </div>
            <p className="text-muted-foreground">Overall Policy Grade</p>
          </div>

          {/* Sub-scores */}
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

      {/* Red Flags with Citations */}
      {detailedFlags && detailedFlags.length > 0 && (
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-brand-grade-f" />
              Red Flags ({detailedFlags.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {detailedFlags.map((flag, index) => (
              <div
                key={index}
                className="border border-border rounded-lg p-4 bg-secondary/20"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-medium text-gradient">{flag.name}</span>
                  <span
                    className={cn(
                      "text-xs px-2 py-1 rounded",
                      flag.severity === "high" && "bg-brand-grade-f/20 text-brand-grade-f",
                      flag.severity === "medium" && "bg-brand-grade-d/20 text-brand-grade-d",
                      flag.severity === "low" && "bg-brand-grade-c/20 text-brand-grade-c"
                    )}
                  >
                    {flag.severity.toUpperCase()}
                  </span>
                </div>
                <blockquote className="text-sm text-muted-foreground italic border-l-2 border-brand-amber pl-3 mb-2">
                  &ldquo;{flag.quote}&rdquo;
                </blockquote>
                <button
                  onClick={() => handlePageClick(flag.page)}
                  className="flex items-center gap-2 text-xs text-gradient hover:underline cursor-pointer"
                >
                  <FileText className="w-3 h-3" />
                  <span>Page {flag.page}</span>
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Clauses with Plain English */}
          {clauses && clauses.length > 0 && (
            <Card className="border-border bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-brand-amber" />
                  Key Clauses Explained
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {clauses.map((clause) => (
                  <ClauseCard
                    key={clause.id}
                    clause={clause}
                    onPageClick={handlePageClick}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <div className="text-center text-xs text-muted-foreground">
            <p>All outputs are scores, citations, and direct quotes — not recommendations.</p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ScoreBarProps {
  label: string;
  grade: string;
  description: string;
}

function ScoreBar({ label, grade, description }: ScoreBarProps) {
  const percentage = gradeToPercentage(grade);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-white">{label}</span>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className={cn("text-lg font-bold", getGradeColor(grade))}>
          {grade}
        </span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}

interface ClauseCardProps {
  clause: Clause;
  onPageClick?: (page: number) => void;
}

function ClauseCard({ clause, onPageClick }: ClauseCardProps) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-white">{clause.type}</span>
        <button
          onClick={() => onPageClick?.(clause.page)}
          className="text-xs text-brand-amber flex items-center gap-1 hover:underline cursor-pointer"
        >
          <FileText className="w-3 h-3" />
          Page {clause.page}
          <ExternalLink className="w-3 h-3 opacity-50" />
        </button>
      </div>
      <p className="text-sm text-muted-foreground italic mb-3 line-clamp-2">
        &ldquo;{clause.text}&rdquo;
      </p>
      <div className="bg-secondary/30 rounded p-3">
        <p className="text-sm text-white">
          <ArrowRight className="w-4 h-4 inline mr-1 text-brand-amber" />
          {clause.plainEnglish}
        </p>
      </div>
      {clause.concern && (
        <p className="text-xs text-brand-grade-d mt-2">
          ⚠️ {clause.concern}
        </p>
      )}
    </div>
  );
}

function gradeToPercentage(grade: string): number {
  const map: Record<string, number> = {
    "A+": 98, A: 92, "A-": 88,
    "B+": 82, B: 78, "B-": 72,
    "C+": 68, C: 62, "C-": 58,
    "D+": 52, D: 48, "D-": 42,
    F: 20,
  };
  return map[grade] || 50;
}