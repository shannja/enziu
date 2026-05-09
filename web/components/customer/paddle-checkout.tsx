"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { CreditCard, Apple, Smartphone, RefreshCw } from "lucide-react";
import { storeRecoveryVault, getFactSheet, getText } from "@/lib/pdf-storage";

interface PaddleCheckoutProps {
  amount: number;
  sessionId: string;
  extractedText?: string;
  onPaymentComplete: (voucherCode?: string) => void;
}

declare global {
  interface Window {
    Paddle?: {
      Initialize: (config: {
        token: string;
        eventCallback?: (event: PaddleEvent) => void;
      }) => void;
      Checkout: {
        open: (options: {
          transactionId?: string;
          items?: Array<{ priceId: string; quantity?: number }>;
          customData?: Record<string, unknown>;
        }) => void;
        close: () => void;
      };
      Environment: {
        set: (env: "sandbox" | "production") => void;
      };
    };
  }
}

interface PaddleEvent {
  name: string;
  data?: {
    transaction_id?: string;
    status?: string;
  };
}

type PaymentStatus = "pending" | "paid";

interface StoredPayment {
  sessionId: string;
  status: PaymentStatus;
  timestamp: number;
}

const STORAGE_KEY = "enziu_payment";

function getStoredPayment(): StoredPayment | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPayment) : null;
  } catch {
    return null;
  }
}

function setStoredPayment(data: StoredPayment) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearStoredPayment() {
  localStorage.removeItem(STORAGE_KEY);
}

export function PaddleCheckout({
  amount,
  sessionId,
  onPaymentComplete,
}: PaddleCheckoutProps) {
  const [isPaddleLoaded, setIsPaddleLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Track whether checkout.completed fired so checkout.closed doesn't wipe it
  const paymentCompletedRef = useRef(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Recovery: check localStorage on mount ───────────────────────────────
  useEffect(() => {
    const stored = getStoredPayment();
    if (!stored || stored.sessionId !== sessionId) return;

    if (stored.status === "paid") {
      onPaymentComplete();
    } else if (stored.status === "pending") {
      startPaymentPolling();
    }

    return () => stopPaymentPolling();
  // onPaymentComplete intentionally omitted — stable callback ref expected from parent
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Polling ──────────────────────────────────────────────────────────────
  const MAX_ATTEMPTS = 15;
  const POLL_INTERVAL_MS = 10_000;
  const CLOSED_GRACE_PERIOD_MS = 3000; // Grace period after checkout.closed before resetting

  function stopPaymentPolling() {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsCheckingStatus(false);
  }

  function startPaymentPolling() {
    setIsCheckingStatus(true);
    let attempts = 0;

    stopPaymentPolling();

    const poll = async () => {
      attempts++;
      try {
        const res = await fetch(`/api/paddle/status?session_id=${sessionId}`);
        if (!res.ok) throw new Error("Status check failed");

        const { paid } = await res.json();
        if (paid) {
          stopPaymentPolling();
          clearStoredPayment();
          onPaymentComplete();
          return;
        }

        if (attempts >= MAX_ATTEMPTS) {
          stopPaymentPolling();
          setError("Payment verification timed out. Contact support if you were charged.");
        } else {
          setError(`Verifying payment… (${attempts}/${MAX_ATTEMPTS})`);
        }
      } catch {
        if (attempts >= MAX_ATTEMPTS) {
          stopPaymentPolling();
          setError("Could not verify payment status. Please contact support.");
        }
      }
    };

    poll(); // immediate first check
    pollingIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
  }

  // ── Load Paddle.js ───────────────────────────────────────────────────────
  useEffect(() => {
    if (window.Paddle) {
      setIsPaddleLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;

    script.onload = () => {
      if (!window.Paddle) return;

      const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
      if (!clientToken) {
        console.error("Paddle client token not configured");
        setError("Payment provider not configured.");
        return;
      }

      // Environment must be set before Initialize
      window.Paddle.Environment.set(
        process.env.NEXT_PUBLIC_PADDLE_SANDBOX === "true" ? "sandbox" : "production"
      );
      window.Paddle.Initialize({
        token: clientToken,
        eventCallback: (event: PaddleEvent) => {
          console.log("[Paddle event]", event.name, event.data);

          if (event.name === "checkout.completed") {
            handlePaymentSuccess(event.data?.transaction_id);
          }

          if (event.name === "checkout.closed") {
            document.body.style.overflow = ""; // Restore body scroll
            // Only reset if payment did NOT complete — avoid wiping a successful flow
            if (!paymentCompletedRef.current) {
              const stored = getStoredPayment();
              if (stored?.sessionId === sessionId && stored.status === "pending") {
                // Grace period: wait a bit in case checkout.completed is still processing
                console.log("[Paddle] checkout.closed fired, waiting for grace period...");
                setTimeout(() => {
                  // Check if payment completed during grace period
                  const updatedStored = getStoredPayment();
                  if (updatedStored?.status === "paid") {
                    console.log("[Paddle] Payment completed during grace period");
                    return;
                  }
                  // If still pending, start/continue polling
                  console.log("[Paddle] Payment still pending after grace period, starting polling");
                  setIsProcessing(false);
                  startPaymentPolling();
                }, CLOSED_GRACE_PERIOD_MS);
              } else {
                // User closed checkout without completing payment — just reset, no polling
                console.log("[Paddle] User closed checkout without payment");
                setIsProcessing(false);
                // Clear any pending status since user explicitly cancelled
                if (stored?.sessionId === sessionId) {
                  clearStoredPayment();
                }
                // Clear any error from previous attempts
                setError(null);
              }
            }
          }

          if (event.name === "checkout.error") {
            document.body.style.overflow = ""; // Restore body scroll
            setIsProcessing(false);
            setError("Checkout encountered an error. Please try again.");
          }
        },
      });

      setIsPaddleLoaded(true);
    };

    script.onerror = () => {
      setError("Failed to load payment provider. Please refresh and try again.");
    };

    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Verify payment with exponential backoff ──────────────────────────────
  async function verifyPaymentWithRetry(txnId: string, maxRetries = 3): Promise<{ success: boolean; voucher_code: string | null }> {
    let lastError: Error = new Error("Unknown verification error");

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }

      const res = await fetch("/api/paddle/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: txnId, session_id: sessionId }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) return body; // success — return the full response

      if (res.status === 400) {
        throw new Error(body.detail || "Invalid transaction ID");
      }

      // 402 = payment not yet reflected — retry
      lastError = new Error(body.detail || `Verification failed (${res.status})`);
      if (res.status !== 402) throw lastError;
    }

    throw lastError;
  }

  // ── Handle checkout.completed ────────────────────────────────────────────
  async function handlePaymentSuccess(txnId?: string) {
    if (!txnId) {
      setError("No transaction ID received.");
      return;
    }

    // Mark completed so checkout.closed handler doesn't reset state
    paymentCompletedRef.current = true;
    setIsProcessing(true);
    setError(null);

    try {
      const result = await verifyPaymentWithRetry(txnId);

      // Persist confirmed status before closing overlay
      setStoredPayment({ sessionId, status: "paid", timestamp: Date.now() });

      // Store encrypted recovery vault if we got a voucher code
      if (result.voucher_code) {
        try {
          const factSheet = await getFactSheet(sessionId);
          const extractedText = await getText(sessionId);
          if (factSheet && extractedText) {
            await storeRecoveryVault(result.voucher_code, {
              factSheet,
              extractedText,
              sessionId,
            });
            console.log('[Paddle] Recovery vault stored with voucher code');
          }
        } catch (err) {
          console.error('[Paddle] Failed to store recovery vault:', err);
        }
      }

      // Close the Paddle overlay — Paddle v2 does NOT auto-close on completion
      window.Paddle?.Checkout.close();
      document.body.style.overflow = ""; // Restore body scroll

      clearStoredPayment();
      onPaymentComplete(result.voucher_code || undefined);
    } catch (err) {
      paymentCompletedRef.current = false;
      setError(err instanceof Error ? err.message : "Verification failed. Please contact support.");
    } finally {
      setIsProcessing(false);
    }
  }

  // ── Open checkout ────────────────────────────────────────────────────────
  async function handleCheckout() {
    if (!window.Paddle) return;

    setIsProcessing(true);
    setError(null);
    paymentCompletedRef.current = false;

    setStoredPayment({ sessionId, status: "pending", timestamp: Date.now() });
    document.body.style.overflow = "hidden"; // Hide body scroll during Paddle overlay

    try {
      const res = await fetch("/api/paddle/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          price_id: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PAYG,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to initialise checkout");
      }

      const { transaction_id } = await res.json();
      window.Paddle.Checkout.open({ transactionId: transaction_id });
      // isProcessing stays true until checkout.completed or checkout.closed
    } catch (err) {
      document.body.style.overflow = ""; // Restore body scroll on error
      setError(err instanceof Error ? err.message : "Could not open checkout. Please try again.");
      setIsProcessing(false);
      clearStoredPayment();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Card className="max-w-md mx-auto border-brand-amber/30">
      <CardHeader className="text-center">
        <CardTitle className="text-xl text-foreground">Unlock Full Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center">
          <div className="text-3xl font-bold text-gradient">{formatCurrency(amount)}</div>
          <p className="text-sm text-muted-foreground mt-1">One-time payment • No account required</p>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-xs text-red-400">
            {error}
            {isCheckingStatus && (
              <div className="flex items-center gap-2 mt-2">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Checking payment status…</span>
              </div>
            )}
          </div>
        )}

        <Button
          onClick={handleCheckout}
          disabled={!isPaddleLoaded || isProcessing}
          variant="gradient-bg"
          size="lg"
          className="w-full"
        >
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              Processing…
            </span>
          ) : (
            "Pay & Get Full Report"
          )}
        </Button>

        <div className="flex items-center justify-center gap-4 text-muted-foreground">
          <Apple className="w-5 h-5" />
          <CreditCard className="w-5 h-5" />
          <Smartphone className="w-5 h-5" />
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Secured by Paddle.<br /><br />Apple Pay, Google Pay, and all major cards accepted.
        </p>

        <div className="bg-secondary/50 rounded-lg p-3 text-xs text-muted-foreground">
          <p className="font-medium text-gradient mb-1 text-left"><strong>Here's what you'll get after payment!</strong></p>
          <br />
          <ul className="space-y-1 list-none pl-0 text-left">
            <li>• Full ENZIU Index with page citations</li>
            <li>• All red flags with exact locations</li>
            <li>• Plain-English summary</li>
            <li>• 5 Deep Dive chat questions</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}