"use client";

import Image from "next/image";
import Link from "next/link";
import { Moon, Sun, Lock } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Mode = "customer";

interface ModeOption {
  value: Mode | "broker";
  label: string;
  disabled?: boolean;
  tooltip?: string;
}

interface HeaderProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  hideToggle?: boolean; // Hide the mode toggle
}

export function Header({ mode, onModeChange, hideToggle = false }: HeaderProps) {
  const { theme, setTheme, actualTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(actualTheme === "dark" ? "light" : "dark");
  };

  const modes: ModeOption[] = [
    { value: "customer", label: "Customer" },
    { value: "broker", label: "Broker", disabled: true, tooltip: "Coming Soon" },
  ];

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-50 w-full border-b border-border bg-background backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className={cn(
        "container mx-auto px-4 py-3 md:py-0 md:h-16 flex flex-col items-center gap-4 md:grid md:gap-0",
        hideToggle ? "md:grid-cols-2" : "md:grid-cols-3"
      )}>
        
        {/* Logo Section - Top on Mobile, Left on Desktop */}
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          className="flex justify-center md:justify-start"
        >
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("enziu-reset"))}
            className="flex items-center gap-2 group cursor-pointer"
            title="Return to home"
          >
            <Image
              src={actualTheme === "dark" ? "/logos/logo-dark.png" : "/logos/logo-light.png"}
              alt="Enziu"
              width={120}
              height={32}
              className="h-8 w-auto"
              priority
            />
          </button>
        </motion.div>

        {/* Mode Toggle - Hidden when hideToggle is true */}
        {!hideToggle && (
          <motion.nav
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
            className="flex items-center gap-1 bg-secondary rounded-full p-1 border border-border/50 md:justify-self-center"
          >
            {modes.map((m) => {
              const isActive = mode === m.value;
              const isDisabled = m.disabled === true;
              
              return (
                <div
                  key={m.value}
                  className="relative group"
                >
                  <button
                    onClick={() => !isDisabled && onModeChange(m.value as Mode)}
                    className={cn(
                      "px-6 py-1.5 md:px-5 md:py-2 text-xs md:text-sm font-medium rounded-full transition-all duration-200 flex items-center gap-1.5",
                      isActive && !isDisabled
                        ? "bg-gradient-to-r from-[#ffde59] to-[#ff914d] text-black shadow-sm"
                        : isDisabled
                          ? "text-muted-foreground/50 cursor-not-allowed opacity-60"
                          : "text-muted-foreground hover:text-foreground"
                    )}
                    disabled={isDisabled}
                  >
                    {m.label}
                    {isDisabled && <Lock className="w-3 h-3" />}
                  </button>
                  {isDisabled && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-popover text-popover-foreground text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
                      {m.tooltip}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-popover"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </motion.nav>
        )}

        {/* Theme Toggle - Right aligned, always visible on desktop */}
        <motion.div 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          className={cn(
            "hidden md:flex",
            hideToggle ? "justify-end" : "justify-end"
          )}
        >
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Toggle theme"
          >
            {actualTheme === "dark" ? (
              <Sun className="h-5 w-5 text-foreground" />
            ) : (
              <Moon className="h-5 w-5 text-foreground" />
            )}
          </button>
        </motion.div>
      </div>
    </motion.header>
  );
}