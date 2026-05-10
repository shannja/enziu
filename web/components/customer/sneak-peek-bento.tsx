"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Shield, FileText, ArrowRight, Info } from "lucide-react";
import { cn, getGradeColor, isNaGrade } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";
import { motion } from "framer-motion";
import Image from "next/image";
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
  const { actualTheme } = useTheme();

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
        <h2 className="text-2xl font-bold mb-4">
          Here's what we found based on the
        </h2>
        <div className="flex items-center justify-center gap-3 mb-2">
          <Image
            src={actualTheme === "dark" ? "/logos/index-dark.png" : "/logos/index-light.png"}
            alt="Enziu Index"
            width={512}
            height={512}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          We've scanned the document and identified potential vulnerabilities. Here is your baseline grade.
        </p>
      </motion.div>

      {/* Bento Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto"
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
              {isNaGrade(grade.overall) ? (
                <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>This document does not appear to be an insurance policy. Grades are not applicable.</p>
                </div>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">
                  Clarity <span className={getGradeColor(grade.clarity)}>{grade.clarity}</span> • 
                  Coverage <span className={getGradeColor(grade.coverage)}>{grade.coverage}</span> • 
                  Claims <span className={getGradeColor(grade.claimsEfficiency)}>{grade.claimsEfficiency}</span>
                  <br />
                  <br />
                  <p className="text-xs">The overall grade is not the average of Clarity, Coverage, and Claims.<br /><br />There might be red flags, limited coverage, and hidden exclusions that affect the overall grade. </p>
                </div>
              )}
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
          <Card className="bento-card bg-card/50 border-border h-full ">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-brand-grade-f"/>
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
                <FileText className="w-4 h-4"/>
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="relative overflow-hidden">
              <p className="text-foreground/90 leading-relaxed line-clamp-3">{summary}</p>

              {/* Blur layer — masked */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, transparent 5%, black 100%)',
                  maskImage: 'linear-gradient(to bottom, transparent 0%, transparent 5%, black 100%)',
                  backdropFilter: 'blur(512px)',
                  WebkitBackdropFilter: 'blur(512px)',
                }}
              />

              {/* Color fade layer — transparent, then fades to card bg */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(to bottom, transparent 0%, transparent 5%, hsl(var(--card) / 0.9) 50%, hsl(var(--card)) 100%)',
                }}
              />
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