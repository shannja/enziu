// ENZIU Analysis Types

export interface Grade {
  overall: string; // A+, A, B+, B, C+, C, D, F
  clarity: string;
  coverage: string;
  claimsEfficiency: string;
}

export interface RedFlag {
  name: string;
  severity: "high" | "medium" | "low";
  page: number;
  quote: string;
}

export interface AnalysisResult {
  session_id: string;
  grade: Grade;
  topRisk: string;
  redFlags: string[];
  summary: string;
  detailedFlags?: RedFlag[];
  clauses?: Clause[];
  // Fields returned by the /api/extract sneak-peek endpoint
  extracted_text?: string;
  score_preview?: "low" | "medium" | "high";
  policy_type?: string;
  carrier_name?: string | null;
  is_scanned?: boolean;
}

export interface Clause {
  id: string;
  type: string;
  page: number;
  text: string;
  plainEnglish: string;
  concern: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  page?: number;
  disclaimer?: string;
}

export interface ChatRequest {
  session_id: string;
  message: string;
}

export interface ChatResponse {
  response: string;
  page?: number;
  excerpt?: string;
  disclaimer: string;
}

// Broker Types
export interface BrokerAnalysisResult {
  session_id: string;
  policyA: AnalysisResult;
  policyB: AnalysisResult;
  comparison: ComparisonResult;
}

export interface ComparisonResult {
  winner: "A" | "B" | "tie";
  verdict: string;
  differences: Difference[];
}

export interface Difference {
  category: string;
  policyAValue: string;
  policyBValue: string;
  winner: "A" | "B" | "tie";
  explanation: string;
}

// Voucher Types
export interface VoucherValidationRequest {
  code: string;
  passphrase: string;
}

export interface VoucherValidationResponse {
  valid: boolean;
  credits?: number;
  packType?: string;
  error?: string;
}

// Payment Types
export interface PaymentRequest {
  session_id: string;
  amount: number;
  mode: "customer" | "broker";
}

export interface PaymentResponse {
  url: string;
  session_id: string;
}

// Session Types
export interface SessionState {
  session_id: string;
  mode: "customer" | "broker";
  step: string;
  created_at: number;
  expires_at: number;
  chats_remaining: number;
}