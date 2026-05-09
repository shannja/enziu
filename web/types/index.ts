// ENZIU Analysis Types — v2.0 Auditor Schema

export interface Grade {
  overall: string; // A+, A, B+, B, C+, C, D, F
  clarity: string;
  coverage: string;
  claimsEfficiency: string;
}

// ── Auditor Output Types ──────────────────────────────────────────────

export interface RedFlag {
  flag_id: string;
  source: "phrase_triggered" | "structural" | "legal_inference";
  severity: "critical" | "major" | "minor";
  deduction: number;
  page: number | null;
  excerpt: string;
  plain_english: string;
  legal_basis: string;
}

export interface Exclusion {
  type: string;
  summary: string;
  page: number;
  risk_level: "low" | "medium" | "high";
  excerpt?: string; // Verbatim text from the policy
}

export interface Clause {
  type: string;
  summary: string;
  page: number;
  risk_level: "low" | "medium" | "high";
}

export interface InsightCard {
  question: string;
  answer: string;
  category: "risk" | "savings" | "action" | "comparison" | "explain";
  priority: number; // 1–5
  page: number | null;
  excerpt?: string; // Verbatim text from PDF that supports this insight
}

export interface ComparisonReady {
  policy_type: string;
  carrier_name: string | null;
  policy_effective_date: string | null;
  annual_premium_stated: number | null;
  deductible_stated: number | null;
}

export interface SubScores {
  reading_grade: number;
  jargon_density: number;
  definitions_completeness: number;
  passive_voice: number;
  navigability: number;
}

export interface ClarityScore {
  score: number;
  grade: string;
  sub_scores: SubScores;
  estimated_grade_level: number;
  reasoning: string;
}

export interface CoverageSubScores {
  exclusion_volume: number;
  waiting_period: number;
  sub_limit_transparency: number;
  pre_existing: number;
  renewability: number;
}

export interface CoverageScore {
  score: number;
  grade: string;
  sub_scores: CoverageSubScores;
  exclusion_count: number;
  reasoning: string;
}

export interface ClaimEfficiencySubScores {
  filing_clarity: number;
  appeal_rights: number;
  payout_timeline: number;
  dispute_resolution: number;
}

export interface ClaimEfficiencyScore {
  score: number;
  grade: string;
  sub_scores: ClaimEfficiencySubScores;
  appeal_rights_present: boolean;
  payout_days_stated: number | null;
  reasoning: string;
}

// ── Analysis Result Models ─────────────────────────────────────────────

export interface AnalysisResult {
  session_id: string;
  grade: Grade;
  topRisk: string;
  redFlags: string[];
  summary: string;
  detailedFlags?: RedFlag[];
  exclusions?: Exclusion[];
  clauses?: Clause[];
  insight_cards?: InsightCard[];
  clarity?: ClarityScore;
  coverage?: CoverageScore;
  claim_efficiency?: ClaimEfficiencyScore;
  total_deductions?: number;
  plain_english_summary?: string;
  comparison_ready?: ComparisonReady;
  // Legacy sneak peek fields
  score_preview?: "low" | "medium" | "high";
  policy_type?: string;
  carrier_name?: string | null;
  extracted_text?: string;
  is_scanned?: boolean;
}

export interface UploadResponse {
  session_id: string;
  grade: Grade;
  topRisk: string;
  redFlags: string[];
  summary: string;
  policy_type?: string;
  carrier_name?: string | null;
}

// ── Voucher Types ──────────────────────────────────────────────────────

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

// ── Payment Types ──────────────────────────────────────────────────────

export interface PaymentRequest {
  session_id: string;
  amount: number;
  mode: "customer";
}

export interface PaymentResponse {
  url: string;
  session_id: string;
}

// ── Session Types ──────────────────────────────────────────────────────

export interface SessionState {
  session_id: string;
  mode: "customer";
  step: string;
  created_at: number;
  expires_at: number;
  chats_remaining: number;
}
