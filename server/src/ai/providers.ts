// AI provider abstraction — vendor-neutral. Choose with AI_PROVIDER:
//   heuristic  (default)  deterministic rules engine, no key, no cost
//   anthropic             Claude via the Messages API (ANTHROPIC_API_KEY, AI_MODEL)
//   openai                OpenAI or any OpenAI-compatible endpoint (OPENAI_API_KEY, OPENAI_BASE_URL, AI_MODEL)
//
// All LLM output goes through: JSON parse → schema validation → grounding
// (values not literally present in the source are removed) → merge with the
// deterministic baseline. Any failure falls back to the heuristic engine.

import {
  buildPrompt,
  groundOutput,
  HeuristicProvider,
  parseJson,
  validateOutput,
  type AIAnalysisResult,
  type AIProvider,
  type RawDocument,
} from '@etm/shared';
import { env } from '../config/env';

abstract class LLMProvider implements AIProvider {
  abstract readonly name: string;
  constructor(readonly model: string) {}
  abstract isConfigured(): boolean;
  protected abstract complete(system: string, user: string): Promise<string>;

  async analyze(doc: RawDocument): Promise<AIAnalysisResult> {
    const { system, user } = buildPrompt(doc);
    const text = await this.complete(system, user);
    const parsed = parseJson(text);
    const v = validateOutput(parsed);
    if (!v.ok) throw new Error(`Schema-invalid AI output: ${v.errors.join('; ')}`);
    const r = groundOutput(doc, v.value, this.name, this.model);
    r.rawJson = parsed;
    return r;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export class AnthropicProvider extends LLMProvider {
  readonly name = 'anthropic';
  isConfigured() {
    return !!env.ai.anthropicKey && !!this.model;
  }
  protected async complete(system: string, user: string) {
    const res = await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ai.anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: this.model, max_tokens: 4000, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
      },
      env.ai.timeoutMs,
    );
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  }
}

export class OpenAIProvider extends LLMProvider {
  readonly name = 'openai';
  isConfigured() {
    return !!env.ai.openaiKey && !!this.model;
  }
  protected async complete(system: string, user: string) {
    const res = await fetchWithTimeout(
      `${env.ai.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.ai.openaiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      },
      env.ai.timeoutMs,
    );
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? '';
  }
}

/** Wraps an LLM provider with a small concurrency limiter + heuristic fallback. */
class GuardedProvider implements AIProvider {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private inner: AIProvider, private fallback: AIProvider, private limit: number) {}
  get name() {
    return this.inner.name;
  }
  get model() {
    return this.inner.model;
  }
  isConfigured() {
    return this.inner.isConfigured();
  }
  async analyze(doc: RawDocument): Promise<AIAnalysisResult> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await this.inner.analyze(doc);
    } catch (e) {
      console.warn(`[ai] ${this.inner.name} failed (${e instanceof Error ? e.message : e}); falling back to heuristic engine`);
      const r = await this.fallback.analyze(doc);
      r.reasoning = [...r.reasoning, `LLM provider "${this.inner.name}" failed — analysed by rules engine`];
      return r;
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export function createAIProvider(): { provider: AIProvider; status: { name: string; model: string | null; configured: boolean; message: string } } {
  const heuristic = new HeuristicProvider();
  const choice = env.ai.provider;
  let llm: LLMProvider | null = null;
  if (choice === 'anthropic') llm = new AnthropicProvider(env.ai.model);
  if (choice === 'openai') llm = new OpenAIProvider(env.ai.model);
  if (llm && llm.isConfigured()) {
    return {
      provider: new GuardedProvider(llm, heuristic, env.ai.maxConcurrency),
      status: { name: llm.name, model: llm.model, configured: true, message: `${llm.name} (${llm.model}) with grounding + rules-engine fallback` },
    };
  }
  const why = llm ? `AI_PROVIDER=${choice} but ${choice === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} or AI_MODEL is missing — using rules engine` : 'Built-in rules engine (no LLM key configured)';
  return { provider: heuristic, status: { name: heuristic.name, model: null, configured: true, message: why } };
}
