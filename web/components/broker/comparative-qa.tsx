"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, FileText, Scale } from "lucide-react";
import type { AnalysisResult, ChatMessage } from "@/types";

interface ComparativeQAProps {
  sessionId: string;
  policyA: AnalysisResult;
  policyB: AnalysisResult;
}

const BROKER_CHAT_LIMITS: Record<string, number> = {
  PAYG: 5,
  Starter: 10,
  Pro: 20,
  Office: 20,
};

const DEFAULT_CHAT_LIMIT = 5;

export function ComparativeQA({
  sessionId,
  policyA,
  policyB,
}: ComparativeQAProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatsRemaining, setChatsRemaining] = useState(DEFAULT_CHAT_LIMIT);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || chatsRemaining <= 0 || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setChatsRemaining((prev) => prev - 1);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/compare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: userMessage.content,
          policyA: {
            grade: policyA.grade,
            summary: policyA.summary,
          },
          policyB: {
            grade: policyB.grade,
            summary: policyB.summary,
          },
        }),
      });

      if (!response.ok) throw new Error("Comparison failed");

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.response,
        disclaimer: data.disclaimer || "page X — not legal advice",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Comparison error:", error);
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "Sorry, I couldn't process that comparison. Please try again.",
        disclaimer: "page X — not legal advice",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-border bg-card/50 h-full">
      <CardHeader>
        <CardTitle className="text-lg text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-brand-amber" />
            Comparative Q&A
          </span>
          <span className="text-sm text-muted-foreground">
            {chatsRemaining} questions remaining
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Messages */}
        <div className="space-y-4 mb-4 max-h-80 overflow-y-auto">
          {messages.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Scale className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Ask comparison questions about both policies.</p>
              <p className="text-sm mt-1">
                Both PDFs are analyzed together for data-backed answers.
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-lg p-4 ${
                  message.role === "user"
                    ? "bg-brand-amber text-black"
                    : "bg-secondary text-white"
                }`}
              >
                <p className="text-sm">{message.content}</p>
                {message.disclaimer && (
                  <p className="text-xs mt-2 opacity-50 italic">
                    {message.disclaimer}
                  </p>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-secondary rounded-lg p-4">
                <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" />
                  <div
                    className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <div
                    className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              chatsRemaining > 0
                ? "Compare coverage limits, exclusions, etc..."
                : "Chat limit reached"
            }
            disabled={chatsRemaining <= 0 || isLoading}
            className="flex-1 bg-secondary border border-border rounded-lg px-4 py-2 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-amber disabled:opacity-50"
          />
          <Button
            type="submit"
            disabled={chatsRemaining <= 0 || isLoading || !input.trim()}
            variant="amber"
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>

        {chatsRemaining <= 0 && (
          <div className="mt-4 p-3 bg-brand-amber/10 border border-brand-amber/30 rounded-lg flex items-center gap-2 text-sm text-brand-amber">
            <FileText className="w-4 h-4" />
            <span>You've used all your comparison questions for this session.</span>
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground mt-4">
          ENZIU provides analysis, not legal advice. All responses include citations.
        </p>
      </CardContent>
    </Card>
  );
}