"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Key, Loader2, AlertCircle } from "lucide-react";
import { getRecoveryVault } from "@/lib/pdf-storage";

interface RecoveryVaultData {
  factSheet: any;
  extractedText: string;
  sessionId: string;
  pdfData?: string;
}

interface VoucherRecoveryProps {
  onRecoveryComplete: (data: RecoveryVaultData) => void;
}

export function VoucherRecovery({ onRecoveryComplete }: VoucherRecoveryProps) {
  const [voucherCode, setVoucherCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecover = async () => {
    const code = voucherCode.trim().toUpperCase();
    if (!code) return;

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Validate voucher with server
      const res = await fetch("/api/voucher/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, passphrase: "" }),  // server validates code existence
      });

      const result = await res.json();

      if (!result.valid && result.error === "Invalid voucher code format") {
        setError("Invalid voucher format. Expected: ENZ-XXXX-XXXX-XXXX-XX");
        setIsLoading(false);
        return;
      }

      // Step 2: Decrypt from IndexedDB
      const vaultData = await getRecoveryVault(code);

      if (!vaultData) {
        setError("No saved report found for this voucher. The report data may have expired or been cleared.");
        setIsLoading(false);
        return;
      }

      // Success — pass data up
      onRecoveryComplete(vaultData);
    } catch (err) {
      console.error("Recovery error:", err);
      setError("Could not verify voucher or load report. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="max-w-md mx-auto border-brand-amber/30">
      <CardHeader className="text-center">
        <CardTitle className="text-xl text-foreground flex items-center justify-center gap-2">
          <Key className="w-5 h-5 text-brand-amber" />
          Recover Your Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground text-center">
          Enter your voucher code to restore your full report instantly.
        </p>

        <input
          type="text"
          value={voucherCode}
          onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
          placeholder="ENZ-XXXX-XXXX-XXXX-XX"
          disabled={isLoading}
          className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground text-center tracking-widest text-lg placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand-amber disabled:opacity-50 font-mono"
          maxLength={22}
          onKeyDown={(e) => e.key === "Enter" && handleRecover()}
        />

        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-xs text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          onClick={handleRecover}
          disabled={!voucherCode.trim() || isLoading}
          variant="gradient-bg"
          size="lg"
          className="w-full"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Recovering…
            </span>
          ) : (
            "Restore Report"
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Your report is stored encrypted in your browser. No re-upload needed.
        </p>
      </CardContent>
    </Card>
  );
}