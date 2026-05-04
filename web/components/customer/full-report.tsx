"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, FileText, ArrowRight } from "lucide-react";
import { cn, getGradeColor } from "@/lib/utils";
import type { AnalysisResult, Clause } from "@/types";

interface FullReportProps {
  result: AnalysisResult;
}

export function FullReport({ result }: FullReportProps) {
  const { grade, detailedFlags, clauses, summary } = result;

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          Your Full ENZIU Report
        </h2>
        <p className="text-muted-foreground">
          Every answer anchored to a page number. Never recommends — only quotes and locates.
        </p>
      </div>

      {/* ENZIU Index Scores */}
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-amber" />
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
            <CardTitle className="text-lg text-white flex items-center gap-2">
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
                  <span className="font-medium text-white">{flag.name}</span>
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
                <div className="flex items-center gap-2 text-xs text-brand-amber">
                  <FileText className="w-3 h-3" />
                  <span>Page {flag.page}</span>
                </div>
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
              <ClauseCard key={clause.id} clause={clause} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card className="border-brand-amber/30 bg-brand-amber/5">
        <CardHeader>
          <CardTitle className="text-lg text-white">Plain English Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-white leading-relaxed">{summary}</p>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground">
        <p>All outputs are scores, citations, and direct quotes — not recommendations.</p>
        <p>Page X — not legal advice</p>
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
}

function ClauseCard({ clause }: ClauseCardProps) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-white">{clause.type}</span>
        <span className="text-xs text-brand-amber flex items-center gap-1">
          <FileText className="w-3 h-3" />
          Page {clause.page}
        </span>
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