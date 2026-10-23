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
import { parseFeed, politeFetch, robotsAllowed } from './http';

interface WebItem {
  url: string;
  title: string;
  text: string;
  publishedAt: string | null;
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
    const fromCfg = Array.isArray(config.seedUrls)
        ? (config.seedUrls as string[])
        : [];

    return [...new Set([...env.web.seedUrls, ...fromCfg])]
        .filter(
            (u): u is string =>
                typeof u === 'string' &&
                /^https?:\/\//i.test(u.trim())
        );
}


  status(config: Record<string, unknown>): ConnectorStatusReport {
    const n = this.seeds(config).length;
    if (!n) return { status: 'CONFIG_REQUIRED', message: 'Configuration required — add public pages or RSS feeds to monitor.' };
    return { status: 'CONNECTED', message: `${n} public URL(s)/feed(s) monitored · robots.txt enforced` };
  }


async fetch(ctx: ConnectorContext): Promise<WebItem[]> {
    const keywords = (
        (ctx.config.keywords as string[] | undefined) ?? []
    ).map((k) => k.toLowerCase());

    const out: WebItem[] = [];
    const urls = this.seeds(ctx.config);

    ctx.log(`Public Web Discovery: ${urls.length} seed URL(s) configured`);

    for (const url of urls) {
        try {
            ctx.log(`Checking URL: ${url}`);

            const allowed = await robotsAllowed(url);

            if (!allowed) {
                ctx.log(`SKIPPED: robots.txt disallows ${url}`);
                continue;
            }

            const res = await politeFetch(url);

            ctx.log(`HTTP ${res.status}: ${url}`);

            if (!res.ok) {
                ctx.log(`FETCH FAILED: ${url} returned HTTP ${res.status}`);
                continue;
            }

            const body = await res.text();
            const contentType = res.headers.get("content-type") ?? "";

            ctx.log(
                `Downloaded ${body.length} characters; content-type=${contentType}`
            );

            if (!body.trim()) {
                ctx.log(`EMPTY RESPONSE: ${url}`);
                continue;
            }

            const isFeed =
                /xml|rss|atom/i.test(contentType) ||
                /^\s*(?:<\?xml\b|<rss\b|<feed\b)/i.test(
                    body.slice(0, 500)
                );

            if (isFeed) {
                const items = parseFeed(body);

                ctx.log(`Parsed ${items.length} feed item(s) from ${url}`);

                for (const item of items) {
                    const link = item.link
                        ? new URL(item.link, url).toString()
                        : url;

                    out.push({
                        url: link,
                        title: stripHtml(item.title ?? ""),
                        text: stripHtml(item.description ?? ""),
                        publishedAt: item.pubDate
                            ? safeIso(item.pubDate)
                            : null,
                    });
                }
            } else {
                const title =
                    body.match(
                        /<title\b[^>]*>([\s\S]*?)<\/title>/i
                    )?.[1]?.trim() ?? url;

                const published =
                    body.match(
                        /<meta\b[^>]*(?:property|name)=["'](?:article:published_time|date)["'][^>]*content=["']([^"']+)["']/i
                    )?.[1] ?? null;

                const text = stripHtml(body).slice(0, 30_000);

                out.push({
                    url,
                    title: stripHtml(title),
                    text,
                    publishedAt: published ? safeIso(published) : null,
                });

                ctx.log(`Parsed HTML page: ${title}`);
            }
        } catch (error) {
            ctx.log(
                `URL ERROR ${url}: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }

    const matched: WebItem[] = [];
    let hardwareRejected = 0;
    let buyingRejected = 0;

    for (const item of out) {
        const content = `${item.title}\n${item.text}`.toLowerCase();

        const hasHardware = CATEGORY_PATTERNS.some(({ patterns }) =>
            patterns.test(content)
        );

        const hasBuyingIntent =
            /\b(rfq|rfp|itb|request for (?:quot|propos|bid)|quotes? (?:requested|due)|seeking (?:quot|vendor|supplier|bid)|bids? due|we need|looking to purchase|purchase of|vendors? interested|sources sought|procurement)\b/i.test(
                content
            ) ||
            keywords.some((keyword) => content.includes(keyword));

        if (!hasHardware) {
            hardwareRejected++;
            continue;
        }

        if (!hasBuyingIntent) {
            buyingRejected++;
            continue;
        }

        matched.push(item);
    }

    ctx.log(`Total parsed items: ${out.length}`);
    ctx.log(`Rejected: no hardware match = ${hardwareRejected}`);
    ctx.log(`Rejected: no buying intent = ${buyingRejected}`);
    ctx.log(`Matching buying signals: ${matched.length}`);

    return matched;
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
