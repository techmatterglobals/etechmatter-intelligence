// SAM.gov Contract Opportunities — official public API.
// Docs: https://open.gsa.gov/api/get-opportunities-public-api/
//
// Requires SAM_API_KEY (free, from your SAM.gov account → "Public API Key").
// The key stays on the server; it is never sent to the browser.
//
// Request budget: SAM.gov applies daily request limits per key (non-federal
// personal keys have a low daily cap). This connector makes ONE search request
// per run (plus pagination), filters locally for IT hardware, and refuses to
// exceed SAM_DAILY_REQUEST_LIMIT so a 15-minute schedule can't burn the key.

import {
  BaseConnector,
  CATEGORY_PATTERNS,
  type ConnectorContext,
  type ConnectorStatusReport,
  type ContactInfo,
  type ProcurementType,
  type RawDocument,
} from '@etm/shared';
import { env } from '../config/env';
import { politeFetch, SourceAccessError } from './http';

export interface SamNotice {
  noticeId: string;
  title: string;
  solicitationNumber?: string | null;
  fullParentPathName?: string | null;
  department?: string | null;
  subTier?: string | null;
  office?: string | null;
  postedDate?: string | null;
  type?: string | null;
  baseType?: string | null;
  archiveDate?: string | null;
  typeOfSetAsideDescription?: string | null;
  typeOfSetAside?: string | null;
  responseDeadLine?: string | null;
  naicsCode?: string | null;
  classificationCode?: string | null;
  active?: string | null;
  description?: string | null; // URL to the description endpoint
  descriptionText?: string | null; // filled when SAM_FETCH_DESCRIPTIONS=true
  organizationType?: string | null;
  uiLink?: string | null;
  additionalInfoLink?: string | null;
  pointOfContact?: { fullName?: string | null; title?: string | null; email?: string | null; phone?: string | null; type?: string | null }[] | null;
  officeAddress?: { city?: string | null; state?: string | null; zipcode?: string | null; countryCode?: string | null } | null;
  placeOfPerformance?: {
    city?: { name?: string | null } | null;
    state?: { code?: string | null; name?: string | null } | null;
    zip?: string | null;
    country?: { code?: string | null } | null;
  } | null;
}

const mmddyyyy = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;

export function samTypeToProcurement(type?: string | null): ProcurementType {
  const t = (type ?? '').toLowerCase();
  if (t.includes('combined')) return 'COMBINED_SYNOPSIS';
  if (t.includes('presolicitation')) return 'PRESOLICITATION';
  if (t.includes('sources sought')) return 'SOURCES_SOUGHT';
  if (t.includes('award')) return 'AWARD';
  if (t.includes('justification') || t.includes('sole source')) return 'SOLE_SOURCE';
  if (t.includes('solicitation')) return 'SOLICITATION';
  return 'UNKNOWN';
}

export class SamGovConnector extends BaseConnector<SamNotice> {
  readonly key = 'sam_gov';
  readonly name = 'SAM.gov Contract Opportunities';
  readonly type = 'FEDERAL_PROCUREMENT' as const;
  readonly confidence = 'HIGH' as const;
  readonly description = 'Official federal procurement notices (solicitations, RFQs, combined synopses, sources sought, presolicitations).';
  readonly isLive = true;
  readonly defaultIntervalMinutes = env.sam.intervalMinutes;
  override readonly docsUrl = 'https://open.gsa.gov/api/get-opportunities-public-api/';
  override readonly requiredEnv = ['SAM_API_KEY'];

  status(config: Record<string, unknown>): ConnectorStatusReport {
    if (!env.sam.apiKey) return { status: 'NOT_CONFIGURED', message: 'Live SAM.gov connector not configured — set SAM_API_KEY on the server.' };
    const used = this.requestsToday(config);
    if (used >= env.sam.dailyRequestLimit)
      return { status: 'PARTIAL', message: `Daily request budget used (${used}/${env.sam.dailyRequestLimit}). Resumes after midnight UTC.` };
    return { status: 'CONNECTED', message: `API key configured · ${used}/${env.sam.dailyRequestLimit} requests used today` };
  }

  private requestsToday(config: Record<string, unknown>) {
    const today = new Date().toISOString().slice(0, 10);
    return config.budgetDate === today ? Number(config.budgetUsed ?? 0) : 0;
  }
  private spend(config: Record<string, unknown>) {
    const today = new Date().toISOString().slice(0, 10);
    if (config.budgetDate !== today) {
      config.budgetDate = today;
      config.budgetUsed = 0;
    }
    if (Number(config.budgetUsed) >= env.sam.dailyRequestLimit) throw new SourceAccessError('SAM.gov daily request budget exhausted');
    config.budgetUsed = Number(config.budgetUsed) + 1;
  }

  override async test(config: Record<string, unknown>) {
    if (!env.sam.apiKey) return { ok: false, message: 'Live SAM.gov connector not configured — SAM_API_KEY missing.' };
    try {
      this.spend(config);
      const now = new Date();
      const url = new URL(env.sam.baseUrl);
      url.searchParams.set('api_key', env.sam.apiKey);
      url.searchParams.set('postedFrom', mmddyyyy(new Date(now.getTime() - 86_400_000)));
      url.searchParams.set('postedTo', mmddyyyy(now));
      url.searchParams.set('limit', '1');
      const res = await politeFetch(url.toString());
      if (!res.ok) return { ok: false, message: `SAM.gov responded ${res.status}: ${(await res.text()).slice(0, 200)}` };
      const data = (await res.json()) as { totalRecords?: number };
      return { ok: true, message: `Connected — ${data.totalRecords ?? 0} notices posted in the last 24h (all types).` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async fetch(ctx: ConnectorContext): Promise<SamNotice[]> {
    const now = ctx.now;
    const lookback = new Date(now.getTime() - env.sam.lookbackDays * 86_400_000);
    const since = ctx.lastSuccessAt ? new Date(Math.max(new Date(ctx.lastSuccessAt).getTime() - 86_400_000, lookback.getTime())) : lookback;
    const out: SamNotice[] = [];
    const types = env.sam.noticeTypes.split(',').map((s) => s.trim()).filter(Boolean);
    let offset = 0;
    for (let page = 0; page < env.sam.maxPagesPerRun; page++) {
      this.spend(ctx.config);
      const url = new URL(env.sam.baseUrl);
      url.searchParams.set('api_key', env.sam.apiKey);
      url.searchParams.set('postedFrom', mmddyyyy(since));
      url.searchParams.set('postedTo', mmddyyyy(now));
      url.searchParams.set('limit', '1000');
      url.searchParams.set('offset', String(offset));
      if (types.length) url.searchParams.set('ptype', types.join(','));
      const res = await politeFetch(url.toString(), {}, 45_000);
      if (!res.ok) throw new Error(`SAM.gov ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { totalRecords?: number; opportunitiesData?: SamNotice[] };
      const batch = data.opportunitiesData ?? [];
      ctx.log(`page ${page + 1}: ${batch.length} notices (total ${data.totalRecords ?? '?'})`);
      out.push(...batch.filter((n) => this.isHardwareRelevant(n)));
      offset += batch.length;
      if (!batch.length || offset >= (data.totalRecords ?? 0)) break;
    }
    if (env.sam.fetchDescriptions) {
      for (const n of out.slice(0, 20)) {
        if (!n.description?.startsWith('http') || (await ctx.isKnown(n.noticeId))) continue;
        try {
          this.spend(ctx.config);
          const u = new URL(n.description);
          u.searchParams.set('api_key', env.sam.apiKey);
          const r = await politeFetch(u.toString());
          if (r.ok) {
            const j = (await r.json()) as { description?: string };
            n.descriptionText = j.description ?? null;
          }
        } catch (e) {
          ctx.log(`description fetch skipped: ${e instanceof Error ? e.message : e}`);
          break;
        }
      }
    }
    return out;
  }

  /** Local pre-filter: IT hardware NAICS / PSC codes, or hardware vocabulary in the title. */
  isHardwareRelevant(n: SamNotice): boolean {
    if (n.naicsCode && env.sam.naicsCodes.includes(n.naicsCode)) return true;
    const psc = (n.classificationCode ?? '').toUpperCase();
    if (psc && env.sam.pscPrefixes.some((p) => psc.startsWith(p.toUpperCase()))) return true;
    const t = (n.title ?? '').toLowerCase();
    return CATEGORY_PATTERNS.some(({ patterns }) => patterns.test(t));
  }

  normalize(n: SamNotice, ctx: ConnectorContext): RawDocument | null {
    if (!n.noticeId) return null;
    const path = (n.fullParentPathName ?? '').split('.').map((s) => s.trim()).filter(Boolean);
    const org = path.length ? (path.length > 1 ? `${titleCase(path[0])} — ${titleCase(path[path.length - 1])}` : titleCase(path[0])) : n.department ?? null;
    const pop = n.placeOfPerformance;
    const contacts: ContactInfo[] = (n.pointOfContact ?? [])
      .filter((p) => p.fullName || p.email || p.phone)
      .map((p) => ({
        name: p.fullName ?? null,
        title: p.title ?? null,
        email: p.email ?? null,
        phone: p.phone ?? null,
        linkedin: null,
        role: p.type === 'primary' ? 'Primary POC' : 'Secondary POC',
        provenance: 'SOURCE_VERIFIED' as const,
      }));
    const lines = [
      n.title,
      `Notice type: ${n.type ?? 'n/a'}`,
      n.solicitationNumber ? `Solicitation number: ${n.solicitationNumber}` : '',
      org ? `Agency: ${org}` : '',
      n.naicsCode ? `NAICS: ${n.naicsCode}` : '',
      n.classificationCode ? `PSC: ${n.classificationCode}` : '',
      n.typeOfSetAsideDescription ? `Set-aside: ${n.typeOfSetAsideDescription}` : '',
      n.responseDeadLine ? `Response deadline: ${n.responseDeadLine}` : '',
      pop?.city?.name || pop?.state?.code ? `Place of performance: ${[pop?.city?.name, pop?.state?.code, pop?.zip].filter(Boolean).join(', ')}` : '',
      ...contacts.map((c) => `Point of Contact: ${[c.name, c.title, c.email, c.phone].filter(Boolean).join(', ')}`),
      n.descriptionText ?? '',
    ].filter(Boolean);
    return {
      sourceKey: this.key,
      sourceName: 'SAM.gov',
      sourceType: this.type,
      sourceConfidence: this.confidence,
      sourceId: n.noticeId,
      sourceUrl: n.uiLink || `https://sam.gov/opp/${n.noticeId}/view`,
      title: n.title,
      text: lines.join('\n'),
      publishedAt: n.postedDate ? new Date(n.postedDate).toISOString() : null,
      updatedAt: n.postedDate ?? null,
      retrievedAt: ctx.now.toISOString(),
      structured: {
        organizationName: org,
        organizationType: 'Federal Government',
        city: pop?.city?.name ?? n.officeAddress?.city ?? null,
        state: pop?.state?.code ?? n.officeAddress?.state ?? null,
        zip: pop?.zip ?? n.officeAddress?.zipcode ?? null,
        country: 'US',
        deadline: n.responseDeadLine ? new Date(n.responseDeadLine).toISOString() : null,
        procurementType: samTypeToProcurement(n.type ?? n.baseType),
        contacts,
        naics: n.naicsCode ?? null,
        psc: n.classificationCode ?? null,
        setAside: n.typeOfSetAsideDescription ?? null,
        solicitationNumber: n.solicitationNumber ?? null,
      },
      isDemo: false,
    };
  }
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bOf\b/g, 'of').replace(/\bThe\b/g, 'the').replace(/\bU\.s\./g, 'U.S.');
}
