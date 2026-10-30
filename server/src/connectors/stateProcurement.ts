// State & local procurement adapter framework.
//
// Covers state portals, counties, cities, school districts, universities,
// public hospitals and agencies. Every portal is DATA (config), not code:
//
//   {
//     "name": "Example County Bids",           // display name
//     "state": "TX",                            // default state if the item lacks one
//     "sourceType": "LOCAL_PROCUREMENT",        // STATE_PROCUREMENT | LOCAL_PROCUREMENT | EDUCATION | HEALTHCARE
//     "format": "rss" | "json",
//     "url": "https://…/bids.rss",              // public feed/endpoint (robots.txt enforced)
//     "organizationName": "Example County",     // optional, used when the item doesn't name the buyer
//     "jsonItemsPath": "data.items",            // json only: where the array lives
//     "fieldMap": { "id": "bidId", "title": "title", "url": "link", "text": "description", "published": "postedDate", "deadline": "dueDate" }
//   }
//
// Add portals in /admin → Sources → State & Local Procurement, or via
// STATE_PORTAL_FEEDS (JSON array). Portals that require login, have no
// public feed, or disallow crawling must NOT be added — build an official
// integration (API agreement / data export) instead.

import { BaseConnector, hash, stripHtml, type ConnectorContext, type ConnectorStatusReport, type RawDocument, type SourceType } from '@etm/shared';
import { env } from '../config/env';
import { parseFeed, politeFetch, robotsAllowed } from './http';

export interface PortalConfig {
  name: string;
  state?: string;
  sourceType?: SourceType;
  format: 'rss' | 'json';
  url: string;
  organizationName?: string;
  jsonItemsPath?: string;
  fieldMap?: Partial<Record<'id' | 'title' | 'url' | 'text' | 'published' | 'deadline' | 'organization' | 'city' | 'state', string>>;
  enabled?: boolean;
}

interface PortalItem {
  portal: PortalConfig;
  id: string;
  title: string;
  url: string | null;
  text: string;
  published: string | null;
  deadline: string | null;
  organization: string | null;
  city: string | null;
  state: string | null;
}

const get = (obj: unknown, path?: string): unknown => (path ? path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj) : undefined);

export class StateProcurementConnector extends BaseConnector<PortalItem> {
  readonly key = 'state_local';
  readonly name = 'State & Local Procurement Portals';
  readonly type = 'STATE_PROCUREMENT' as const;
  readonly confidence = 'HIGH' as const;
  readonly description = 'Configurable adapters for state, county, city, school district, university and public-hospital bid boards with public feeds.';
  readonly isLive = true;
  readonly defaultIntervalMinutes = env.state.intervalMinutes;

  portals(config: Record<string, unknown>): PortalConfig[] {
    const list: PortalConfig[] = [];
    if (env.state.portalsJson) {
      try {
        list.push(...(JSON.parse(env.state.portalsJson) as PortalConfig[]));
      } catch {
        console.warn('[state_local] STATE_PORTAL_FEEDS is not valid JSON');
      }
    }
    if (Array.isArray(config.portals)) list.push(...(config.portals as PortalConfig[]));
    return list.filter((p) => p && p.url && p.enabled !== false);
  }

  status(config: Record<string, unknown>): ConnectorStatusReport {
    const n = this.portals(config).length;
    if (!n) return { status: 'CONFIG_REQUIRED', message: 'Adapter ready — add public portal feeds (RSS/JSON) to activate.' };
    return { status: 'PARTIAL', message: `${n} portal feed(s) configured. Coverage is partial until more portals are added.` };
  }

  async fetch(ctx: ConnectorContext): Promise<PortalItem[]> {
    const out: PortalItem[] = [];
    for (const portal of this.portals(ctx.config)) {
      try {
        if (!(await robotsAllowed(portal.url))) {
          ctx.log(`${portal.name}: robots.txt disallows ${portal.url} — skipped`);
          continue;
        }
        const res = await politeFetch(portal.url);
        if (!res.ok) {
          ctx.log(`${portal.name}: HTTP ${res.status}`);
          continue;
        }
        if (portal.format === 'rss') {
          for (const it of parseFeed(await res.text())) {
            out.push({
              portal, id: it.guid ?? it.link ?? hash(it.title), title: stripHtml(it.title), url: it.link, text: stripHtml(it.description),
              published: it.pubDate, deadline: null, organization: portal.organizationName ?? null, city: null, state: portal.state ?? null,
            });
          }
        } else {
          const json = await res.json();
          const arr = (portal.jsonItemsPath ? get(json, portal.jsonItemsPath) : json) as unknown[];
          const f = portal.fieldMap ?? {};
          for (const row of Array.isArray(arr) ? arr : []) {
            const s = (k: keyof NonNullable<PortalConfig['fieldMap']>) => {
              const v = get(row, f[k] ?? k);
              return v === undefined || v === null ? null : String(v);
            };
            const title = s('title') ?? '';
            out.push({
              portal, id: s('id') ?? hash(title + (s('url') ?? '')), title, url: s('url'), text: stripHtml(s('text') ?? ''),
              published: s('published'), deadline: s('deadline'), organization: s('organization') ?? portal.organizationName ?? null,
              city: s('city'), state: s('state') ?? portal.state ?? null,
            });
          }
        }
      } catch (e) {
        ctx.log(`${portal.name} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    return out;
  }

  normalize(it: PortalItem, ctx: ConnectorContext): RawDocument {
    const iso = (v: string | null) => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };
    const deadline = iso(it.deadline);
    return {
      sourceKey: this.key,
      sourceName: it.portal.name,
      sourceType: it.portal.sourceType ?? 'STATE_PROCUREMENT',
      sourceConfidence: 'HIGH',
      sourceId: `${hash(it.portal.url)}:${it.id}`,
      sourceUrl: it.url ?? it.portal.url,
      title: it.title,
      text: [it.text, it.organization ? `Issuing Agency: ${it.organization}` : '', deadline ? `Response deadline: ${it.deadline}` : ''].filter(Boolean).join('\n'),
      publishedAt: iso(it.published),
      updatedAt: it.published,
      retrievedAt: ctx.now.toISOString(),
      structured: {
        organizationName: it.organization,
        city: it.city,
        state: it.state,
        deadline,
        country: 'US',
      },
      isDemo: false,
    };
  }
}
