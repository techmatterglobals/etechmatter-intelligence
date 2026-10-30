// Public web discovery — configurable list of publicly accessible pages and
// RSS/Atom feeds (bid aggregators that permit crawling, organization "bids &
// RFPs" pages, news feeds of procurement boards …).
//
// Guardrails (enforced in code):
//  • robots.txt is checked for every URL; disallowed URLs are skipped
//  • no cookies, no logins, no CAPTCHA solving, no headless-browser evasion
//  • 401/403/429 are reported and NOT retried around
//  • pages are pre-filtered for buying + hardware vocabulary before any AI call
//
// Configure in /admin → Sources → Public Web Discovery (seed URLs) or with
// WEB_DISCOVERY_URLS. A search-engine adapter (e.g. a licensed search API)
// can be added by implementing `discoverUrls()`; none is bundled because
// scraping search engines is not permitted.

import { BaseConnector, CATEGORY_PATTERNS, hash, stripHtml, type ConnectorContext, type ConnectorStatusReport, type RawDocument } from '@etm/shared';
import { env } from '../config/env';
import { parseFeed, politeFetch, robotsAllowed, safeDiscoveryFetch, } from './http';
import { load } from 'cheerio';
interface WebItem {
  url: string;
  title: string;
  text: string;
  publishedAt: string | null;
}

export interface SolicitationLink {
  url: string;
  title: string;
}

/**
 * Discover potential solicitation detail links on an HTML listing page.
 * This function only parses HTML; it does not make network requests.
 */
export function extractSolicitationLinks(
  html: string,
  pageUrl: string,
  maxLinks = 5,
): SolicitationLink[] {
  const base = new URL(pageUrl);

  if (base.protocol !== 'https:') return [];

  const $ = load(html);
  const found: SolicitationLink[] = [];
  const seen = new Set<string>();

  const procurementTerms =
    /\b(rfp|rfq|itb|ifb|solicitation|request for proposals?|request for quotations?|invitation to bid|bid opportunity|procurement opportunity)\b/i;

  const excludedPaths =
    /\/(login|signin|register|account|contact|about|privacy|terms|news|events)(\/|$)/i;

  $('a[href]').each((_, element) => {
    if (found.length >= maxLinks) return false;

    const href = $(element).attr('href');
    if (!href) return;

    let target: URL;

    try {
      target = new URL(href, base);
    } catch {
      return;
    }

    if (
      target.protocol !== 'https:' ||
      target.hostname.toLowerCase() !== base.hostname.toLowerCase() ||
      target.username ||
      target.password
    ) {
      return;
    }

    target.hash = '';

    if (
      target.href === base.href ||
      excludedPaths.test(target.pathname) ||
      /\.(pdf|docx?|xlsx?|zip)$/i.test(target.pathname)
    ) {
      return;
    }

    const title = $(element).text().replace(/\s+/g, ' ').trim();
    // Reject common non-solicitation pages.
if (
  /\/cdn-cgi\//i.test(target.pathname) ||
  /\/(?:cooperative-contracts|shared-technology-services|communications-technology-services|dir-contracts-statements-work)(?:\/|$)/i.test(
    target.pathname,
  )
) {
  return;
}

// Only consider evidence associated with the link itself.
// Do not use an entire table row or navigation container.
const linkText = `${title} ${target.pathname} ${target.search}`;

// Require a procurement notice term plus a recognizable identifier.
// General links such as "Cooperative Contracts" must not qualify.
const hasNoticeType =
  /\b(?:RFP|RFQ|ITB|IFB|solicitation)\b/i.test(linkText);

const hasNoticeId =
  /\b(?:RFP|RFQ|ITB|IFB)[\s_-]*#?[\s_-]*[A-Z0-9]*\d[A-Z0-9_-]*\b/i.test(
    linkText,
  ) ||
  /(?:solicitation|bid|event)[-_/=][A-Z0-9_-]*\d[A-Z0-9_-]*/i.test(
    linkText,
  );

if (!hasNoticeType || !hasNoticeId) {
  return;
}

    if (seen.has(target.href)) return;

    seen.add(target.href);

    found.push({
      url: target.href,
      title: title || target.pathname,
    });
  });

  return found;
}

export class GenericWebConnector extends BaseConnector<WebItem> {
  readonly key = 'public_web';
  readonly name = 'Public Web Discovery';
  readonly type = 'PUBLIC_WEB' as const;
  readonly confidence = 'LOW' as const;
  readonly description = 'Publicly accessible pages & feeds containing buying-intent phrases. robots.txt respected; no logins or paywalls.';
  readonly isLive = true;
  readonly defaultIntervalMinutes = env.web.intervalMinutes;

  private seeds(config: Record<string, unknown>): string[] {
    const fromCfg = Array.isArray(config.seedUrls) ? (config.seedUrls as string[]) : [];
    return [...new Set([...env.web.seedUrls, ...fromCfg])].filter((u) => /^https?:\/\//.test(u));
  }

  status(config: Record<string, unknown>): ConnectorStatusReport {
    const n = this.seeds(config).length;
    if (!n) return { status: 'CONFIG_REQUIRED', message: 'Configuration required — add public pages or RSS feeds to monitor.' };
    return { status: 'CONNECTED', message: `${n} public URL(s)/feed(s) monitored · robots.txt enforced` };
  }

  async fetch(ctx: ConnectorContext): Promise<WebItem[]> {
    const keywords = ((ctx.config.keywords as string[] | undefined) ?? []).map((k) => k.toLowerCase());
    const out: WebItem[] = [];
    for (const url of this.seeds(ctx.config)) {
      try {
        if (!(await robotsAllowed(url))) {
          ctx.log(`robots.txt disallows ${url} — skipped`);
          continue;
        }
        const res = await politeFetch(url);
        if (!res.ok) {
          ctx.log(`${url} → HTTP ${res.status}`);
          continue;
        }
        const body = await res.text();
        const ct = res.headers.get('content-type') ?? '';
        if (/xml|rss|atom/.test(ct) || /^\s*<\?xml|<rss|<feed/i.test(body.slice(0, 500))) {
          for (const it of parseFeed(body)) {
            const link = it.link ?? url;
            out.push({ url: link, title: stripHtml(it.title), text: stripHtml(it.description), publishedAt: it.pubDate ? safeIso(it.pubDate) : null });
          }
        } else {
  const title =
    body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? url;

  const published =
    body.match(
      /<meta[^>]+(?:article:published_time|date)[^>]+content="([^"]+)"/i,
    )?.[1] ?? null;

  // Preserve existing behavior: process the configured seed page.
  // The classification safeguard handles known general listing pages.
  out.push({
    url,
    title: stripHtml(title),
    text: stripHtml(body).slice(0, 30_000),
    publishedAt: published ? safeIso(published) : null,
  });

  // Discovery is opt-in and limited to five candidate links per seed.
  if (ctx.config.followSolicitationLinks === true) {
    const candidates = extractSolicitationLinks(body, url, 5);

    for (const candidate of candidates) {
      try {
        const detailRes = await safeDiscoveryFetch(
          candidate.url,
          new URL(url).hostname,
        );

        if (!detailRes.ok) {
          ctx.log(
            `Solicitation candidate ${candidate.url}: HTTP ${detailRes.status}`,
          );
          continue;
        }

        const detailType =
          detailRes.headers.get('content-type') ?? '';

        if (!/text\/html/i.test(detailType)) {
          ctx.log(
            `Skipping non-HTML solicitation candidate: ${candidate.url}`,
          );
          continue;
        }

        const detailHtml = await detailRes.text();
        const $ = load(detailHtml);

        $('script, style, nav, footer, header').remove();

        const detailTitle =
          $('h1').first().text().trim() ||
          $('title').first().text().trim() ||
          candidate.title;

        const detailText = $('body')
          .text()
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 30_000);

        // A candidate link is not proof of an individual solicitation.
        // Require an identifiable notice plus procurement language.
        const hasNoticeIdentifier =
          /\b(?:RFP|RFQ|ITB|IFB)\s*[-#: ]*\s*[A-Z0-9][A-Z0-9-]{3,}\b/i.test(
            `${detailTitle} ${detailText}`,
          );

        const hasProcurementLanguage =
          /\b(?:request for proposals?|request for quotations?|invitation to bid|bid submission|proposal deadline|solicitation number)\b/i.test(
            detailText,
          );

        if (!hasNoticeIdentifier || !hasProcurementLanguage) {
          ctx.log(
            `Skipping candidate without sufficient solicitation evidence: ${candidate.url}`,
          );
          continue;
        }

        out.push({
          url: candidate.url,
          title: detailTitle,
          text: detailText,
          publishedAt: null,
        });

        ctx.log(`Discovered solicitation candidate: ${candidate.url}`);
      } catch (error) {
        ctx.log(
          `Solicitation candidate ${candidate.url} skipped: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
      } catch (e) {
        ctx.log(`${url} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    // cheap pre-filter before AI: needs hardware vocabulary AND buying language/keywords
    return out.filter((it) => {
      const t = `${it.title}\n${it.text}`.toLowerCase();
      const hw = CATEGORY_PATTERNS.some(({ patterns }) => patterns.test(t));
      const buying = /\b(rfq|rfp|itb|request for (?:quot|propos|bid)|quotes? (?:requested|due)|seeking (?:quot|vendor|supplier|bid)|bids? due|we need|looking to purchase|purchase of|vendors? interested|sources sought|procurement)\b/.test(t) || keywords.some((k) => t.includes(k));
      return hw && buying;
    });
  }

  normalize(it: WebItem, ctx: ConnectorContext): RawDocument {
    return {
      sourceKey: this.key,
      sourceName: new URL(it.url).host.replace(/^www\./, ''),
      sourceType: this.type,
      sourceConfidence: /\.gov$|\.us$|\.edu$/.test(new URL(it.url).host) ? 'MEDIUM' : 'LOW',
      sourceId: hash(it.url + '|' + it.title),
      sourceUrl: it.url,
      title: it.title || it.url,
      text: it.text,
      publishedAt: it.publishedAt,
      updatedAt: it.publishedAt,
      retrievedAt: ctx.now.toISOString(),
      isDemo: false,
    };
  }
}

function safeIso(s: string): string | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
