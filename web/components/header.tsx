"use client";

import Image from "next/image";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Mode = "customer" | "broker";

interface HeaderProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
}

export function Header({ mode, onModeChange }: HeaderProps) {
  const { theme, setTheme, actualTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(actualTheme === "dark" ? "light" : "dark");
  };

  const modes: Array<{ value: Mode; label: string }> = [
    { value: "customer", label: "Customer" },
    { value: "broker", label: "Broker" },
  ];

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div className="container mx-auto px-4 py-3 md:py-0 md:h-16 flex flex-col items-center gap-4 md:grid md:grid-cols-3 md:gap-0">
        
        {/* Logo Section - Top on Mobile, Left on Desktop */}
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          className="flex justify-center md:justify-start"
        >
          <Image
            src={actualTheme === "dark" ? "/logos/logo-dark.png" : "/logos/logo-light.png"}
            alt="Enziu"
            width={110}
            height={28}
            className="h-7 md:h-8 w-auto"
            priority
          />
        </motion.div>

        {/* Mode Toggle - Bottom on Mobile, Center on Desktop */}
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
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m.label}
            </button>
          ))}
        </motion.nav>

        {/* Theme Toggle - Hidden on Mobile, Right on Desktop */}
        <motion.div 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          className="hidden md:flex justify-end"
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