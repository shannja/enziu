"use client";

import Link from "next/link";
import { ArrowLeft, Shield, Database, Lock, Trash2, FileText, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-50"
      >
        <div className="container mx-auto px-4 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </motion.header>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="container mx-auto px-4 py-12 max-w-4xl"
      >
        <div className="space-y-8">
          {/* Title */}
          <div className="text-center space-y-4">
            <Shield className="w-16 h-16 mx-auto text-muted-foreground" />
            <h1 className="text-4xl font-bold">Privacy Policy</h1>
            <p className="text-lg text-muted-foreground">
              Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>

          {/* Introduction */}
          <section className="prose prose-neutral dark:prose-invert max-w-none">
            <p className="text-lg leading-relaxed text-muted-foreground">
              At ENZIU, we believe your data belongs to you. We've built a privacy-first system that processes your insurance policies without storing any personal information on our servers. This policy explains exactly how your data is handled.
            </p>
          </section>

          {/* Core Principle */}
          <section className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <Lock className="w-6 h-6" />
              Our Core Privacy Principle
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Zero Data Storage:</strong> We process your insurance policy in real-time and never store any data. Your PDF is analyzed in memory and deleted immediately after processing. No personal information, no policy content, no analysis results are kept on our servers.
            </p>
          </section>

          {/* How Data is Processed */}
          <section className="space-y-6">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <Database className="w-6 h-6" />
              How Your Data is Processed
            </h2>
            
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <span className="text-sm font-bold text-primary">1</span>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Upload</h3>
                  <p className="text-muted-foreground">You upload your insurance policy PDF through our secure interface. The file is transmitted over encrypted HTTPS connection.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <span className="text-sm font-bold text-primary">2</span>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">In-Memory Processing</h3>
                  <p className="text-muted-foreground">Your PDF is read into memory using <code className="bg-muted px-1 py-0.5 rounded text-sm">io.BytesIO</code> - it never touches our servers' disk storage. The entire file exists only in RAM during processing.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <span className="text-sm font-bold text-primary">3</span>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Text Extraction</h3>
                  <p className="text-muted-foreground">We extract the text content from your PDF using PyMuPDF. Only the text content is used for analysis; the original PDF structure is discarded.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <span className="text-sm font-bold text-primary">4</span>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">AI Analysis</h3>
                  <p className="text-muted-foreground">The extracted text is sent to our AI models (Llama 4 Scout 17B and Llama 3.3 70B) for analysis. The models process the text and return structured analysis results.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <span className="text-sm font-bold text-primary">5</span>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Report Generation</h3>
                  <p className="text-muted-foreground">Our system generates a comprehensive audit report with grades, red flags, and insights based on the AI analysis.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <span className="text-sm font-bold text-primary">6</span>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Immediate Deletion</h3>
                  <p className="text-muted-foreground">Once the analysis is complete, your PDF data is immediately discarded from memory. The Python garbage collector ensures all memory is freed. No data persists on our servers.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <span className="text-sm font-bold text-primary">7</span>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Client-Side Storage</h3>
                  <p className="text-muted-foreground">The generated report is encrypted and stored only on your device using IndexedDB. You have full control over this data and can delete it at any time by clearing your browser data.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Important Limitations */}
          <section className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <AlertTriangle className="w-6 h-6" />
              Important Limitations
            </h2>
            
            <div className="space-y-4">
              <div className="flex gap-3 items-start">
                <FileText className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Insurance Documents Only</h3>
                  <p className="text-muted-foreground">ENZIU is specifically designed to analyze insurance policies. If you upload a non-insurance document (such as a contract, report, or other PDF), the system will detect this and inform you that it cannot provide an analysis. Only insurance policies are supported.</p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <FileText className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">No OCR Support</h3>
                  <p className="text-muted-foreground">Scanned documents or images within PDFs are not supported. Only digital text-based PDFs can be processed. If your PDF contains only images of text, our system cannot extract the content.</p>
                </div>
              </div>
            </div>
          </section>

          {/* What We Don't Collect */}
          <section className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <Trash2 className="w-6 h-6" />
              What We Don't Collect or Store
            </h2>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">✕</span>
                <span>Your name, email, or any personal identifiers</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">✕</span>
                <span>Your insurance policy content or PDF files</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">✕</span>
                <span>Your analysis results or reports</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">✕</span>
                <span>Payment information (handled by Paddle)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">✕</span>
                <span>Usage analytics or tracking data</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">✕</span>
                <span>IP addresses or device information</span>
              </li>
            </ul>
          </section>

          {/* Security */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Security Measures</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-semibold mb-2">In-Transit Encryption</h3>
                <p className="text-sm text-muted-foreground">All data is transmitted over HTTPS with TLS 1.3 encryption.</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-semibold mb-2">Client-Side Encryption</h3>
                <p className="text-sm text-muted-foreground">Reports are encrypted with AES-256-GCM before storage on your device.</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-semibold mb-2">No Server Storage</h3>
                <p className="text-sm text-muted-foreground">Zero data persistence on our servers. Everything is processed in memory.</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-semibold mb-2">Secure Voucher System</h3>
                <p className="text-sm text-muted-foreground">Voucher codes are cryptographically signed and hashed with bcrypt.</p>
              </div>
            </div>
          </section>

          {/* Contact */}
          <section className="text-center space-y-4 pt-8 border-t border-border">
            <h2 className="text-2xl font-bold">Questions?</h2>
            <p className="text-muted-foreground">
              If you have questions about this privacy policy, please visit our{" "}
              <Link href="/disclaimer" className="text-primary hover:underline">
                disclaimer page
              </Link>{" "}
              or check our{" "}
              <a href="https://github.com/shannja/enziu" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                GitHub repository
              </a>
              .
            </p>
          </section>
        </div>
      </motion.div>

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} ENZIU. Built for AMD Developer Hackathon 2026.</p>
          <p className="mt-2">This is a hackathon project for demonstration purposes only. Not a real operating business.</p>
        </div>
      </footer>
    </main>
  );
}