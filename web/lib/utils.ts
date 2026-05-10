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
    "N/A": "text-muted-foreground",
  };
  return colors[grade] || "text-muted-foreground";
}

/** Check if a grade is a valid letter grade (A+ to F) or N/A */
export function isValidGrade(grade: string): boolean {
  return ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "N/A"].includes(grade);
}

/** Check if a grade is N/A (not applicable) */
export function isNaGrade(grade: string): boolean {
  return grade === "N/A";
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

/**
 * Generate a random passphrase for voucher recovery.
 * Format: 4 random words separated by hyphens (e.g., "Blue9Kite-Run7Tree-Jump2Moon-Sing5Star")
 * 
 * @param wordCount Number of words in the passphrase (default: 4)
 * @returns A random passphrase string
 */
export function generateRandomPassphrase(wordCount: number = 4): string {
  const adjectives = [
    "Blue", "Red", "Green", "Gold", "Dark", "Bright", "Swift", "Calm",
    "Bold", "Eager", "Fierce", "Gentle", "Happy", "Jolly", "Kind", "Lively",
    "Mighty", "Noble", "Proud", "Quick", "Rare", "Strong", "True", "Unique",
    "Vivid", "Warm", "Young", "Zesty"
  ];
  
  const nouns = [
    "Kite", "Tree", "Moon", "Star", "River", "Cloud", "Stone", "Flame",
    "Wind", "Snow", "Rain", "Fire", "Ice", "Rock", "Sky", "Sea",
    "Sun", "Wave", "Leaf", "Bird", "Fish", "Wolf", "Bear", "Eagle",
    "Tiger", "Lion", "Hawk", "Fox"
  ];
  
  const verbs = [
    "Run", "Jump", "Fly", "Sing", "Dance", "Play", "Dream", "Seek",
    "Find", "Grow", "Shine", "Glow", "Flow", "Rise", "Fall", "Spin",
    "Turn", "Leap", "Soar", "Sweep", "Glide", "Climb", "Rush", "Dash"
  ];
  
  const words: string[] = [];
  
  for (let i = 0; i < wordCount; i++) {
    // Each word group: Adjective + Number + Noun + Verb
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const num = Math.floor(Math.random() * 10);
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const verb = verbs[Math.floor(Math.random() * verbs.length)];
    
    // Randomly choose between two patterns
    if (Math.random() > 0.5) {
      words.push(`${adj}${num}${noun}`);
    } else {
      words.push(`${verb}${num}${noun}`);
    }
  }
  
  return words.join("-");
}

/**
 * Copy text to clipboard
 * 
 * @param text Text to copy
 * @returns Promise<boolean> True if successful
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      document.body.removeChild(textArea);
      return true;
    } catch {
      document.body.removeChild(textArea);
      return false;
    }
  }
}
