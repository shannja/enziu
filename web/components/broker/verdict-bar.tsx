"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Scale, Trophy, Equal } from "lucide-react";
import { getGradeColor } from "@/lib/utils";
import type { AnalysisResult } from "@/types";

interface VerdictBarProps {
  policyA: AnalysisResult;
  policyB: AnalysisResult;
}

export function VerdictBar({ policyA, policyB }: VerdictBarProps) {
  const gradeA = policyA.grade.overall;
  const gradeB = policyB.grade.overall;

  const gradeToScore = (grade: string): number => {
    const scores: Record<string, number> = {
      "A+": 98, A: 92, "A-": 88,
      "B+": 82, B: 78, "B-": 72,
      "C+": 68, C: 62, "C-": 58,
      "D+": 52, D: 48, "D-": 42,
      F: 20,
    };
    return scores[grade] || 50;
  };

  const scoreA = gradeToScore(gradeA);
  const scoreB = gradeToScore(gradeB);

  const winner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "tie";
  const totalScore = scoreA + scoreB;
  const percentageA = totalScore > 0 ? (scoreA / totalScore) * 100 : 50;
  const percentageB = totalScore > 0 ? (scoreB / totalScore) * 100 : 50;

  return (
    <Card className="border-border bg-card/50">
      <CardContent className="py-6">
        {/* Winner Indicator */}
        <div className="text-center mb-6">
          {winner === "tie" ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Equal className="w-5 h-5" />
              <span className="font-medium">It's a tie!</span>
              <span className="text-sm">Both policies scored the same</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Trophy className="w-5 h-5" style={{ stroke: 'url(#icon-gradient)' }} />
              <span className="font-medium">
                Policy {winner === "A" ? "A" : "B"} Wins
              </span>
              <span className="text-sm text-muted-foreground">
                Based on ENZIU Index scoring
              </span>
            </div>
          )}
        </div>

        {/* Verdict Bar */}
        <div className="relative">
          <div className="flex h-12 rounded-full overflow-hidden bg-secondary">
            <div
              className="bg-brand-grade-a transition-all duration-500 flex items-center justify-center"
              style={{ width: `${percentageA}%` }}
            >
              {percentageA > 15 && (
                <span className="text-black font-bold text-sm">
                  Policy A ({gradeA})
                </span>
              )}
            </div>
            <div
              className="bg-brand-grade-b transition-all duration-500 flex items-center justify-center"
              style={{ width: `${percentageB}%` }}
            >
              {percentageB > 15 && (
                <span className="text-black font-bold text-sm">
                  Policy B ({gradeB})
                </span>
              )}
            </div>
          </div>

          {/* Center Marker */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="w-4 h-4 rounded-full bg-black border-2 border-white" />
          </div>
        </div>

        {/* Scores */}
        <div className="flex justify-between mt-4 text-sm">
          <div className="text-center">
            <span className={getGradeColor(gradeA)}>
              <strong>Policy A:</strong> {gradeA}
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Clarity: {policyA.grade.clarity} • Coverage: {policyA.grade.coverage}
            </p>
          </div>
          <div className="text-center">
            <span className={getGradeColor(gradeB)}>
              <strong>Policy B:</strong> {gradeB}
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Clarity: {policyB.grade.clarity} • Coverage: {policyB.grade.coverage}
            </p>
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          <Scale className="w-3 h-3 inline mr-1" />
          This verdict is based on automated analysis of policy language, clarity, and coverage.
          Not legal advice.
        </p>
      </CardContent>
    </Card>
  );
}