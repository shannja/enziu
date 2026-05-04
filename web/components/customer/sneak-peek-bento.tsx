"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Shield, FileText, ArrowRight } from "lucide-react";
import { cn, getGradeColor } from "@/lib/utils";
import { motion } from "framer-motion";
import type { AnalysisResult } from "@/types";

interface SneakPeekBentoProps {
  result: AnalysisResult;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: "easeOut"
    }
  }
};

export function SneakPeekBento({ result }: SneakPeekBentoProps) {
  const { grade, topRisk, redFlags, summary } = result;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="text-center mb-8"
      >
        <h2 className="text-2xl font-bold mb-2">
          Sneak Peek — Your Policy Snapshot
        </h2>
        <p className="text-muted-foreground">
          Here's what we found. Pay to unlock the full analysis with page citations.
        </p>
      </motion.div>

      {/* Bento Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto"
      >
        {/* Grade Card */}
        <motion.div variants={itemVariants}>
          <Card className="bento-card bg-card/50 border-border h-full">
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
        </motion.div>

        {/* Top Risk Card */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="bento-card bg-card/50 border-border h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-brand-grade-f" />
                Top Risk
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg">{topRisk}</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Red Flags Card */}
        <motion.div variants={itemVariants}>
          <Card className="bento-card bg-card/50 border-border h-full">
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
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        {/* Summary Card */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="bento-card bg-card/50 border-border h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-amber" />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="line-clamp-3">{summary}</p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="text-center mt-8"
      >
        <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
          <span>Unlock full report with page citations, deep dive Q&A, and plain-English explanations</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      </motion.div>
    </motion.div>
  );
}