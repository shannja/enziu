"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Check, Zap } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface VoucherPacksProps {
  onPaymentComplete: () => void;
}

interface VoucherPack {
  name: string;
  price: number;
  comparisons: number;
  chatsPerSession: number;
  perComparison: number;
  popular?: boolean;
  label: string;
}

const packs: VoucherPack[] = [
  {
    name: "PAYG",
    price: 4.99,
    comparisons: 1,
    chatsPerSession: 5,
    perComparison: 4.99,
    label: "Try it",
  },
  {
    name: "Starter",
    price: 50,
    comparisons: 10,
    chatsPerSession: 10,
    perComparison: 5.0,
    label: "Get started",
  },
  {
    name: "Pro",
    price: 100,
    comparisons: 25,
    chatsPerSession: 20,
    perComparison: 4.0,
    popular: true,
    label: "Preferred",
  },
  {
    name: "Office",
    price: 200,
    comparisons: 50,
    chatsPerSession: 20,
    perComparison: 4.0,
    label: "For firms",
  },
];

export function VoucherPacks({ onPaymentComplete }: VoucherPacksProps) {
  const [selectedPack, setSelectedPack] = useState<VoucherPack | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSelectPack = (pack: VoucherPack) => {
    setSelectedPack(pack);
    setIsProcessing(true);

    // Simulate payment processing
    setTimeout(() => {
      setIsProcessing(false);
      onPaymentComplete();
    }, 2000);
  };

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
    </div>
  );
}