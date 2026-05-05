"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Key, AlertCircle, CheckCircle } from "lucide-react";

interface VoucherInputProps {
  onValidated: (credits: number) => void;
}

export function VoucherInput({ onValidated }: VoucherInputProps) {
  const [code, setCode] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim() || !passphrase.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/voucher/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          passphrase: passphrase,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        throw new Error(data.error || "Invalid voucher code or passphrase");
      }

      setSuccess(true);
      onValidated(data.credits || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate voucher");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="border-[#ffb753]/30 bg-[rgba(255,183,83,0.05)]">
        <CardContent className="flex items-center gap-3 py-6">
          <CheckCircle className="w-6 h-6" style={{ stroke: 'url(#icon-gradient)' }} />
          <div>
            <p className="font-medium text-white">Voucher Applied!</p>
            <p className="text-sm text-muted-foreground">
              You have credits available for comparisons.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg text-white flex items-center gap-2">
          <Key className="w-5 h-5" style={{ stroke: 'url(#icon-gradient)' }} />
          Have a Voucher Code?
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              Voucher Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ENZ-R9T2-K8P1-XQ9W"
              className="w-full bg-secondary border border-border rounded-lg px-4 py-2 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#ffb753] uppercase tracking-wider"
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              Passphrase
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter your passphrase"
              className="w-full bg-secondary border border-border rounded-lg px-4 py-2 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#ffb753]"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-brand-grade-f">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || !code.trim() || !passphrase.trim()}
            variant="gradient-bg"
            className="w-full"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Validating...
              </span>
            ) : (
              "Apply Voucher"
            )}
          </Button>
        </form>

          <p className="text-xs text-center text-muted-foreground mt-4">
            Lost your code?{" "}
            <a href="/recover" className="text-gradient hover:underline">
              Recover with passphrase
            </a>
          </p>
      </CardContent>
    </Card>
  );
}