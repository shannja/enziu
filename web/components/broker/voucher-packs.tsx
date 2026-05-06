"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Check, Zap, RefreshCw, Copy, AlertTriangle, X, AlignLeft } from "lucide-react";
import { formatCurrency, generateRandomPassphrase, copyToClipboard } from "@/lib/utils";

interface VoucherPacksProps {
  onPaymentComplete: (voucherCode?: string, packType?: string) => void;
}

interface VoucherPack {
  name: string;
  price: number;
  comparisons: number;
  chatsPerSession: number;
  perComparison: number;
  popular?: boolean;
  label: string;
  priceId: string;
}

const packs: VoucherPack[] = [
  {
    name: "PAYG",
    price: 4.99,
    comparisons: 1,
    chatsPerSession: 5,
    perComparison: 4.99,
    label: "Try it",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PAYG || "pri_0123456789",
  },
  {
    name: "Starter",
    price: 50,
    comparisons: 10,
    chatsPerSession: 10,
    perComparison: 5.0,
    label: "Get started",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_STARTER || "pri_0123456790",
  },
  {
    name: "Pro",
    price: 100,
    comparisons: 25,
    chatsPerSession: 20,
    perComparison: 4.0,
    popular: true,
    label: "Preferred",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO || "pri_0123456791",
  },
  {
    name: "Office",
    price: 200,
    comparisons: 50,
    chatsPerSession: 20,
    perComparison: 4.0,
    label: "For firms",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_OFFICE || "pri_0123456792",
  },
];


export function VoucherPacks({ onPaymentComplete }: VoucherPacksProps) {
  const [selectedPack, setSelectedPack] = useState<VoucherPack | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaddleLoaded, setIsPaddleLoaded] = useState(false);
  const [showPassphraseModal, setShowPassphraseModal] = useState(false);
  const [passphrase, setPassphrase] = useState("");
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
        window.Paddle.Initialize({ token: clientToken });
        window.Paddle.Environment.set("sandbox");
        setIsPaddleLoaded(true);
      }
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleSelectPack = (pack: VoucherPack) => {
    setSelectedPack(pack);
    setShowPassphraseModal(true);
  };

  const handleGeneratePassphrase = () => {
    const newPassphrase = generateRandomPassphrase();
    setPassphrase(newPassphrase);
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

  const handleProceedToPayment = () => {
    if (!passphrase || passphrase.length < 8) {
      alert("Please generate or enter a passphrase (minimum 8 characters)");
      return;
    }

    if (!selectedPack || !window.Paddle) return;

    setIsProcessing(true);
    setShowPassphraseModal(false);

    window.Paddle.Checkout.open({
      items: [
        {
          priceId: selectedPack.priceId,
          quantity: 1,
        },
      ],
      customData: {
        pack_type: selectedPack.name,
      },
    });

    // Note: Event handling is done via fallback timeout below

    // Fallback: simulate completion for demo if event doesn't fire
    setTimeout(() => {
      if (isProcessing) {
        setIsProcessing(false);
        // For demo purposes, generate a mock voucher
        const mockVoucher = `ENZ-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        setGeneratedVoucher(mockVoucher);
        onPaymentComplete(mockVoucher, selectedPack?.name);
      }
    }, 5000);
  };

  const closePassphraseModal = () => {
    setShowPassphraseModal(false);
    setPassphrase("");
  };

  // Show generated voucher modal
  if (generatedVoucher) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="border-brand-amber/30 bg-green-900/20">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-white flex items-center justify-center gap-2">
              <Check className="w-6 h-6 text-green-400" />
              Payment Successful!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Your voucher code:</p>
              <div className="text-3xl font-bold text-brand-amber font-mono bg-black/30 p-4 rounded-lg">
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
              <p>Your {selectedPack?.name} pack is now active!</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-medium text-white">Buy a Voucher Pack</h3>
        <p className="text-sm text-muted-foreground">
          No subscriptions. Buy once, use forever.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {packs.map((pack) => (
          <Card
            key={pack.name}
            className={`relative cursor-pointer transition-all ${
              selectedPack?.name === pack.name
                ? "border-[#ffb753] bg-[rgba(255,183,83,0.05)]"
                : "border-border hover:border-[#ffb753]/50"
            } ${pack.popular ? "ring-2 ring-[#ffb753]/50" : ""}`}
            onClick={() => !selectedPack && handleSelectPack(pack)}
          >
            {pack.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#ffde59] to-[#ff914d] text-black text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                <Zap className="w-3 h-3" style={{ stroke: '#151515' }} />
                Most Popular
              </div>
            )}

            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-white">{pack.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{pack.label}</p>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="text-3xl font-bold bg-gradient-to-r from-[#ffde59] to-[#ff914d] bg-clip-text text-transparent">
                {formatCurrency(pack.price)}
              </div>

              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4" style={{ stroke: 'url(#icon-gradient)' }} />
                  <span className="text-white">
                    {pack.comparisons} comparison{pack.comparisons > 1 ? "s" : ""}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4" style={{ stroke: 'url(#icon-gradient)' }} />
                  <span className="text-white">
                    {pack.chatsPerSession} chats per session
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4" style={{ stroke: 'url(#icon-gradient)' }} />
                  <span className="text-white">
                    {formatCurrency(pack.perComparison)} per comparison
                  </span>
                </li>
              </ul>
            </CardContent>

            <CardFooter>
              <Button
                className="w-full"
                variant={selectedPack?.name === pack.name ? "gradient-bg" : "gradient-outline"}
                disabled={!!selectedPack && selectedPack.name !== pack.name}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!selectedPack) handleSelectPack(pack);
                }}
              >
                {selectedPack?.name === pack.name && isProcessing ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  "Select"
                )}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <p className="text-xs text-center text-muted-foreground">
        All payments processed securely by Paddle. VAT and sales tax included where applicable.
      </p>

      {/* Passphrase Modal */}
      {showPassphraseModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full border-brand-amber/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg text-white">
                Set Recovery Passphrase
              </CardTitle>
              <Button
                onClick={closePassphraseModal}
                className="text-muted-foreground hover:text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-blue-200 mb-1">
                      <strong>Why you need a passphrase:</strong>
                    </p>
                    {/* Added list-none and pl-0 to flush the list left */}
                    <ul className="text-blue-100/80 space-y-1 list-none pl-0">
                      <li>• No email required - complete privacy</li>
                      <li>• Use this to recover your voucher if lost</li>
                      <li>• Choose something memorable but secure</li>
                      <li>• Minimum 8 characters</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Passphrase
                </label>
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
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Generate
                  </Button>
                </div>
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

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={closePassphraseModal}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="gradient-bg"
                  onClick={handleProceedToPayment}
                  disabled={!passphrase || passphrase.length < 8 || !isPaddleLoaded}
                  className="flex-1"
                >
                  Continue to Payment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}