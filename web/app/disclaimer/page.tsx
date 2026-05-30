"use client";

import Link from "next/link";
import { ArrowLeft, AlertTriangle, Github, ExternalLink, Trophy, Code } from "lucide-react";
import { motion } from "framer-motion";

export default function DisclaimerPage() {
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
            <AlertTriangle className="w-16 h-16 mx-auto text-muted-foreground" />
            <h1 className="text-4xl font-bold">Disclaimer</h1>
            <p className="text-lg text-muted-foreground">
              Important information about this project
            </p>
          </div>

          {/* Main Disclaimer */}
          <section className="bg-card border border-border rounded-lg p-8 space-y-6">
            <div className="flex items-start gap-4">
              <Trophy className="w-8 h-8 text-primary shrink-0 mt-1" />
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Hackathon Project</h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  ENZIU was built for the <strong className="text-foreground">AMD Developer Hackathon 2026</strong>, organized by lablab.ai. This is a demonstration project created for competition purposes only and is not intended to be a real operating business or commercial product.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <Code className="w-8 h-8 text-primary shrink-0 mt-1" />
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Technology Demonstration</h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  This project showcases a multi-agent AI system for insurance policy analysis using Llama 4 Scout 17B and Llama 3.3 70B models. It demonstrates privacy-first architecture with zero server-side data storage and client-side encrypted report storage.
                </p>
              </div>
            </div>
          </section>

          {/* Important Notices */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Important Notices</h2>
            
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <div className="flex gap-3 items-start">
                <span className="text-amber-500 text-xl mt-0.5">⚠️</span>
                <div>
                  <h3 className="font-semibold mb-1">Not Financial or Legal Advice</h3>
                  <p className="text-muted-foreground">
                    ENZIU provides automated analysis of insurance policies for informational purposes only. The analysis should not be considered financial, legal, or insurance advice. Always consult with a qualified insurance professional, attorney, or financial advisor for important decisions regarding your insurance coverage.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="text-amber-500 text-xl mt-0.5">⚠️</span>
                <div>
                  <h3 className="font-semibold mb-1">No Warranty</h3>
                  <p className="text-muted-foreground">
                    This project is provided "as is" without any warranties, express or implied. The developers make no guarantees about the accuracy, completeness, or reliability of the analysis results. Use at your own discretion.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="text-amber-500 text-xl mt-0.5">⚠️</span>
                <div>
                  <h3 className="font-semibold mb-1">Educational Purpose</h3>
                  <p className="text-muted-foreground">
                    ENZIU is intended for educational and demonstration purposes. While we strive for accuracy, the AI models may produce errors or miss important details in complex insurance policies. Do not rely solely on this tool for critical insurance decisions.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="text-amber-500 text-xl mt-0.5">⚠️</span>
                <div>
                  <h3 className="font-semibold mb-1">Limited Support</h3>
                  <p className="text-muted-foreground">
                    As a hackathon project, ENZIU has limited support and maintenance. The service may be unavailable at times, and features may change or be removed without notice.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Project Links */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Project Links</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              <a
                href="https://github.com/shannja/enziu"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-card border border-border rounded-lg p-6 flex items-center gap-4 hover:border-primary transition-colors group"
              >
                <Github className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
                <div>
                  <h3 className="font-semibold mb-1">GitHub Repository</h3>
                  <p className="text-sm text-muted-foreground">View source code and documentation</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground ml-auto" />
              </a>

              <a
                href="https://lablab.ai/ai-hackathons/amd-developer/eseyem/enziu"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-card border border-border rounded-lg p-6 flex items-center gap-4 hover:border-primary transition-colors group"
              >
                <Trophy className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
                <div>
                  <h3 className="font-semibold mb-1">Hackathon Submission</h3>
                  <p className="text-sm text-muted-foreground">View on lablab.ai</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground ml-auto" />
              </a>
            </div>
          </section>

          {/* Acknowledgments */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Acknowledgments</h2>
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground leading-relaxed">
                This project was built using <strong className="text-foreground">Llama 4 Scout 17B</strong> and <strong className="text-foreground">Llama 3.3 70B</strong> models from Meta AI, powered by <strong className="text-foreground">AMD Developer Cloud</strong> and <strong className="text-foreground">NScale</strong> infrastructure. Special thanks to the AMD Developer Hackathon team and lablab.ai for organizing this competition.
              </p>
            </div>
          </section>

          {/* Contact */}
          <section className="text-center space-y-4 pt-8 border-t border-border">
            <h2 className="text-2xl font-bold">Have Questions?</h2>
            <p className="text-muted-foreground">
              For more information, please visit our{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                privacy policy
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