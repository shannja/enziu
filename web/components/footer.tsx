"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

export function Footer() {
  const currentYear = new Date().getFullYear();

  const privacyLinks = [
    { href: "/privacy", label: "Privacy Statement" },
    { href: "/terms", label: "Terms of Service" },
    { href: "/cookies", label: "Cookie Policy" },
  ];

  const securityLinks = [
    { href: "/compliance", label: "Compliance" },
    { href: "/security", label: "Security" },
  ];

  const infoLinks = [
    { href: "/vouchers", label: "Vouchers" },
  ];

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-[#FAFAFA] dark:bg-[#151515] border-t border-border"
    >
      <div className="container mx-auto py-16 px-6 md:px-24 lg:px-32">
        
        {/* Main Section: Groups on Left, Responsive Image on Far Right */}
        <div className="flex flex-col md:flex-row justify-between items-start mb-16 gap-12">
          
          {/* Link Groups */}
          <div className="grid grid-cols-3 gap-8 md:gap-32 w-full max-w-2xl">
            {/* Group 1 */}
            <div className="flex flex-col space-y-8">
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

            {/* Group 2 */}
            <div className="flex flex-col space-y-8">
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

            {/* Group 3 */}
            <div className="flex flex-col space-y-8">
              {infoLinks.map((link) => (
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

          {/* 
              Responsive Image 
              - max-w-[120px] sets the cap size
              - w-full + h-auto allows it to scale down on small screens
              - opacity matches your minimalist aesthetic
          */}
          <div className="w-full max-w-[100px] md:max-w-[140px] pointer-events-none select-none">
            <Image 
              src="/logos/mark.png" 
              alt="Decorative element" 
              width={140} 
              height={140}
              className="w-full h-auto object-contain"
            />
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-border/40 gap-6">
          <p className="text-xs text-muted-foreground tracking-tight">
            &copy; {currentYear} Enziu. All rights reserved.
          </p>
          <Link
            href="/recover-voucher"
            className="relative text-sm text-gradient font-medium transition-all duration-200 group"
          >
            Need Help?
            <span className="absolute left-0 bottom-0 w-full h-[1px] bg-brand-gradient transition-transform duration-200 origin-left scale-x-0 group-hover:scale-x-100" />
          </Link>
        </div>
      </div>
    </motion.footer>
  );
} 