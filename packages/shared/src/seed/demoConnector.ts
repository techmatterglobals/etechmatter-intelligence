import { BaseConnector, type ConnectorContext, type ConnectorStatusReport } from '../pipeline/connector';
import type { RawDocument } from '../types';
import { DEMO_CHANNELS, DEMO_NOTICES, type DemoNotice } from './demoNotices';

const fmt = (base: Date) => (days: number) =>
  new Date(base.getTime() + days * 86_400_000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const isoAt = (base: Date) => (days: number) => {
  const d = new Date(base.getTime() + days * 86_400_000);
  d.setUTCHours(17, 0, 0, 0);
  return d.toISOString();
};

/**
 * DEMO FEED connector — clearly labelled sample data.
 *  mode "initial": returns the seed notices (used once when the database is empty)
 *  mode "feed":    each Sync Now releases the next few held-back sample notices,
 *                  so the full pipeline (dedupe → AI → scoring → matching → alerts)
 *                  can be exercised without live credentials. When the sample
 *                  pool is exhausted it returns nothing — it never fabricates more.
 */
export class DemoFeedConnector extends BaseConnector<DemoNotice> {
  readonly key = 'demo_feed';
  readonly name = 'Demo Feed (sample data)';
  readonly type = 'PUBLIC_WEB' as const;
  readonly confidence = 'LOW' as const;
  readonly description =
    'Fictional sample notices that exercise the full pipeline. Every record is badged DEMO DATA. Disable in production.';
  readonly isLive = false;
  override readonly isDemo = true;
  readonly defaultIntervalMinutes = 0; // manual only
  mode: 'initial' | 'feed' = 'feed';
  batchSize = 3;
  /** keys already released; persisted by the caller in source config */
  released = new Set<string>();

  status(): ConnectorStatusReport {
    const remaining = DEMO_NOTICES.filter((n) => n.release === 'feed' && !this.released.has(n.key)).length;
    return { status: 'DEMO', message: `Sample data only — ${remaining} held-back demo notice(s) left for Sync Now` };
  }

  async fetch(ctx: ConnectorContext): Promise<DemoNotice[]> {
    const rel = (ctx.config.released as string[] | undefined) ?? [];
    rel.forEach((k) => this.released.add(k));
    if (this.mode === 'initial') return DEMO_NOTICES.filter((n) => n.release === 'initial');
    const next = DEMO_NOTICES.filter((n) => n.release === 'feed' && !this.released.has(n.key)).slice(0, this.batchSize);
    next.forEach((n) => this.released.add(n.key));
    ctx.config.released = [...this.released];
    return next;
  }

  normalize(n: DemoNotice, ctx: ConnectorContext): RawDocument {
    const base = this.mode === 'initial' ? ctx.now : ctx.now;
    const ch = DEMO_CHANNELS[n.channel];
    const s = n.structured?.(isoAt(base));
    const retrieved = new Date(ctx.now.getTime() - n.discoveredMinutesAgo * 60_000).toISOString();
    return {
      sourceKey: this.key,
      sourceName: ch.name,
      sourceType: ch.type,
      sourceConfidence: ch.confidence,
      sourceId: `demo-${n.key}`,
      sourceUrl: null, // demo records have no live original — the UI says so explicitly
      title: n.title,
      text: n.text(fmt(base)),
      publishedAt: new Date(ctx.now.getTime() - n.publishedHoursAgo * 3_600_000).toISOString(),
      updatedAt: null,
      retrievedAt: retrieved,
      structured: s
        ? {
            organizationName: s.organizationName,
            organizationType: s.organizationType ?? null,
            city: s.city,
            state: s.state,
            zip: s.zip,
            country: 'US',
            deadline: s.deadline ?? null,
            procurementType: s.procurementType,
            contacts: s.contacts ?? [],
            naics: s.naics ?? null,
            psc: s.psc ?? null,
            setAside: s.setAside ?? null,
            solicitationNumber: s.solicitationNumber ?? null,
          }
        : undefined,
      isDemo: true,
    };
  }
}
