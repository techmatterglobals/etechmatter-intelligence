// Polite HTTP helpers for connectors: timeouts, identifying user-agent,
// robots.txt compliance and per-host throttling. Never bypasses logins,
// CAPTCHAs, paywalls or anti-bot protections — a 401/403/429 is reported, not retried around.
import { env } from '../config/env';

export class SourceAccessError extends Error {}

export async function politeFetch(url: string, init: RequestInit = {}, timeoutMs = env.web.requestTimeoutMs): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    await throttle(new URL(url).host);
    const res = await fetch(url, {
      ...init,
      headers: { 'user-agent': env.web.userAgent, accept: 'application/json, text/html;q=0.9, application/rss+xml;q=0.9, */*;q=0.5', ...(init.headers ?? {}) },
      signal: ctl.signal,
      redirect: 'follow',
    });
    if (res.status === 401 || res.status === 403) throw new SourceAccessError(`HTTP ${res.status} — access refused by the source or network (not bypassed)`);
    if (res.status === 429) throw new SourceAccessError('429 — rate limited by source; will retry on next scheduled run');
    return res;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new SourceAccessError(`Timed out after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const lastHit = new Map<string, number>();
async function throttle(host: string, minGapMs = 1500) {
  const last = lastHit.get(host) ?? 0;
  const wait = last + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

// ------------------------------------------------------------------ robots.txt
interface RobotsRules {
  allow: string[];
  disallow: string[];
  fetchedAt: number;
}
const robotsCache = new Map<string, RobotsRules>();

export function parseRobots(txt: string, ua: string): Omit<RobotsRules, 'fetchedAt'> {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const clean = line.replace(/#.*/, '').trim();
    if (!clean) continue;
    const [k, ...rest] = clean.split(':');
    const key = k.trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], allow: [], disallow: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'allow' && val) cur.allow.push(val);
    if (key === 'disallow' && val) cur.disallow.push(val);
  }
  const token = ua.toLowerCase().split('/')[0];
  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const star = groups.find((g) => g.agents.includes('*'));
  const g = specific ?? star;
  return { allow: g?.allow ?? [], disallow: g?.disallow ?? [] };
}

function ruleMatches(rule: string, path: string) {
  const re = new RegExp('^' + rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  return re.test(path);
}

export function isPathAllowed(rules: Pick<RobotsRules, 'allow' | 'disallow'>, path: string): boolean {
  const longest = (list: string[]) => list.filter((r) => ruleMatches(r, path)).reduce((m, r) => Math.max(m, r.length), -1);
  const a = longest(rules.allow);
  const d = longest(rules.disallow);
  return d < 0 || a >= d;
}

export async function robotsAllowed(url: string): Promise<boolean> {
  const u = new URL(url);
  const key = `${u.protocol}//${u.host}`;
  let rules = robotsCache.get(key);
  if (!rules || Date.now() - rules.fetchedAt > 3_600_000) {
    try {
      const res = await fetch(`${key}/robots.txt`, { headers: { 'user-agent': env.web.userAgent } });
      if (res.status >= 500) return false; // be conservative when the site is unhealthy
      const txt = res.ok ? await res.text() : '';
      rules = { ...parseRobots(txt, env.web.userAgent), fetchedAt: Date.now() };
    } catch {
      return false;
    }
    robotsCache.set(key, rules);
  }
  return isPathAllowed(rules, u.pathname + u.search);
}

// ------------------------------------------------------------------ RSS/Atom
export interface FeedItem {
  title: string;
  link: string | null;
  description: string;
  pubDate: string | null;
  guid: string | null;
}
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : null;
};
export function parseFeed(xml: string): FeedItem[] {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  return blocks.map((b) => {
    const atomLink = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? null;
    return {
      title: tag(b, 'title') ?? '',
      link: tag(b, 'link') || atomLink,
      description: tag(b, 'description') ?? tag(b, 'summary') ?? tag(b, 'content') ?? '',
      pubDate: tag(b, 'pubDate') ?? tag(b, 'published') ?? tag(b, 'updated') ?? tag(b, 'dc:date'),
      guid: tag(b, 'guid') ?? tag(b, 'id'),
    };
  });
}
