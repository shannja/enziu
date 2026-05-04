"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  // Group 1: Privacy links
  const privacyLinks = [
    { href: "/privacy", label: "Privacy Statement" },
    { href: "/terms", label: "Terms of Service" },
    { href: "/cookies", label: "Cookie Policy" },
  ];

  // Group 2: Security links
  const securityLinks = [
    { href: "/security", label: "Security" },
    { href: "/compliance", label: "Compliance" },
  ];

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-[#FAFAFA] dark:bg-[#151515] border-t border-border"
    >
      {/* 
          Container with generous padding on all sides (py-12 px-6)
          md:px-24 and lg:px-32 provide the requested large side padding on larger screens.
      */}
      <div className="container mx-auto py-16 px-6 md:px-24 lg:px-32">
        
        {/* Main Link Section - Increased gap between columns */}
        <div className="flex justify-start mb-16">
          <div className="grid grid-cols-2 gap-16 md:gap-32 w-full max-w-2xl">
            
            {/* Group 1 */}
            <div className="flex flex-col space-y-4">
              {privacyLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground hover:text-brand-amber transition-colors duration-200"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Group 2*/}
            <div className="flex flex-col space-y-4">
              {securityLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground hover:text-brand-amber transition-colors duration-200"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar - Copyright left, Contact Support button right */}
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-border/40 gap-6">
          <p className="text-xs text-muted-foreground tracking-tight">
            &copy; {currentYear} Enziu. All rights reserved.
          </p>
          <Link
            href="/contact"
            className="px-8 py-3 text-sm font-semibold rounded-full text-foreground font-bold bg-brand-gradient hover:opacity-90 transition-opacity duration-200 shadow-lg shadow-brand-amber/10"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </motion.footer>
  );
}