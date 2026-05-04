"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CustomerMode } from "@/components/customer/customer-mode";
import { BrokerMode } from "@/components/broker/broker-mode";
import { motion } from "framer-motion";

type Mode = "customer" | "broker";

export default function Home() {
  const [mode, setMode] = useState<Mode>("customer");

  return (
    <main className="min-h-screen bg-background">
      <Header mode={mode} onModeChange={setMode} />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
        className="container mx-auto px-4 py-8"
      >
        {/* Main Content - Dropzones */}
        <div className="max-w-4xl mx-auto">
          {mode === "customer" ? (
            <CustomerMode />
          ) : (
            <BrokerMode />
          )}
        </div>
      </motion.div>

      {/* Footer */}
      <Footer />
    </main>
  );
}