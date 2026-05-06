"use client";

import { useState } from "react";
import Link from "next/link";
import { BrokerDropzone } from "./dual-dropzone";
import { VoucherInput } from "./voucher-input";
import { VoucherPacks } from "./voucher-packs";
import { PolicyPillToggle } from "./policy-pill-toggle";
import { ComparativeQA } from "./comparative-qa";
import { VerdictBar } from "./verdict-bar";
import { motion, AnimatePresence } from "framer-motion";
import type { BrokerAnalysisResult, AnalysisResult } from "@/types";

type BrokerStep =
  | "idle"
  | "uploading"
  | "analyzing"
  | "payment-required"
  | "comparing"
  | "split-view";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.4, ease: "easeOut" }
};

export function BrokerMode() {
  const [step, setStep] = useState<BrokerStep>("idle");
  const [policyA, setPolicyA] = useState<AnalysisResult | null>(null);
  const [policyB, setPolicyB] = useState<AnalysisResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activePolicy, setActivePolicy] = useState<"A" | "B">("A");
  const [voucherApplied, setVoucherApplied] = useState(false);

  const handleFileRemoved = (policy: "A" | "B") => {
    if (policy === "A") {
      setPolicyA(null);
      // Reset to idle if policyB is also null
      setPolicyB((currentB) => {
        if (!currentB) {
          setStep("idle");
          setSessionId(null);
          setVoucherApplied(false);
        }
        return currentB;
      });
    } else {
      setPolicyB(null);
      // Reset to idle if policyA is also null
      setPolicyA((currentA) => {
        if (!currentA) {
          setStep("idle");
          setSessionId(null);
          setVoucherApplied(false);
        }
        return currentA;
      });
    }
  };

  const handleFileUploaded = async (file: File, policy: "A" | "B") => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/upload/batch`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) throw new Error("Upload failed");

      const result = await response.json();

      if (policy === "A") {
        setPolicyA(result);
      } else {
        setPolicyB(result);
      }

      // When both files are uploaded, move to payment
      if (
        (policy === "A" && policyB) ||
        (policy === "B" && policyA)
      ) {
        setSessionId(result.session_id);
        setStep("payment-required");
      }
    } catch (error) {
      console.error("Upload error:", error);
    }
  };

  const handlePaymentComplete = () => {
    setStep("split-view");
  };

  const handleVoucherApplied = (credits: number) => {
    setVoucherApplied(true);
    // If enough credits, skip to comparison
    if (credits > 0) {
      setStep("split-view");
    }
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
              Compare Policies{" "}
              <span className="bg-gradient-to-r from-[#ffde59] to-[#ff914d] bg-clip-text text-transparent">Side by Side.</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Upload two insurance policies and get data-backed comparisons.
              Perfect for brokers comparing options for clients.
            </p>
            <BrokerDropzone onFileUploaded={handleFileUploaded} onFileRemoved={handleFileRemoved} />
            <div className="mt-6">
              <Link
                href="/vouchers"
                className="btn-gradient-text text-sm font-bold"
              >
                Comparing a lot of policies?
              </Link>
            </div>
          </motion.div>
        )}

        {step === "uploading" && (
          <motion.div
            key="uploading"
            {...fadeInUp}
            className="text-center py-16"
          >
            <div className="inline-flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-[#ffb753] border-t-transparent rounded-full animate-spin" />
              <p className="text-lg text-muted-foreground">
                Streaming policies to secure memory...
              </p>
            </div>
          </motion.div>
        )}

        {(step === "payment-required" || step === "analyzing") && (
          <motion.div
            key="payment-required"
            {...fadeInUp}
            className="py-8 space-y-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {policyA && (
                <div className="border border-border rounded-lg p-4 bg-card/50">
                  <h3 className="font-medium mb-2">Policy A</h3>
                  <p className="text-sm text-muted-foreground">
                    Grade:{" "}
                    <span className="bg-gradient-to-r from-[#ffde59] to-[#ff914d] bg-clip-text text-transparent font-bold">{policyA.grade.overall}</span>
                  </p>
                </div>
              )}
              {policyB && (
                <div className="border border-border rounded-lg p-4 bg-card/50">
                  <h3 className="font-medium mb-2">Policy B</h3>
                  <p className="text-sm text-muted-foreground">
                    Grade:{" "}
                    <span className="bg-gradient-to-r from-[#ffde59] to-[#ff914d] bg-clip-text text-transparent font-bold">{policyB.grade.overall}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="max-w-md mx-auto space-y-6">
              {!voucherApplied ? (
                <>
                  <VoucherInput onValidated={handleVoucherApplied} />
                  <p className="text-center text-muted-foreground">— or —</p>
                  <VoucherPacks onPaymentComplete={handlePaymentComplete} />
                </>
              ) : (
                <div className="text-center">
                  <p className="text-gradient mb-4">✓ Voucher applied!</p>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStep("split-view")}
                    className="btn-gradient-bg"
                  >
                    Start Comparison
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {step === "split-view" && policyA && policyB && (
          <motion.div
            key="split-view"
            {...fadeInUp}
            className="py-8 space-y-6"
          >
            <PolicyPillToggle
              activePolicy={activePolicy}
              onPolicyChange={setActivePolicy}
              policyAGrade={policyA.grade.overall}
              policyBGrade={policyB.grade.overall}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: PDF Viewer with Clause Finder */}
              <div className="border border-border rounded-lg p-4 bg-card/50">
                <h3 className="font-medium mb-4">
                  {activePolicy === "A" ? "Policy A" : "Policy B"}
                </h3>
                {/* PDF viewer placeholder */}
                <div className="aspect-[3/4] bg-secondary rounded-lg flex items-center justify-center">
                  <p className="text-muted-foreground">
                    PDF Viewer — {activePolicy === "A" ? "Policy A" : "Policy B"}
                  </p>
                </div>
              </div>

              {/* Right: Comparative Q&A */}
              <div>
                <ComparativeQA
                  sessionId={sessionId || ""}
                  policyA={policyA}
                  policyB={policyB}
                />
              </div>
            </div>

            {/* Verdict Bar */}
            <VerdictBar
              policyA={policyA}
              policyB={policyB}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}