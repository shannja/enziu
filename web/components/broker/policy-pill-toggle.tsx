"use client";

import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/utils";

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
    <div className="flex items-center justify-center gap-4">
      <button
        onClick={() => onPolicyChange("A")}
        className={cn(
          "policy-pill px-6 py-3 rounded-full font-medium transition-all flex items-center gap-2",
          activePolicy === "A"
            ? "bg-brand-amber text-black shadow-lg shadow-brand-amber/20"
            : "bg-secondary text-muted-foreground hover:text-white"
        )}
      >
        <span>Policy A</span>
        <span
          className={cn(
            "text-sm font-bold",
            activePolicy === "A" ? "text-black" : getGradeColor(policyAGrade)
          )}
        >
          {policyAGrade}
        </span>
      </button>

      <button
        onClick={() => onPolicyChange("B")}
        className={cn(
          "policy-pill px-6 py-3 rounded-full font-medium transition-all flex items-center gap-2",
          activePolicy === "B"
            ? "bg-brand-amber text-black shadow-lg shadow-brand-amber/20"
            : "bg-secondary text-muted-foreground hover:text-white"
        )}
      >
        <span>Policy B</span>
        <span
          className={cn(
            "text-sm font-bold",
            activePolicy === "B" ? "text-black" : getGradeColor(policyBGrade)
          )}
        >
          {policyBGrade}
        </span>
      </button>
    </div>
  );
}