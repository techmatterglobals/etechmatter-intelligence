// Generic SourceConnector contract. Every data source — SAM.gov, USAspending,
// state/local portals, public web discovery, demo feed — implements this, so
// new sources plug in without touching the pipeline, API or UI.

import type { ConnectorStatus, HistoricalRecord, RawDocument, SourceConfidence, SourceType } from '../types';

export interface ConnectorContext {
  now: Date;
  lastSuccessAt: string | null;
  config: Record<string, unknown>;
  log: (msg: string) => void;
  /** true if this source id is already stored (lets connectors skip detail fetches) */
  isKnown: (sourceId: string) => Promise<boolean>;
}

export interface ConnectorStatusReport {
  status: ConnectorStatus;
  message: string;
}

export interface SourceConnector<Raw = unknown> {
  readonly key: string;
  readonly name: string;
  readonly type: SourceType;
  readonly confidence: SourceConfidence;
  readonly description: string;
  /** retrieves from a real external system (vs. demo/sample data) */
  readonly isLive: boolean;
  readonly isDemo: boolean;
  /** 'opportunities' = buying signals; 'historical' = past spending intelligence (never shown as current demand) */
  readonly kind: 'opportunities' | 'historical';
  readonly defaultIntervalMinutes: number;
  readonly docsUrl: string | null;
  readonly requiredEnv: string[];

  status(config: Record<string, unknown>): ConnectorStatusReport;
  test(config: Record<string, unknown>): Promise<{ ok: boolean; message: string }>;

  /** 1. retrieve raw records from the source (respecting auth, rate limits, robots.txt) */
  fetch(ctx: ConnectorContext): Promise<Raw[]>;
  /** 2. map one raw record into the common RawDocument shape (null = skip) */
  normalize(raw: Raw, ctx: ConnectorContext): RawDocument | null;
  /** 3. clean the document text (strip HTML, collapse whitespace …) */
  parse(doc: RawDocument): RawDocument;
  /** 4. return validation errors; a document with errors is rejected (never stored without evidence) */
  validate(doc: RawDocument): string[];
  /** 5. collapse duplicates inside one batch */
  deduplicate(docs: RawDocument[]): RawDocument[];

  /** historical connectors only */
  fetchHistorical?(ctx: ConnectorContext): Promise<HistoricalRecord[]>;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** Base class with sensible defaults for parse/validate/deduplicate. */
export abstract class BaseConnector<Raw = unknown> implements SourceConnector<Raw> {
  abstract readonly key: string;
  abstract readonly name: string;
  abstract readonly type: SourceType;
  abstract readonly confidence: SourceConfidence;
  abstract readonly description: string;
  abstract readonly isLive: boolean;
  readonly isDemo: boolean = false;
  readonly kind: 'opportunities' | 'historical' = 'opportunities';
  abstract readonly defaultIntervalMinutes: number;
  readonly docsUrl: string | null = null;
  readonly requiredEnv: string[] = [];

  abstract status(config: Record<string, unknown>): ConnectorStatusReport;
  abstract fetch(ctx: ConnectorContext): Promise<Raw[]>;
  abstract normalize(raw: Raw, ctx: ConnectorContext): RawDocument | null;

  async test(config: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    const s = this.status(config);
    return { ok: s.status === 'CONNECTED' || s.status === 'DEMO', message: s.message };
  }

  parse(doc: RawDocument): RawDocument {
    const text = /<[a-z][\s\S]*>/i.test(doc.text) ? stripHtml(doc.text) : doc.text;
    return { ...doc, title: doc.title.trim(), text: text.trim() };
  }

  validate(doc: RawDocument): string[] {
    const errors: string[] = [];
    if (!doc.sourceId) errors.push('missing source_id');
    if (!doc.title && !doc.text) errors.push('empty document');
    if (!doc.retrievedAt) errors.push('missing retrieval timestamp');
    if (!doc.isDemo && !doc.sourceUrl) errors.push('missing source_url — evidence would be unverifiable');
    if ((doc.text ?? '').length + (doc.title ?? '').length < 20) errors.push('document too short to contain evidence');
    return errors;
  }

  deduplicate(docs: RawDocument[]): RawDocument[] {
    const seen = new Map<string, RawDocument>();
    for (const d of docs) {
      const k = `${d.sourceKey}:${d.sourceId}`;
      const prev = seen.get(k);
      if (!prev || (d.updatedAt ?? '') > (prev.updatedAt ?? '')) seen.set(k, d);
    }
    return [...seen.values()];
  }
}
