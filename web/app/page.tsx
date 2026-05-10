"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CustomerMode } from "@/components/customer/customer-mode";
import { motion } from "framer-motion";
import { useMode } from "@/context/ModeContext";

export default function Home() {
  const { mode, setMode } = useMode();
  const [hideToggle, setHideToggle] = useState(false);

  useEffect(() => {
    const handleToggleChange = (event: CustomEvent<{ hide: boolean }>) => {
      setHideToggle(event.detail.hide);
    };

    window.addEventListener("enziu-hide-toggle", handleToggleChange as EventListener);
    return () => {
      window.removeEventListener("enziu-hide-toggle", handleToggleChange as EventListener);
    };
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <Header mode={mode} onModeChange={setMode} hideToggle={hideToggle} />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
        className="container mx-auto px-4 py-8"
      >
        {/* Main Content - Customer Mode Only */}
        <div className="max-w-4xl mx-auto">
          <CustomerMode />
        </div>
      </motion.div>

      {/* Footer */}
      <Footer />
    </main>
  );
}
