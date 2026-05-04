"use client";

import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/utils";
import { motion } from "framer-motion";

interface PolicyPillToggleProps {
  activePolicy: "A" | "B";
  onPolicyChange: (policy: "A" | "B") => void;
  policyAGrade: string;
  policyBGrade: string;
}

export function PolicyPillToggle({
  activePolicy,
  onPolicyChange,
  policyAGrade,
  policyBGrade,
}: PolicyPillToggleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center justify-center"
    >
      <div className="inline-flex items-center gap-2 bg-secondary rounded-full p-1">
        <motion.button
          layoutId="activePill"
          onClick={() => onPolicyChange("A")}
          className={cn(
            "px-6 py-3 rounded-full font-medium transition-colors duration-200 flex items-center gap-2",
            activePolicy === "A"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>Policy A</span>
          <span
            className={cn(
              "text-sm font-bold",
              activePolicy === "A" ? "text-foreground" : getGradeColor(policyAGrade)
            )}
          >
            {policyAGrade}
          </span>
        </motion.button>

        <motion.button
          layoutId="activePill"
          onClick={() => onPolicyChange("B")}
          className={cn(
            "px-6 py-3 rounded-full font-medium transition-colors duration-200 flex items-center gap-2",
            activePolicy === "B"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>Policy B</span>
          <span
            className={cn(
              "text-sm font-bold",
              activePolicy === "B" ? "text-foreground" : getGradeColor(policyBGrade)
            )}
          >
            {policyBGrade}
          </span>
        </motion.button>
      </div>
    </motion.div>
  );
}