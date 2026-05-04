"use client";

import { useState, useEffect } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { Header } from "@/components/header";
import { CustomerMode } from "@/components/customer/customer-mode";
import { BrokerMode } from "@/components/broker/broker-mode";

type AppMode = "customer" | "broker";

export default function Home() {
  const [mode, setMode] = useState<AppMode>("customer");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Check URL params for mode
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get("mode") as AppMode;
    if (urlMode === "broker" || urlMode === "customer") {
      setMode(urlMode);
    }
  }, []);

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode);
    // Update URL without reload
    const params = new URLSearchParams(window.location.search);
    params.set("mode", newMode);
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${params.toString()}`
    );
  };

  if (!isMounted) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading ENZIU...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black">
      <Header mode={mode} onModeChange={handleModeChange} />

      <div className="container mx-auto px-4 py-8">
        {mode === "customer" ? <CustomerMode /> : <BrokerMode />}
      </div>

      <footer className="border-t border-border py-6 mt-16">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>
            ENZIU provides analysis, not legal advice. All outputs are scores,
            citations, and direct quotes.
          </p>
          <p className="mt-2">
            © {new Date().getFullYear()} ENZIU. Zero data stored. Zero
            exceptions.
          </p>
        </div>
      </footer>
    </main>
  );
}