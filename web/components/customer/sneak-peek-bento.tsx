"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Shield, FileText, ArrowRight } from "lucide-react";
import { cn, getGradeColor } from "@/lib/utils";
import type { AnalysisResult } from "@/types";

interface SneakPeekBentoProps {
  result: AnalysisResult;
}

export function SneakPeekBento({ result }: SneakPeekBentoProps) {
  const { grade, topRisk, redFlags, summary } = result;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          Sneak Peek — Your Policy Snapshot
        </h2>
        <p className="text-muted-foreground">
          Here's what we found. Pay to unlock the full analysis with page citations.
        </p>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {/* Grade Card */}
        <Card className="bento-card bg-card/50 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Overall Grade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-6xl font-bold",
                getGradeColor(grade.overall)
              )}
            >
              {grade.overall}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Clarity: <span className={getGradeColor(grade.clarity)}>{grade.clarity}</span> • 
              Coverage: <span className={getGradeColor(grade.coverage)}>{grade.coverage}</span> • 
              Claims: <span className={getGradeColor(grade.claimsEfficiency)}>{grade.claimsEfficiency}</span>
            </div>
          </CardContent>
        </Card>

        {/* Top Risk Card */}
        <Card className="bento-card bg-card/50 border-border lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-brand-grade-f" />
              Top Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg text-white">{topRisk}</p>
          </CardContent>
        </Card>

        {/* Red Flags Card */}
        <Card className="bento-card bg-card/50 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-amber" />
              Red Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {redFlags.slice(0, 3).map((flag, index) => (
                <li
                  key={index}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="w-2 h-2 rounded-full bg-brand-grade-f" />
                  <span className="text-white">{flag}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Summary Card */}
        <Card className="bento-card bg-card/50 border-border lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-amber" />
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-white line-clamp-3">{summary}</p>
          </CardContent>
        </Card>
      </div>

      {/* CTA */}
      <div className="text-center mt-8">
        <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
          <span>Unlock full report with page citations, deep dive Q&A, and plain-English explanations</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}