// Duplicate detection across sources.
//
// Hard duplicate: same source + source id, or the same canonical URL → the
// existing record is UPDATED (never a second row).
// Soft duplicate: the same requirement surfaced by a different source
// (e.g. a state portal and a public-web re-post). These are FLAGGED as
// "Possible duplicate" with the evidence for the match — never auto-deleted.
// A salesperson can [MERGE] them.

import { jaccard, lc, tokens, trigramSimilarity } from '../text';
import type { DuplicateCandidate, Opportunity } from '../types';

export function canonicalUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) url.searchParams.delete(k);
    return `${url.host.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}${url.search}`.toLowerCase();
  } catch {
    return lc(u);
  }
}

export interface DedupeTarget {
  id?: string;
  title: string;
  description: string;
  organizationName: string | null;
  deadline: string | null;
  categories: string[];
  quantity: number | null;
  sourceKey: string;
  sourceId: string;
  sourceUrl: string | null;
  state: string | null;
}

export function duplicateScore(a: DedupeTarget, b: DedupeTarget): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  if (a.sourceKey === b.sourceKey && a.sourceId === b.sourceId) return { score: 1, reasons: ['Same source ID'] };
  const ua = canonicalUrl(a.sourceUrl);
  if (ua && ua === canonicalUrl(b.sourceUrl)) return { score: 1, reasons: ['Same source URL'] };

  let score = 0;
  const title = trigramSimilarity(a.title, b.title);
  if (title > 0.35) {
    score += 0.3 * Math.min(1, title / 0.7);
    reasons.push(`Title similarity ${Math.round(title * 100)}%`);
  }
  const orgA = lc(a.organizationName);
  const orgB = lc(b.organizationName);
  if (orgA && orgB) {
    const org = trigramSimilarity(orgA, orgB);
    if (org > 0.6) {
      score += 0.25;
      reasons.push('Same organization');
    } else if (a.state && b.state && a.state !== b.state) score -= 0.3;
  }
  const desc = jaccard(tokens(a.description), tokens(b.description));
  if (desc > 0.2) {
    score += 0.2 * Math.min(1, desc / 0.5);
    reasons.push(`Description overlap ${Math.round(desc * 100)}%`);
  }
  if (a.deadline && b.deadline && a.deadline.slice(0, 10) === b.deadline.slice(0, 10)) {
    score += 0.15;
    reasons.push('Same deadline');
  }
  const cat = jaccard(a.categories, b.categories);
  if (cat > 0.4) {
    score += 0.1 * cat;
    reasons.push('Same hardware categories');
  }
  if (a.quantity && b.quantity && a.quantity === b.quantity) {
    score += 0.1;
    reasons.push(`Same quantity (${a.quantity})`);
  }
  return { score: Math.max(0, Math.min(0.99, score)), reasons };
}

export const POSSIBLE_DUPLICATE_THRESHOLD = 0.6;

export function findDuplicateCandidates(target: DedupeTarget, pool: Opportunity[]): DuplicateCandidate[] {
  const out: DuplicateCandidate[] = [];
  for (const o of pool) {
    if (o.id === target.id || o.status === 'MERGED') continue;
    const { score, reasons } = duplicateScore(target, o);
    if (score >= POSSIBLE_DUPLICATE_THRESHOLD && score < 1) {
      out.push({ opportunityId: o.id, title: o.title, sourceName: o.source, score: Math.round(score * 100) / 100, reasons });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
