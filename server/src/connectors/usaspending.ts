// USAspending.gov — historical federal award data (public API, no key).
// Docs: https://api.usaspending.gov/
//
// This is HISTORICAL INTELLIGENCE: which agencies have bought IT hardware and
// from whom. It is stored in a separate table and never shown as a current
// buying request.

import { BaseConnector, newId, type ConnectorContext, type ConnectorStatusReport, type HistoricalRecord, type RawDocument } from '@etm/shared';
import { env } from '../config/env';
import { politeFetch } from './http';

interface AwardRow {
  'Award ID'?: string;
  'Recipient Name'?: string;
  'Award Amount'?: number;
  'Awarding Agency'?: string;
  'Awarding Sub Agency'?: string;
  'Start Date'?: string;
  Description?: string;
  'Place of Performance State Code'?: string;
  generated_internal_id?: string;
  internal_id?: number;
}

export class USAspendingConnector extends BaseConnector<never> {
  readonly key = 'usaspending';
  readonly name = 'USAspending.gov (historical awards)';
  readonly type = 'HISTORICAL_SPENDING' as const;
  readonly confidence = 'HIGH' as const;
  readonly description = 'Past federal IT hardware awards by agency — targeting intelligence, NOT current demand.';
  readonly isLive = true;
  override readonly kind = 'historical' as const;
  readonly defaultIntervalMinutes = env.usaspending.intervalMinutes;
  override readonly docsUrl = 'https://api.usaspending.gov/';

  status(): ConnectorStatusReport {
    if (!env.usaspending.enabled) return { status: 'DISABLED', message: 'Disabled via USASPENDING_ENABLED=false' };
    return { status: 'CONNECTED', message: 'Public API — no key required. Runs daily.' };
  }

  override async test() {
    try {
      const rows = await this.query(new Date(), 1);
      return { ok: true, message: `Connected — sample award: ${rows[0]?.['Recipient Name'] ?? 'none returned'}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async fetch(): Promise<never[]> {
    return [];
  }
  normalize(): RawDocument | null {
    return null;
  }

  private async query(now: Date, limit: number, page = 1): Promise<AwardRow[]> {
    const start = new Date(now.getTime() - env.usaspending.lookbackDays * 86_400_000).toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);
    const res = await politeFetch(
      `${env.usaspending.baseUrl}/api/v2/search/spending_by_award/`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filters: {
            award_type_codes: ['A', 'B', 'C', 'D'],
            time_period: [{ start_date: start, end_date: end }],
            naics_codes: { require: env.usaspending.naicsCodes },
          },
          fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Awarding Sub Agency', 'Start Date', 'Description', 'Place of Performance State Code'],
          sort: 'Award Amount',
          order: 'desc',
          limit,
          page,
        }),
      },
      60_000,
    );
    if (!res.ok) throw new Error(`USAspending ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { results?: AwardRow[] };
    return data.results ?? [];
  }

  async fetchHistorical(ctx: ConnectorContext): Promise<HistoricalRecord[]> {
    const out: HistoricalRecord[] = [];
    const per = Math.min(100, env.usaspending.maxRecords);
    for (let page = 1; out.length < env.usaspending.maxRecords && page <= 5; page++) {
      const rows = await this.query(ctx.now, per, page);
      for (const r of rows) {
        if (!r['Award ID']) continue;
        out.push({
          id: newId('hist'),
          sourceKey: this.key,
          awardId: r['Award ID'],
          recipientName: r['Recipient Name'] ?? null,
          awardingAgency: r['Awarding Agency'] ?? null,
          awardingSubAgency: r['Awarding Sub Agency'] ?? null,
          amount: typeof r['Award Amount'] === 'number' ? r['Award Amount'] : null,
          description: r.Description ?? null,
          naicsCode: null,
          state: r['Place of Performance State Code'] ?? null,
          actionDate: r['Start Date'] ?? null,
          sourceUrl: r.generated_internal_id ? `https://www.usaspending.gov/award/${r.generated_internal_id}` : null,
          retrievedAt: ctx.now.toISOString(),
          isDemo: false,
        });
      }
      if (rows.length < per) break;
    }
    ctx.log(`${out.length} historical awards retrieved`);
    return out;
  }
}
