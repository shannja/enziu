import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export function getGradeColor(grade: string): string {
  const colors: Record<string, string> = {
    "A+": "text-brand-grade-a",
    A: "text-brand-grade-a",
    "A-": "text-brand-grade-a",
    "B+": "text-brand-grade-b",
    B: "text-brand-grade-b",
    "B-": "text-brand-grade-b",
    "C+": "text-brand-grade-c",
    C: "text-brand-grade-c",
    "C-": "text-brand-grade-c",
    "D+": "text-brand-grade-d",
    D: "text-brand-grade-d",
    "D-": "text-brand-grade-d",
    F: "text-brand-grade-f",
  };
  return colors[grade] || "text-muted-foreground";
}

export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}