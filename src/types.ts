export interface KBRecord {
  id: string;
  intent: string;
  category: string;
  queries: string[];
  requiredInfo: string[];
  steps: string[];
  assignment: string;
  rawText?: string;
}

export interface MatchResult {
  ticket: KBRecord;
  score: number;
  confidence: number;
}

export interface SynthesisResult {
  category: string;
  intent: string;
  requiredInfo: string[];
  steps: string[];
  assignment: string;
  synthesisExplanation: string;
  suggestedResponse: string;
  detailedReport: string;
}

export interface KBSstats {
  totalRecords: number;
  categories: { name: string; count: number }[];
  teams: { name: string; count: number }[];
  status: string;
}
