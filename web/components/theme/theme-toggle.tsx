"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, actualTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const themes: Array<{ value: "dark" | "light" | "system"; label: string; icon: React.ReactNode }> = [
    { value: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
    { value: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
    { value: "system", label: "System", icon: <Monitor className="h-4 w-4" /> },
  ];

  const currentTheme = themes.find((t) => t.value === theme) || themes[0];

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-lg border border-border bg-background/50 backdrop-blur-sm hover:border-[#ffb753] hover:shadow-[0_0_12px_rgba(255,183,83,0.3)] transition-all duration-200"
        aria-label="Toggle theme"
      >
        {currentTheme.icon}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-12 z-50 min-w-[160px] p-1 bg-popover border border-border rounded-lg shadow-lg backdrop-blur-sm">
            {themes.map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setTheme(t.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-all duration-200",
                  theme === t.value
                    ? "bg-gradient-to-r from-[#ffde59] to-[#ff914d] text-black font-semibold"
                    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Simple version without dropdown
export function ThemeToggleSimple({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "flex items-center justify-center w-10 h-10 rounded-lg border border-border bg-background/50 backdrop-blur-sm hover:bg-accent/50 transition-all duration-200",
        className
      )}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-foreground" />
      ) : (
        <Moon className="h-4 w-4 text-foreground" />
      )}
    </button>
  );
}