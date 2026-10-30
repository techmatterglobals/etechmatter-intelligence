// Text utilities shared by extraction, grounding, dedupe and search.

export function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function lc(s: string | null | undefined): string {
  return (s ?? '').toLowerCase();
}

/** Split text into sentence/bullet segments, keeping bullets as their own segments. */
export function segments(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const clean = line.replace(/^\s*(?:[-*•▪◦]|\d+[.)]|\([a-z0-9]+\))\s+/i, '').trim();
    if (!clean) continue;
    // split on sentence punctuation not inside numbers/abbreviations
    const parts = clean.split(/(?<=[.!?;])\s+(?=[A-Z(])/);
    for (const p of parts) if (p.trim()) out.push(p.trim());
  }
  return out;
}

/** Case/whitespace-insensitive "does the source text literally contain this?" */
export function textContains(haystack: string, needle: string | null | undefined): boolean {
  if (!needle) return false;
  return normalizeWs(haystack).toLowerCase().includes(normalizeWs(needle).toLowerCase());
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

export const DATE_RE =
  /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/i;

/** Parse a date string found in text. Returns ISO (UTC noon for date-only) or null. */
export function parseDateLoose(raw: string | null | undefined, hint?: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    if (m[4]) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 17, 0, 0)).toISOString();
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], 17, 0, 0)).toISOString();
  m = s.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo === undefined) return null;
    let hour = 17;
    const t = hint?.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
    if (t) hour = (+t[1] % 12) + (/p/i.test(t[3]) ? 12 : 0);
    return new Date(Date.UTC(+m[3], mo, +m[2], hour, 0, 0)).toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function tokens(s: string): string[] {
  return lc(s)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

const STOP = new Set([
  'the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'is', 'are', 'be',
  'this', 'that', 'will', 'as', 'it', 'its', 'our', 'we', 'all', 'any', 'into', 'per', 'via', 'no', 'not',
]);

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = `  ${lc(s).replace(/[^a-z0-9]+/g, ' ')} `;
    const g = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3));
    return g;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function parseMoney(num: string, unit?: string | null): number | null {
  const n = parseFloat(num.replace(/,/g, ''));
  if (!isFinite(n)) return null;
  const u = lc(unit ?? '');
  if (u === 'k' || u === 'thousand') return Math.round(n * 1_000);
  if (u === 'm' || u === 'mm' || u === 'million') return Math.round(n * 1_000_000);
  return Math.round(n);
}

let idCounter = 0;
export function newId(prefix = 'id'): string {
  idCounter = (idCounter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

/** Stable short hash (FNV-1a) — used for URL-derived source ids. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));
}

export function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

export function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;
}

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
