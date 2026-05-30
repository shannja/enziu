"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useMode } from "@/context/ModeContext";
import { useState, useEffect } from "react";
import { Github, ExternalLink } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { mode } = useMode();
  const [shouldHide, setShouldHide] = useState(false);
  
  const isCustomerMode = mode === "customer";

  // Listen for hide events from child components
  useEffect(() => {
    const handleHideToggle = (event: CustomEvent) => {
      setShouldHide(!!event.detail?.hide);
    };

    window.addEventListener("enziu-hide-footer", handleHideToggle as EventListener);
    return () => window.removeEventListener("enziu-hide-footer", handleHideToggle as EventListener);
  }, []);

  if (shouldHide) {
    return null;
  }

  // Broker mode (default): full footer with links and disclaimers
  return (  
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-[#FAFAFA] dark:bg-[#151515] border-t border-border"
    >
      <div className="border-t border-border/40 py-12 px-6 md:px-24 lg:px-32">
        {/* Main Footer Content */}
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Top Section: Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8">
            <Link
              href="/privacy"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/disclaimer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Disclaimer
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <a
              href="https://github.com/shannja/enziu"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Github className="w-4 h-4" />
              GitHub
            </a>
            <span className="text-muted-foreground/30">|</span>
            <a
              href="https://lablab.ai/ai-hackathons/amd-developer/eseyem/enziu"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              Hackathon Submission
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Middle Section: Privacy Summary */}
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-sm text-muted-foreground leading-relaxed">
              We process your insurance policy in real-time and never store any data. 
              Your PDF is analyzed in memory and deleted immediately after processing.
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-border/40" />

          {/* Bottom Section: Disclaimer and Copyright */}
          <div className="space-y-4">
            {/* Short Disclaimer */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                This project was built for the AMD Developer Hackathon 2026 and is intended for demonstration purposes only. 
                ENZIU is a hackathon prototype and not a real operating business. Use at your own discretion.
              </p>
            </div>

            {/* Copyright */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground tracking-tight">
                &copy; {currentYear} Enziu. All rights reserved. Built for AMD Developer Hackathon 2026.
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
