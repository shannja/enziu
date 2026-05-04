"use client";

import { useState } from "react";
import { CustomerDropzone } from "./dropzone";
import { SneakPeekBento } from "./sneak-peek-bento";
import { PaddleCheckout } from "./paddle-checkout";
import { FullReport } from "./full-report";
import { DeepDiveChat } from "./deep-dive-chat";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisResult } from "@/types";

type CustomerStep =
  | "idle"
  | "uploading"
  | "analyzing"
  | "sneak-peek"
  | "paid"
  | "full-report"
  | "chat";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.4, ease: "easeOut" }
};

export function CustomerMode() {
  const [step, setStep] = useState<CustomerStep>("idle");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleFileUploaded = async (file: File) => {
    setStep("uploading");

    try {
      // Stream file to API
      const formData = new FormData();
      formData.append("file", file);

      // Start analysis
      setStep("analyzing");

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const result = await response.json();
      setAnalysisResult(result);
      setSessionId(result.session_id);

      // Show sneak peek (free preview)
      setStep("sneak-peek");
    } catch (error) {
      console.error("Upload error:", error);
      setStep("idle");
    }
  };

  const handlePaymentComplete = () => {
    setStep("full-report");
  };

  const handleChatComplete = () => {
    setStep("chat");
  };

  return (
    <div className="max-w-6xl mx-auto">
      <AnimatePresence mode="wait">
        {step === "idle" && (
          <motion.div
            key="idle"
            {...fadeInUp}
            className="text-center py-16"
          >
            <h1 className="text-4xl md:text-5xl font-normal mb-4 font-display">
              Understand what you{" "}
              <span className="text-gradient font-bold">actually bought</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Upload your insurance policy. Get instant clarity with scored, cited,
              plain-English analysis. Zero data stored.
            </p>
            <CustomerDropzone onFileUploaded={handleFileUploaded} />
          </motion.div>
        )}

        {step === "uploading" && (
          <motion.div
            key="uploading"
            {...fadeInUp}
            className="text-center py-16"
          >
            <div className="inline-flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-brand-amber border-t-transparent rounded-full animate-spin" />
              <p className="text-lg text-muted-foreground">Streaming to secure memory...</p>
            </div>
          </motion.div>
        )}

        {step === "analyzing" && (
          <motion.div
            key="analyzing"
            {...fadeInUp}
            className="text-center py-16"
          >
            <div className="inline-flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-brand-amber border-t-transparent rounded-full animate-spin" />
              <p className="text-lg text-muted-foreground">Analyzing your policy...</p>
            </div>
          </motion.div>
        )}

        {step === "sneak-peek" && analysisResult && (
          <motion.div
            key="sneak-peek"
            {...fadeInUp}
            className="py-8"
          >
            <SneakPeekBento result={analysisResult} />
            <div className="mt-8 text-center">
              <PaddleCheckout
                amount={4.99}
                sessionId={sessionId || ""}
                onPaymentComplete={handlePaymentComplete}
              />
            </div>
          </motion.div>
        )}

        {step === "full-report" && analysisResult && (
          <motion.div
            key="full-report"
            {...fadeInUp}
            className="py-8"
          >
            <FullReport result={analysisResult} />
            <DeepDiveChat
              sessionId={sessionId || ""}
              onChatComplete={handleChatComplete}
            />
          </motion.div>
        )}

        {step === "chat" && analysisResult && (
          <motion.div
            key="chat"
            {...fadeInUp}
            className="py-8"
          >
            <FullReport result={analysisResult} />
            <DeepDiveChat
              sessionId={sessionId || ""}
              onChatComplete={handleChatComplete}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}