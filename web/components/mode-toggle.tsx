"use client";

import { cn } from "@/lib/utils";

interface ModeToggleProps {
  mode: "customer" | "broker";
  onModeChange: (mode: "customer" | "broker") => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
      <button
        onClick={() => onModeChange("customer")}
        className={cn(
          "px-4 py-2 text-sm font-medium rounded-md transition-all",
          mode === "customer"
            ? "bg-brand-amber text-black shadow-sm"
            : "text-muted-foreground hover:text-white"
        )}
      >
        Customer
      </button>
      <button
        onClick={() => onModeChange("broker")}
        className={cn(
          "px-4 py-2 text-sm font-medium rounded-md transition-all",
          mode === "broker"
            ? "bg-brand-amber text-black shadow-sm"
            : "text-muted-foreground hover:text-white"
        )}
      >
        Broker
      </button>
    </div>
  );
}