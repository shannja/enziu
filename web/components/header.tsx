"use client";

import Link from "next/link";
import { ModeToggle } from "./mode-toggle";
import { AmberAsterisk } from "./amber-asterisk";

interface HeaderProps {
  mode: "customer" | "broker";
  onModeChange: (mode: "customer" | "broker") => void;
}

export function Header({ mode, onModeChange }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-black/80 backdrop-blur supports-[backdrop-filter]:bg-black/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <AmberAsterisk className="h-8 w-8 text-brand-amber" />
          <span className="text-xl font-bold text-white tracking-tight">
            ENZIU
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-4">
          <Link
            href="/recover"
            className="text-sm text-muted-foreground hover:text-white transition-colors"
          >
            Recover Voucher
          </Link>
          <ModeToggle mode={mode} onModeChange={onModeChange} />
        </nav>
      </div>
    </header>
  );
}