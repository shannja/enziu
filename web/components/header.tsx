"use client";

import Image from "next/image";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Mode = "customer" | "broker";

interface HeaderProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  hideToggle?: boolean; // Hide the customer/broker toggle
}

export function Header({ mode, onModeChange, hideToggle = false }: HeaderProps) {
  const { theme, setTheme, actualTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(actualTheme === "dark" ? "light" : "dark");
  };

  const modes: Array<{ value: Mode; label: string }> = [
    { value: "customer", label: "Customer" },
    // TODO: Put it back{ value: "broker", label: "Broker" },
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
            {modes.map((m) => (
              <button
                key={m.value}
                onClick={() => onModeChange(m.value)}
                className={cn(
                  "px-6 py-1.5 md:px-5 md:py-2 text-xs md:text-sm font-medium rounded-full transition-all duration-200",
                  mode === m.value
                    ? "bg-gradient-to-r from-[#ffde59] to-[#ff914d] text-black shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m.label}
              </button>
            ))}
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