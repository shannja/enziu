"use client";

import { useState } from "react";
import { SimpleHeader } from "@/components/simple-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Key, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function BackButton() {
  const router = useRouter();
  
  return (
    <button
      onClick={() => router.back()}
      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
    >
      <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
      Back
    </button>
  );
}

export default function RecoverPage() {
  const [passphrase, setPassphrase] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveredCode, setRecoveredCode] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!passphrase.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/voucher/recover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          passphrase: passphrase,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        throw new Error(data.error || "Passphrase not found");
      }

      setRecoveredCode(data.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recover voucher");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SimpleHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto">
          <BackButton />
          <Card className="border-border">
            <CardHeader className="text-center">
              <div className="w-12 h-12 rounded-full bg-brand-amber/0 flex items-center justify-center mx-auto mb-4">
                <Key className="w-6 h-6 text-brand-amber" />
              </div>
              <CardTitle className="text-xl text-white">
                Recover Your Voucher
              </CardTitle>
              <CardDescription>
                Enter your passphrase to retrieve your voucher code.
                No email required.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {recoveredCode ? (
                <div className="text-center space-y-4">
                  <div className="flex items-center justify-center gap-2 text-brand-amber">
                    <CheckCircle className="w-6 h-6" />
                    <span className="font-medium">Voucher Recovered!</span>
                  </div>

                  <div className="bg-secondary rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-1">
                      Your voucher code:
                    </p>
                    <p className="text-2xl font-mono font-bold text-white tracking-wider">
                      {recoveredCode}
                    </p>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Use this code with your passphrase to access your credits.
                  </p>

                  <Link href="/">
                    <Button variant="amber" className="w-full">
                      Use Voucher Now
                    </Button>
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">
                      Passphrase
                    </label>
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="Enter your passphrase"
                      className="w-full bg-secondary border border-border rounded-lg px-4 py-2 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-amber"
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
                    disabled={isLoading || !passphrase.trim()}
                    variant="amber"
                    className="w-full"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        Searching...
                      </span>
                    ) : (
                      "Recover Voucher"
                    )}
                  </Button>
                </form>
              )}

              <p className="text-xs text-center text-muted-foreground mt-6">
                Your passphrase was set when you purchased your voucher pack.
                It's stored as a bcrypt hash — we never see your actual passphrase.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}