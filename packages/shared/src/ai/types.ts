import type { Classification, Extraction, RawDocument } from '../types';

export interface AIAnalysisResult {
  classification: Classification;
  extraction: Extraction;
  summary: string;
  reasoning: string[];
  provider: string; // "heuristic-rules", "anthropic", "openai"
  model: string | null;
  /** fields the grounding check nulled or downgraded because the source did not support them */
  groundingCorrections: string[];
  rawJson?: unknown;
}

/**
 * Vendor-neutral AI provider. Implementations: HeuristicProvider (built-in,
 * deterministic, no key), AnthropicProvider, OpenAIProvider (server-side only).
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string | null;
  isConfigured(): boolean;
  analyze(doc: RawDocument): Promise<AIAnalysisResult>;
}
