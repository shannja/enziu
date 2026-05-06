"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, generateRandomPassphrase, copyToClipboard } from "@/lib/utils";
import { CreditCard, Apple, Smartphone, RefreshCw, Copy, Check } from "lucide-react";

interface PaddleCheckoutProps {
  amount: number;
  sessionId: string;
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

export function PaddleCheckout({
  amount,
  sessionId,
  onPaymentComplete,
}: PaddleCheckoutProps) {
  const [isPaddleLoaded, setIsPaddleLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [showPassphraseInfo, setShowPassphraseInfo] = useState(false);
  const [generatedVoucher, setGeneratedVoucher] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref so the eventCallback closure always sees the latest passphrase value
  const passphraseRef = useRef(passphrase);
  useEffect(() => {
    passphraseRef.current = passphrase;
  }, [passphrase]);

  useEffect(() => {
    // Don't re-initialise if Paddle is already on the page
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
        return;
      }

      // Environment MUST be set before Initialize
      window.Paddle.Environment.set("sandbox");
      window.Paddle.Initialize({
        token: clientToken,
        eventCallback: (event: PaddleEvent) => {
          console.log("[Paddle event]", event.name, event.data);

          if (event.name === "checkout.completed") {
            handlePaymentSuccess(event.data?.transaction_id);
          }
          if (event.name === "checkout.closed") {
            setIsProcessing(false);
          }
          if (event.name === "checkout.error") {
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
  }, []);

  // Called by the Paddle eventCallback when checkout.completed fires
  const handlePaymentSuccess = async (txnId?: string) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Verify payment server-side and receive generated voucher
      const res = await fetch("/api/paddle/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: txnId,
          session_id: sessionId,
          passphrase: passphraseRef.current,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Payment verification failed");
      }

      const { voucher_code } = await res.json();
      setGeneratedVoucher(voucher_code);
      onPaymentComplete(voucher_code);
    } catch (err) {
      console.error("Payment verification error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Verification failed. Please contact support."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = async () => {
    if (!window.Paddle) return;
    if (!passphrase || passphrase.length < 8) {
      setError("Please generate or enter a passphrase (minimum 8 characters)");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Create a server-side transaction first.
      // This is what fixes the 400 — passing items[] directly to Checkout.open()
      // hits the /paddlejs endpoint which is stricter about price ID validation.
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

      // Open checkout with the transaction ID — far more reliable than items[]
      window.Paddle.Checkout.open({ transactionId: transaction_id });

      // isProcessing stays true until checkout.completed or checkout.closed fires
    } catch (err) {
      console.error("Checkout error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not open checkout. Please try again."
      );
      setIsProcessing(false);
    }
  };

  const handleGeneratePassphrase = () => {
    setPassphrase(generateRandomPassphrase());
    setShowPassphraseInfo(true);
    setError(null);
  };

  const handleCopyPassphrase = async () => {
    if (passphrase) {
      const success = await copyToClipboard(passphrase);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (generatedVoucher) {
    return (
      <Card className="max-w-md mx-auto border-brand-amber/30 bg-green-900/20">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-white flex items-center justify-center gap-2">
            <Check className="w-6 h-6 text-green-400" />
            Payment Successful!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">Your voucher code:</p>
            <div className="text-2xl font-bold text-gradient font-mono bg-black/30 p-3 rounded-lg">
              {generatedVoucher}
            </div>
          </div>

          <Button
            onClick={async () => {
              const success = await copyToClipboard(generatedVoucher);
              if (success) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            variant="outline"
            className="w-full"
          >
            {copied ? (
              <><Check className="w-4 h-4 mr-2" />Copied!</>
            ) : (
              <><Copy className="w-4 h-4 mr-2" />Copy Code</>
            )}
          </Button>

          <div className="bg-secondary/50 rounded-lg p-3 text-xs text-muted-foreground">
            <p className="font-medium text-white mb-1">⚠️ Important:</p>
            <ul className="space-y-1">
              <li>• Save this voucher code safely</li>
              <li>• Your passphrase: <strong>{passphrase}</strong></li>
              <li>• You'll need both to recover if lost</li>
              <li>• No email is stored — this is your only backup</li>
            </ul>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            Full analysis unlocked! Redirecting...
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Checkout form ─────────────────────────────────────────────────────────
  return (
    <Card className="max-w-md mx-auto border-brand-amber/30">
      <CardHeader className="text-center">
        <CardTitle className="text-xl text-foreground">Unlock Full Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center">
          <div className="text-3xl font-bold text-gradient">{formatCurrency(amount)}</div>
          <p className="text-sm text-muted-foreground mt-1">
            One-time payment • No account required
          </p>
        </div>

        {/* Passphrase */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              Recovery Passphrase *
            </label>
            <button
              type="button"
              onClick={() => setShowPassphraseInfo(!showPassphraseInfo)}
              className="text-xs text-gradient hover:underline"
            >
              What's this?
            </button>
          </div>

          {showPassphraseInfo && (
            <div className="bg-gradient-900/30 border rounded-lg p-3 text-xs space-y-2">
              <p className="text-foreground mb-1 text-left text-gradient">
                <strong>Why you need a passphrase?</strong>
              </p>
              <ul className="text-foreground space-y-1 list-none pl-0 text-left">
                <li>No email required — complete privacy</li>
                <li>Use this to recover your voucher if lost</li>
                <li>Choose something memorable but secure</li>
                <li>Minimum 8 characters</li>
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={passphrase}
              onChange={(e) => { setPassphrase(e.target.value); setError(null); }}
              placeholder="Enter or generate passphrase..."
              className="flex-1 px-3 py-2 bg-secondary border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-brand-amber/50"
            />
            <Button
              type="button"
              onClick={handleGeneratePassphrase}
              variant="gradient-bg"
              size="sm"
              className="flex-shrink-0"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Generate
            </Button>
          </div>

          {passphrase && (
            <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-xs text-green-400 font-mono">
                  {passphrase.length} chars
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyPassphrase}
                className="text-xs text-gradient hover:underline flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            ⚠️ Save this passphrase! It's your only way to recover your voucher.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <Button
          onClick={handleCheckout}
          disabled={!isPaddleLoaded || isProcessing || !passphrase || passphrase.length < 8}
          variant="gradient-bg"
          size="lg"
          className="w-full"
        >
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              Opening checkout...
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
          Secured by Paddle. Apple Pay, Google Pay, and all major cards accepted.
        </p>

        <div className="bg-secondary/50 rounded-lg p-3 text-xs text-muted-foreground">
          <p className="font-medium text-gradient mb-1 text-left"><strong>Here's what you'll get!</strong></p>
          <br />
          <ul className="space-y-1 list-none pl-0 text-left">
            <li>Full ENZIU Index with page citations</li>
            <li>All red flags with exact locations</li>
            <li>Plain-English summary</li>
            <li>5 Deep Dive chat questions</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}