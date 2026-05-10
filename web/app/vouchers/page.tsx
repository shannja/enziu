"use client";

import { SimpleHeader } from "@/components/simple-header";
import { Footer } from "@/components/footer";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";

const packs = [
  {
    name: "Starter",
    price: "$50",
    sessions: "10 sessions",
    chats: "10 chats per session",
    badge: "Get started",
    badgeVariant: "default" as const,
  },
  {
    name: "Pro",
    price: "$100",
    sessions: "25 sessions",
    chats: "20 chats per session",
    badge: "Preferred",
    badgeVariant: "preferred" as const,
  },
  {
    name: "Office",
    price: "$200",
    sessions: "50 sessions",
    chats: "20 chats per session",
    badge: "For firms",
    badgeVariant: "default" as const,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
    },
  },
};

function BackButton() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 group"
    >
      <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
      Back
    </Link>
  );
}

export default function VoucherPacksPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SimpleHeader />
      
      <main className="flex-1 container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto"
        >
          <BackButton />
          
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Voucher Packs
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Choose the pack that fits your needs. All packs include access to our full policy analysis engine.
            </p>
          </div>

          {/* Pricing Grid */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16"
          >
            {packs.map((pack, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                className={`relative bg-card border rounded-lg p-6 flex flex-col ${
                  pack.badgeVariant === "preferred"
                    ? "border-brand-amber/50 shadow-lg shadow-brand-amber/10"
                    : "border-border"
                }`}
              >
                {/* Badge */}
                <div className="mb-4">
                  <span
                    className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                      pack.badgeVariant === "preferred"
                        ? "bg-brand-amber/10 text-brand-amber"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {pack.badge}
                  </span>
                </div>

                {/* Plan name */}
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  {pack.name}
                </h2>

                {/* Price */}
                <div className="mb-6">
                  <span className="text-3xl font-bold text-foreground">
                    {pack.price}
                  </span>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-brand-amber flex-shrink-0" />
                    {pack.sessions}
                  </li>
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-brand-amber flex-shrink-0" />
                    {pack.chats}
                  </li>
                </ul>

                {/* CTA Button */}
                <button
                  className={`w-full py-3 rounded-lg font-medium transition-colors ${
                    pack.badgeVariant === "preferred"
                      ? "bg-brand-gradient text-black hover:bg-brand-amber/90"
                      : "bg-secondary text-foreground hover:bg-secondary/80"
                  }`}
                >
                  Get {pack.name}
                </button>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}