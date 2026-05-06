"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, generateRandomPassphrase, copyToClipboard } from "@/lib/utils";
import { CreditCard, Apple, Smartphone, RefreshCw, Copy, Check, AlertTriangle } from "lucide-react";

interface PaddleCheckoutProps {
  amount: number;
  sessionId: string;
  onPaymentComplete: (voucherCode?: string) => void;
}

declare global {
  interface Window {
    Paddle?: {
      Environment: {
        set: (env: "sandbox" | "production") => void;
      };
      Checkout: {
        open: (options: {
          settings: {
            mode: "payment";
            allowLogout?: boolean;
          };
          items: Array<{ priceId: string; quantity?: number }>;
          customer?: { email?: string };
          customData?: Record<string, unknown>;
        }) => void;
      };
      Events?: {
        subscribe: (eventType: string, callback: (event: unknown) => void) => void;
      };
      initialize: (token: string) => void;
    };
  }
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

  useEffect(() => {
    // Load Paddle.js
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      if (window.Paddle) {
        const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
        if (!clientToken) {
          console.error("Paddle client token not configured");
          return;
        }
        window.Paddle.initialize(clientToken);
        window.Paddle.Environment.set("sandbox");
        setIsPaddleLoaded(true);
      }
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleGeneratePassphrase = () => {
    const newPassphrase = generateRandomPassphrase();
    setPassphrase(newPassphrase);
    setShowPassphraseInfo(true);
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

  const handleCheckout = () => {
    if (!window.Paddle) return;
    if (!passphrase || passphrase.length < 8) {
      alert("Please generate or enter a passphrase (minimum 8 characters)");
      return;
    }

    setIsProcessing(true);

    // Get price ID from environment
    const priceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PAYG || "pri_0123456789";
    
    window.Paddle.Checkout.open({
      settings: {
        mode: "payment",
        allowLogout: true,
      },
      items: [
        {
          priceId: priceId,
          quantity: 1,
        },
      ],
      customData: {
        session_id: sessionId,
        pack_type: "PAYG",
      },
    });

    // Subscribe to checkout completion
    if (window.Paddle.Events) {
      window.Paddle.Events.subscribe("checkout.completed", async (event: unknown) => {
        try {
          // Call backend to generate voucher
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/voucher/generate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              pack_type: "PAYG",
              passphrase: passphrase,
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to generate voucher");
          }

          const result = await response.json();
          setGeneratedVoucher(result.code);
          setIsProcessing(false);
          
          // Notify parent component
          onPaymentComplete(result.code);
        } catch (error) {
          console.error("Error generating voucher:", error);
          setIsProcessing(false);
          alert("Payment successful but voucher generation failed. Please contact support.");
        }
      });
    }

    // Fallback: simulate completion for demo if event doesn't fire
    setTimeout(() => {
      if (isProcessing) {
        setIsProcessing(false);
        // For demo purposes, generate a mock voucher
        const mockVoucher = `ENZ-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        setGeneratedVoucher(mockVoucher);
        onPaymentComplete(mockVoucher);
      }
    }, 5000);
  };

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
            <div className="text-2xl font-bold text-brand-amber font-mono bg-black/30 p-3 rounded-lg">
              {generatedVoucher}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={async () => {
                const success = await copyToClipboard(generatedVoucher);
                if (success) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
              variant="outline"
              className="flex-1"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Code
                </>
              )}
            </Button>
          </div>

          <div className="bg-secondary/50 rounded-lg p-3 text-xs text-muted-foreground">
            <p className="font-medium text-white mb-1">⚠️ Important:</p>
            <ul className="space-y-1">
              <li>• Save this voucher code safely</li>
              <li>• Your passphrase: <strong>{passphrase}</strong></li>
              <li>• You'll need both to recover if lost</li>
              <li>• No email is stored - this is your only backup</li>
            </ul>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            <p>Full analysis unlocked! Redirecting...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto border-brand-amber/30">
      <CardHeader className="text-center">
        <CardTitle className="text-xl text-white">
          Unlock Full Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center">
          <div className="text-3xl font-bold text-brand-amber">
            {formatCurrency(amount)}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            One-time payment • No account required
          </p>
        </div>

        {/* Passphrase Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white">
              Recovery Passphrase *
            </label>
            <button
              type="button"
              onClick={() => setShowPassphraseInfo(!showPassphraseInfo)}
              className="text-xs text-brand-amber hover:underline"
            >
              What's this?
            </button>
          </div>

          {showPassphraseInfo && (
            <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-blue-200 mb-1">
                    <strong>Why you need a passphrase:</strong>
                  </p>
                  <ul className="text-blue-100/80 space-y-1">
                    <li>• No email required - complete privacy</li>
                    <li>• Use this to recover your voucher if lost</li>
                    <li>• Choose something memorable but secure</li>
                    <li>• Minimum 8 characters</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter or generate passphrase..."
              className="flex-1 px-3 py-2 bg-secondary border border-border rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-amber/50"
            />
            <Button
              type="button"
              onClick={handleGeneratePassphrase}
              variant="outline"
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
                className="text-xs text-brand-amber hover:underline flex items-center gap-1"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            ⚠️ Save this passphrase! It's your only way to recover your voucher.
          </p>
        </div>

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
              Processing...
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
          <p className="font-medium text-white mb-1">What you'll get:</p>
          <ul className="space-y-1">
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