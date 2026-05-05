"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useMode } from "@/context/ModeContext";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { mode } = useMode();
  
  const isCustomerMode = mode === "customer";

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-[#FAFAFA] dark:bg-[#151515] border-t border-border"
    >
      <div className={`pt-8 border-t border-border/40 py-16 px-6 md:px-24 lg:px-32 ${isCustomerMode ? "text-center" : ""}`}>
        {isCustomerMode ? (
          /* Customer mode: centered copyright only */
          <p className="text-xs text-muted-foreground tracking-tight">
            &copy; {currentYear} Enziu. All rights reserved.
          </p>
        ) : (
          /* Broker mode: flex layout with copyright and voucher link */
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-xs text-muted-foreground tracking-tight">
              &copy; {currentYear} Enziu. All rights reserved.
            </p>
            
            {/* Need Help: Gradient text by default, Underline on hover */}
            <Link
              href="/recover"
              className="relative text-sm text-gradient font-medium transition-all duration-200 group"
            >
              Forgot Voucher Code?
              <span className="absolute left-0 -bottom-1 w-full h-[1px] bg-brand-gradient transition-transform duration-200 origin-left scale-x-0 group-hover:scale-x-100" />
            </Link>
          </div>
        )}
      </div>
    </motion.footer>
  );
}