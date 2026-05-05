"use client";

import Image from "next/image";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { motion } from "framer-motion";

export function SimpleHeader() {
  const { theme, setTheme, actualTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(actualTheme === "dark" ? "light" : "dark");
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-50 w-full border-b border-border bg-background backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="container mx-auto px-4 py-3 md:py-0 md:h-16 flex items-center justify-between">
        {/* Logo - Links to Home */}
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <Link href="/" className="flex items-center gap-2 group">
            <Image
              src={actualTheme === "dark" ? "/logos/logo-dark.png" : "/logos/logo-light.png"}
              alt="Enziu"
              width={120}
              height={32}
              className="h-8 w-auto"
              priority
            />
          </Link>
        </motion.div>

        {/* Theme Toggle */}
        <motion.button 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-secondary transition-colors"
          aria-label="Toggle theme"
        >
          {actualTheme === "dark" ? (
            <Sun className="h-5 w-5 text-foreground" />
          ) : (
            <Moon className="h-5 w-5 text-foreground" />
          )}
        </motion.button>
      </div>
    </motion.header>
  );
}
