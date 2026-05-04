"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { CreditCard, Apple, Smartphone } from "lucide-react";

interface PaddleCheckoutProps {
  amount: number;
  sessionId: string;
  onPaymentComplete: () => void;
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
        }): void;
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

  useEffect(() => {
    // Load Paddle.js
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      if (window.Paddle) {
        window.Paddle.initialize(process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "");
        window.Paddle.Environment.set("sandbox");
        setIsPaddleLoaded(true);
      }
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleCheckout = () => {
    if (!window.Paddle) return;

    setIsProcessing(true);

    // In production, you would create a checkout on your server first
    // and get a real price ID. For now, we simulate the flow.
    window.Paddle.Checkout.open({
      settings: {
        mode: "payment",
        allowLogout: true,
      },
      items: [
        {
          // This would be a real price ID from your Paddle dashboard
          priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID || "pri_0123456789",
          quantity: 1,
        },
      ],
      customData: {
        session_id: sessionId,
      },
    });

    // Simulate payment completion for demo
    setTimeout(() => {
      setIsProcessing(false);
      onPaymentComplete();
    }, 3000);
  };

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

        <Button
          onClick={handleCheckout}
          disabled={!isPaddleLoaded || isProcessing}
          variant="amber"
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