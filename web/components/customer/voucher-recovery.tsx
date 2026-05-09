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

const VOUCHER_REGEX = /^ENZ-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/;

export function VoucherRecovery({ onRecoveryComplete }: VoucherRecoveryProps) {
  const [voucherCode, setVoucherCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecover = async () => {
    const code = voucherCode.trim().toUpperCase();
    if (!code) return;

    if (!VOUCHER_REGEX.test(code)) {
      setError("Invalid voucher format. Expected: ENZ-XXXX-XXXX-XXXX-XX");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const local = await getRecoveryVault(code);
      if (local) {
        onRecoveryComplete(local);
        return;
      }

      setError(
        "No report found for this voucher on this device. " +
        "Reports are stored only in your browser — they cannot be recovered " +
        "after clearing browser data or on a different device. " +
        "Please re-upload your policy PDF to generate a new report."
      );
    } catch (err) {
      console.error("[VoucherRecovery] IndexedDB error:", err);
      setError("Could not read local storage. Please try again.");
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
          Enter your voucher code to restore your report from this device.
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
              Checking…
            </span>
          ) : (
            "Restore Report"
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Your report is stored encrypted on this device only. Nothing is sent to our servers.
        </p>
      </CardContent>
    </Card>
  );
}