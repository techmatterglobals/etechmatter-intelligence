// Deterministic requirement extractor (the "heuristic" AI provider).
//
// Rules: every value it returns is cut from the source text (SOURCE_VERIFIED,
// with the snippet kept as evidence) or explicitly marked AI_INFERENCE.
// Anything not found is null. It never fills a gap with a guess.

import { BRAND_ALIASES, CATEGORY_PATTERNS, KNOWN_BRANDS, PRODUCT_LINES, STATES, STATE_BY_NAME } from '../constants';
import { DATE_RE, lc, normalizeWs, parseDateLoose, parseMoney, segments, uniq } from '../text';
import type {
  ContactInfo,
  Extraction,
  Field,
  OrganizationType,
  ProcurementType,
  RawDocument,
  RequestedItem,
} from '../types';
import { detectProcurementType } from './classify';

const nil = <T>(): Field<T> => ({ value: null, provenance: 'UNKNOWN', evidence: null });
const verified = <T>(value: T, evidence: string | null): Field<T> => ({ value, provenance: 'SOURCE_VERIFIED', evidence });
const inferred = <T>(value: T, evidence: string | null): Field<T> => ({ value, provenance: 'AI_INFERENCE', evidence });

const STATE_CODES = STATES.map((s) => s.code).join('|');
const STATE_NAMES = STATES.map((s) => s.name).join('|');

// ---------------------------------------------------------------- organization
const GENERIC_ORG = /^(the )?(district|county|city|agency|department|hospital|university|college|organization|company|we|our|buyer|owner|state|office|vendor|contractor)$/i;

export function extractOrganization(doc: RawDocument, text: string): Field<string> {
  const s = doc.structured?.organizationName;
  if (s) return verified(s, s);
  const labeled = text.match(
    /^\s*(?:issuing (?:agency|organization|entity|department)|agency|organization|purchasing entity|entity|issued by|district|institution)\s*:\s*(.{3,120})$/im,
  );
  if (labeled) {
    const v = labeled[1]
      .trim()
      .replace(/[.;]+$/, '')
      .replace(/,\s*[A-Z][A-Za-z.\s]+,\s*[A-Z]{2}(?:\s+\d{5})?$/, '')
      .trim();
    return verified(v, labeled[0].trim());
  }
  const company = text.match(/(?:^|[.\n]\s*)([A-Z][\w&'’-]*(?:[ \t][A-Z][\w&'’-]*){0,5}[ \t](?:Inc\.?|LLC|L\.L\.C\.|Corp\.?|Corporation|Company|Co\.|Ltd\.?|LP|PLLC|PC))(?=[\s,])/);
  if (company) return verified(company[1].trim(), normalizeWs(company[0]).replace(/^[.\s]+/, ''));
  const sentence = text.match(
    /(?:^|[.\n]\s*|,\s+)((?:The[ \t])?[A-Z][A-Za-z0-9&.'’-]*(?:[ \t](?:of|for|and|&|the|de|[A-Z][A-Za-z0-9&.'’()-]*))*)[ \t](?:(?:is|are|has|have)\s(?:now\s)?(?:seeking|requesting|soliciting|inviting|issuing|accepting|looking|planning|opening|requires?|needs?)|plans|intends|anticipates|requires|needs|seeks)\b/,
  );
  if (sentence) {
    const v = sentence[1].replace(/^The\s/, '').trim();
    if (!GENERIC_ORG.test(v) && v.split(' ').length <= 10) return verified(v, normalizeWs(sentence[0]).replace(/^[.\s]+/, ''));
  }
  return nil();
}

export function inferOrganizationType(name: string | null, doc: RawDocument, text: string): Field<OrganizationType> {
  if (doc.structured?.organizationType) return verified(doc.structured.organizationType, null);
  const n = lc(name);
  const t = lc(text);
  const rules: [RegExp, OrganizationType][] = [
    [/\b(isd|independent school district|school district|unified school|public schools|usd|county schools|charter school|board of education|academy)\b/, 'K-12 Education'],
    [/\b(university|college|community college|institute of technology|school of medicine)\b/, 'Higher Education'],
    [/\b(hospital|health|medical center|clinic|healthcare|health system|behavioral)\b/, 'Healthcare'],
    [/\b(authority|commission|port of|transit|water district|utility district|library district)\b/, 'Public Agency'],
    [/\b(county of|county)\b/, 'County Government'],
    [/\b(city of|town of|village of|municipal|township|city)\b/, 'City Government'],
    [/\b(state of|commonwealth of|state department|state agency)\b/, 'State Government'],
    [/\b(authority|commission|port of|transit|water district|utility district|library district|agency)\b/, 'Public Agency'],
    [/\b(inc\.?|llc|corp\.?|corporation|company|co\.|lp|ltd)\b/, 'Commercial'],
    [/\b(foundation|nonprofit|non-profit|association|society)\b/, 'Nonprofit'],
  ];
  for (const [re, type] of rules) if (n && re.test(n)) return inferred(type, name);
  if (doc.sourceType === 'FEDERAL_PROCUREMENT') return inferred('Federal Government', 'Federal procurement source');
  for (const [re, type] of rules.slice(0, 3)) if (re.test(t)) return inferred(type, null);
  return { value: 'Unknown', provenance: 'UNKNOWN', evidence: null };
}

// -------------------------------------------------------------------- location
export function extractLocation(doc: RawDocument, text: string) {
  const st = doc.structured;
  const out = {
    city: nil<string>(),
    state: nil<string>(),
    zip: nil<string>(),
    country: nil<string>(),
  };
  if (st?.city) out.city = verified(st.city, st.city);
  if (st?.state) out.state = verified(st.state.toUpperCase(), st.state);
  if (st?.zip) out.zip = verified(st.zip, st.zip);
  if (st?.country) out.country = verified(st.country, st.country);
  if (out.state.value) {
    if (!out.country.value) out.country = inferred('US', 'U.S. state');
    return out;
  }
  const byCode = text.match(new RegExp(`\\b([A-Z][a-zA-Z.]+(?:\\s[A-Z][a-zA-Z.]+){0,2}),\\s*(${STATE_CODES})\\b(?:\\s+(\\d{5}))?`));
  const byName = text.match(new RegExp(`\\b([A-Z][a-z]+(?:\\s[A-Z][a-z]+){0,2}),\\s*(${STATE_NAMES})\\b`));
  const m = byCode && (!byName || (byCode.index ?? 0) <= (byName.index ?? 0)) ? byCode : byName;
  if (m) {
    const code = m[2].length === 2 ? m[2] : STATE_BY_NAME[m[2].toLowerCase()];
    out.city = verified(m[1].trim(), m[0]);
    out.state = verified(code, m[0]);
    if (m[3]) out.zip = verified(m[3], m[0]);
    out.country = inferred('US', m[0]);
  } else {
    const nameOnly = text.match(new RegExp(`\\b(${STATE_NAMES})\\b`));
    if (nameOnly) {
      out.state = verified(STATE_BY_NAME[nameOnly[1].toLowerCase()], nameOnly[0]);
      out.country = inferred('US', nameOnly[0]);
    }
  }
  return out;
}

// ----------------------------------------------------------------------- items
const BRAND_RE = new RegExp(
  `\\b(${[...KNOWN_BRANDS].sort((a, b) => b.length - a.length).map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
);
const LINE_SET = new Set(PRODUCT_LINES.map((l) => lc(l)));

function canonicalBrand(b: string): string {
  return BRAND_ALIASES[lc(b)] ?? b;
}

/** Brand followed by capitalised/numeric tokens, e.g. "Dell PowerEdge R760", "Cisco Catalyst 9300-48P". */
function findBrandModel(clause: string): { brand: string; model: string | null; index: number; raw: string } | null {
  const m = clause.match(BRAND_RE);
  if (!m || m.index === undefined) return null;
  const brand = canonicalBrand(m[1]);
  const rest = clause.slice(m.index + m[1].length);
  const toks = rest.split(/\s+/).filter(Boolean);
  const modelToks: string[] = [];
  for (const raw of toks) {
    const tok = raw.replace(/[,;:)]+$/, '');
    const isModelish = /^[A-Z0-9][A-Za-z0-9+\-/.]*$/.test(tok) || /^(Gen\d*|G\d+)$/i.test(tok);
    if (!isModelish || /^(and|or|with|for|to|the|RFQ|RFP|ITB)$/i.test(tok)) break;
    modelToks.push(tok);
    if (raw !== tok) break; // punctuation ended the phrase
    if (modelToks.length >= 5) break;
  }
  // keep through the last token that carries a digit (model numbers) or a known product line
  let last = -1;
  modelToks.forEach((t, i) => {
    if (/\d/.test(t) || LINE_SET.has(lc(t))) last = i;
  });
  const modelTokens = modelToks.slice(0, last + 1);
  const model = modelTokens.some((t) => /\d/.test(t)) ? modelTokens.join(' ') : null;
  const raw = [m[1], ...modelTokens].join(' ');
  return { brand, model, index: m.index, raw };
}

const PART_LABEL_RE = /\b(?:part (?:number|no\.?|#)|p\/n|mfr\.? part(?: no\.?| #| number)?|mpn|manufacturer part(?: number)?|sku)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/.]{3,})/gi;
const PART_TOKEN_RE = /\b(?=[A-Z0-9\-/]*\d)(?=[A-Z0-9\-/]*[A-Z])[A-Z0-9][A-Z0-9\-/]{7,}\b/g;

export function findPartNumbers(clause: string, model: string | null = null, allowStandalone = true): string[] {
  const out: string[] = [];
  for (const m of clause.matchAll(PART_LABEL_RE)) out.push(m[1].replace(/[.,;)]+$/, ''));
  if (!allowStandalone) return uniq(out);
  for (const m of clause.matchAll(PART_TOKEN_RE)) {
    const tok = m[0];
    if (model && model.toUpperCase().includes(tok)) continue;
    if (/^MIL-|^[A-Z]{2,5}-\d{2}-\d{2,4}$/.test(tok)) continue;
    if (/^(RFQ|RFP|ITB|IFB|BID|SOL|PO|REQ|NOTICE|FY)/.test(tok)) continue;
    if (/20\d\d-/.test(tok) || /-20\d\d/.test(tok)) continue; // year-based ids (solicitation numbers)
    if (/^\d+$/.test(tok.replace(/[-/]/g, ''))) continue; // pure numbers / phone numbers
    if (/^(DDR\d|PCIE|USB|HDMI|WIFI|GEN\d)/.test(tok)) continue;
    out.push(tok);
  }
  return uniq(out);
}

const UNIT_AFTER = /^(?:\s*(?:gb|tb|mb|ghz|mhz|w|watts?|va|kva|kw|ports?|-port|inch|in\.|u\b|mm|hz|years?|yrs?|months?|days?|hours?|business days|%|x\b|\/))/i;

function findQuantityNear(clause: string, catIdx: number, catEnd: number, masked: string, windowStart = 0): { qty: number; snippet: string } | null {
  // 1) explicit label anywhere in clause
  const lab = masked.slice(windowStart).match(/\b(?:qty|quantity)\.?\s*(?:of\s*)?[:=]?\s*\(?(\d{1,3}(?:,\d{3})+|\d{1,6})\)?/i);
  if (lab) return { qty: parseInt(lab[1].replace(/,/g, ''), 10), snippet: clause.slice(windowStart + lab.index!, Math.min(clause.length, catEnd + 1)) };
  // 2) closest number before the category word (within 7 words)
  const pre = masked.slice(0, catIdx).replace(/[\s\S]/g, (ch, i: number) => (i < windowStart ? ' ' : ch));
  const numRe = /(?<![\w.\-/$#])\(?(\d{1,3}(?:,\d{3})+|\d{1,6})\)?(?![\w.\-/%"'”])/g;
  let best: { qty: number; idx: number } | null = null;
  for (const m of pre.matchAll(numRe)) {
    const after = pre.slice(m.index! + m[0].length);
    if (UNIT_AFTER.test(after)) continue;
    const val = parseInt(m[1].replace(/,/g, ''), 10);
    const before = pre.slice(0, m.index!).trimEnd();
    const prevTok = before.split(/\s+/).pop() ?? '';
    if (
      LINE_SET.has(lc(prevTok)) ||
      (/\d/.test(prevTok) && /[a-z]/i.test(prevTok) && !/[:.)]$/.test(prevTok)) ||
      /^(gen|g|no\.?|#|number|model|series|version|fy|section|room|suite|building|phase|lot|item|line|clin|form|rfq|rfp|itb|ifb|bid|solicitation)$/i.test(prevTok)
    )
      continue;
    if (/^\s*:/.test(after) || /^\s+(?:RFP|RFQ|ITB|IFB)\b/.test(after)) continue;
    if (/\b(?:each|per \w+)\s+(?:with|containing|including|having)?\s*\(?$/i.test(before + ' ')) continue;
    if (val >= 1990 && val <= 2100) continue; // years
    if (val === 0) continue;
    const wordsBetween = after.slice(0, catIdx - (m.index! + m[0].length)).trim().split(/\s+/).filter(Boolean).length;
    if (wordsBetween > 7) continue;
    best = { qty: val, idx: m.index! };
  }
  if (best) return { qty: best.qty, snippet: clause.slice(best.idx, catEnd).trim() };
  // 3) number right after category: "laptops (250)", "laptops – 250 units"
  const post = masked.slice(catEnd, catEnd + 40);
  const pm = post.match(/^\s*[(\-–:,]?\s*(?:qty\.?|quantity)?\s*:?\s*(\d{1,3}(?:,\d{3})+|\d{1,6})\s*(?:units?|ea\.?|each|pcs|pieces|\))/i);
  if (pm) return { qty: parseInt(pm[1].replace(/,/g, ''), 10), snippet: clause.slice(Math.max(0, catIdx), catEnd + pm[0].length).trim() };
  return null;
}

const SPEC_RE =
  /\b(\d+\s?(?:GB|TB)(?:\s?DDR\d)?\s?(?:RAM|memory|SSD|NVMe(?: SSD)?|storage|HDD)?|Intel(?:®)? Core(?:™)? (?:Ultra )?[i\d](?:[- ]\d{3,5}\w*)?|AMD Ryzen(?: Pro)? \d(?: \d{4}\w*)?|Xeon(?: Gold| Silver| Platinum)? \d{4}\w*|\d{2}(?:\.\d)?(?:"|”|-inch| inch)|Windows 1[01] Pro|\d{2}-port|PoE\+?|\d{1,3}\s?(?:GbE|G SFP\+?|Gb uplinks?)|Wi-?Fi ?[67]E?|\d{3,5}\s?VA|\d{1,2}(?:\.\d)?\s?kVA|\d{1,2}U\b|redundant power supplies|dual power supplies)\b/gi;

export function findSpecs(s: string): string[] {
  return uniq([...s.matchAll(SPEC_RE)].map((m) => m[0].trim()));
}

function categoryHits(clause: string): { category: string; index: number; end: number }[] {
  const l = lc(clause);
  const hits: { category: string; index: number; end: number }[] = [];
  const all: { category: string; index: number; end: number; order: number }[] = [];
  CATEGORY_PATTERNS.forEach(({ category, patterns }, order) => {
    const re = new RegExp(patterns.source, 'g');
    const m = re.exec(l);
    if (m) all.push({ category, index: m.index, end: m.index + m[0].length, order });
  });
  // resolve overlaps: longer span wins, then the more specific (earlier) pattern
  all.sort((a, b) => b.end - b.index - (a.end - a.index) || a.order - b.order);
  for (const h of all) {
    if (hits.some((x) => h.index < x.end && x.index < h.end)) continue;
    hits.push({ category: h.category, index: h.index, end: h.end });
  }
  return hits.sort((a, b) => a.index - b.index);
}

export function extractItems(title: string, text: string): RequestedItem[] {
  const segs = [...segments(text), title];
  const items: RequestedItem[] = [];
  for (const seg of segs) {
    if (/\b(awarded to|previously purchased|last year we bought)\b/i.test(seg)) continue;
    const segSpecs = findSpecs(seg);
    const clauses = seg.split(/;\s*|,\s+(?=(?:and\s+)?(?:\(?\d|[A-Z]|one|two|three|plus))|\s+and\s+(?=\(?\d)|\s+plus\s+|\s+as well as\s+/);
    const segItems: RequestedItem[] = [];
    for (const clause of clauses) {
      const hits = categoryHits(clause);
      if (!hits.length) continue;
      const bm = findBrandModel(clause);
      // mask model numbers so "Latitude 5550" is never read as a quantity
      let masked = clause;
      if (bm?.raw) masked = masked.replace(bm.raw, (x) => x.replace(/\d/g, '#'));
      const parts = findPartNumbers(clause, bm?.model ?? null, !!bm);
      for (const p of parts) masked = masked.split(p).join(p.replace(/\d/g, '#'));
      let lowerHits = hits.filter((h) => !(h.category === 'Other IT Hardware' && hits.length > 1));
      if (lowerHits.length > 1) {
        // "monitors for clinic workstations" → workstations is the purpose, not a line item
        const purpose = lowerHits.filter((h) => /\bfor\s+(?:the\s+|its\s+|our\s+)?(?:[\w-]+\s+){0,2}$/i.test(clause.slice(0, h.index)) && h !== lowerHits[0]);
        lowerHits = lowerHits.filter((h) => !purpose.includes(h));
      }
      // the brand/model belongs to the first category noun that follows it
      const brandHit = bm ? (lowerHits.find((h) => h.index >= bm.index) ?? lowerHits[lowerHits.length - 1]) : null;
      lowerHits.forEach((h, i) => {
        const own = h === brandHit;
        const q = findQuantityNear(clause, h.index, h.end, masked, i > 0 ? lowerHits[i - 1].end : 0);
        const startCandidates = [h.index];
        if (q) startCandidates.push(Math.max(0, clause.indexOf(q.snippet)));
        if (bm && own) startCandidates.push(bm.index);
        const start = Math.max(0, Math.min(...startCandidates.filter((x) => x >= 0)));
        const backStart = Math.max(0, clause.lastIndexOf(' ', Math.max(0, start - 1)));
        const description = normalizeWs(clause.slice(start === h.index ? adjectiveStart(clause, h.index) : start, Math.max(h.end, bm && own ? bm.index + bm.raw.length : h.end)))
          .replace(/^(?:of|for|and|the|a|an)\s+/i, '')
          .replace(/^(?:will\s+)?(?:replace|replacing|maintain|managing|manage|purchase|procure|acquire|upgrade|refresh|buy)\s+/i, '')
          .slice(0, 140);
        void backStart;
        segItems.push({
          description: description || clause.slice(h.index, h.end),
          category: h.category,
          brand: own ? bm?.brand ?? null : null,
          model: own ? bm?.model ?? null : null,
          partNumber: own || (!bm && i === 0) ? parts[0] ?? null : null,
          quantity: q?.qty ?? null,
          specs: null,
          provenance: 'SOURCE_VERIFIED',
          evidence: normalizeWs(seg).slice(0, 300),
        });
      });
    }
    if (segItems.length === 1 && segSpecs.length) segItems[0].specs = segSpecs.join(', ');
    items.push(...segItems);
  }
  return mergeItems(items);
}

function adjectiveStart(clause: string, idx: number): number {
  // include up to 3 descriptive words before the category noun ("business-class", "rack-mount")
  const before = clause.slice(0, idx);
  const words = before.split(/(\s+)/);
  let taken = 0;
  let pos = idx;
  for (let i = words.length - 1; i >= 0 && taken < 3; i--) {
    const w = words[i];
    if (!w.trim()) {
      pos -= w.length;
      continue;
    }
    if (/^(for|of|the|a|an|and|to|with|seeking|requesting|purchase|procure|quotes?|quotations?|needs?|need|including|new|:)$/i.test(w.replace(/[^\w:-]/g, '')) || /[.:;]$/.test(w))
      break;
    pos -= w.length;
    taken++;
  }
  return Math.max(0, pos);
}

function mergeItems(items: RequestedItem[]): RequestedItem[] {
  const out: RequestedItem[] = [];
  for (const it of items) {
    const key = (x: RequestedItem) => `${x.category}|${lc(x.model ?? '')}`;
    const existing = out.find(
      (o) =>
        (key(o) === key(it) && (!!o.model || o.quantity === it.quantity || !o.quantity || !it.quantity)) ||
        (o.category === it.category && !!o.model && !!it.model && (lc(o.model).startsWith(lc(it.model)) || lc(it.model).startsWith(lc(o.model)))) ||
        (o.category === it.category && (!o.model || !it.model) && (o.quantity === it.quantity || !o.quantity || !it.quantity)),
    );
    if (existing) {
      existing.brand ??= it.brand;
      if (it.model && (!existing.model || it.model.length > existing.model.length)) existing.model = it.model;
      existing.partNumber ??= it.partNumber;
      existing.quantity ??= it.quantity;
      existing.specs ??= it.specs;
      if (it.description.length > existing.description.length && it.quantity) existing.description = it.description;
      if (it.quantity && existing.evidence && !/\d/.test(existing.evidence)) existing.evidence = it.evidence;
    } else out.push({ ...it });
  }
  // drop umbrella "Other IT Hardware" if a concrete category exists
  const concrete = out.filter((o) => o.category !== 'Other IT Hardware');
  return concrete.length ? concrete : out;
}

// ------------------------------------------------------------- dates & money
export function extractDeadline(doc: RawDocument, text: string): Field<string> {
  if (doc.structured?.deadline) return verified(doc.structured.deadline, `Response deadline: ${doc.structured.deadline}`);
  const re = new RegExp(
    `(?:due|deadline|closing date|closes?|close date|submitted by|no later than|responses? due|bids? due|quotes? due|proposals? due|response date|offers? due|submission date)[^.\\n]{0,60}?${DATE_RE.source}(?:[^.\\n]{0,25})?`,
    'i',
  );
  const m = text.match(re);
  if (!m) return nil();
  const dateStr = m[1];
  const iso = parseDateLoose(dateStr, m[0]);
  return iso ? verified(iso, normalizeWs(m[0])) : nil();
}

export function extractBudget(text: string): Field<number> {
  const m = text.match(
    /\b(?:budget(?:ed)?(?: amount)?|not[- ]to[- ]exceed|nte|estimated (?:value|cost|amount|budget|contract value)|funding (?:available|amount|of)|total budget)\s*(?:of|is|:|amount)?\s*(?:approximately\s*|up to\s*)?\$\s?([\d,]+(?:\.\d+)?)\s*(k|m|mm|million|thousand)?/i,
  );
  if (!m) return nil();
  const v = parseMoney(m[1], m[2]);
  return v ? verified(v, normalizeWs(m[0])) : nil();
}

// -------------------------------------------------------------------- contacts
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?:\+1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b(?:\s*(?:x|ext\.?)\s*\d{1,5})?/g;
const ci = (s: string) => s.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
const CONTACT_LABEL_RE = new RegExp(
  `(${['point of contact', 'primary contact', 'contact person', 'contracting officer', 'contract specialist', 'procurement officer', 'purchasing agent', 'purchasing manager', 'buyer', 'contact'].map(ci).join('|')}|${ci('questions')} (?:should be )?(?:directed|sent|submitted) to)` +
    String.raw`\s*[:\-–]\s*` +
    String.raw`([A-Z][a-z]+(?:\s[A-Z]\.)?(?:\s[A-Z][a-zA-Z'’-]+){1,2})(?:,\s*([A-Z][A-Za-z &/-]{2,60}?))?(?=[,;.\n(]|\s+at\s|\s+[a-z0-9._%+-]+@|$)`,
  'g',
);

export function extractContacts(doc: RawDocument, text: string): ContactInfo[] {
  const out: ContactInfo[] = [];
  for (const c of doc.structured?.contacts ?? []) out.push({ ...c, provenance: 'SOURCE_VERIFIED' });
  if (out.length) return out;
  const lines = text.split(/\n/);
  const usedEmails = new Set<string>();
  const usedPhones = new Set<string>();
  lines.forEach((line, i) => {
    for (const m of line.matchAll(CONTACT_LABEL_RE)) {
      const window = [line, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ');
      const email = window.match(EMAIL_RE)?.[0] ?? null;
      const phone = window.match(PHONE_RE)?.[0] ?? null;
      if (email) usedEmails.add(email);
      if (phone) usedPhones.add(phone);
      const isDept = /\b(procurement|purchasing|department|office|services|team|division|desk|center|unit)\b/i.test(m[2]);
      out.push({
        name: isDept ? null : m[2].trim(),
        title: isDept ? null : m[3]?.trim() ?? null,
        email,
        phone,
        linkedin: null,
        role: isDept ? m[2].trim() : roleFromLabel(m[1]),
        provenance: 'SOURCE_VERIFIED',
      });
    }
  });
  const emails = uniq([...text.matchAll(EMAIL_RE)].map((m) => m[0])).filter((e) => !usedEmails.has(e));
  const phones = uniq([...text.matchAll(PHONE_RE)].map((m) => m[0])).filter((p) => !usedPhones.has(p));
  if (emails.length || phones.length) {
    const n = Math.max(emails.length, phones.length, 1);
    for (let i = 0; i < n && out.length < 4; i++) {
      out.push({
        name: null,
        title: null,
        email: emails[i] ?? null,
        phone: phones[i] ?? null,
        linkedin: null,
        role: emails[i] && /procure|purchas|bids?|buyer|contract/i.test(emails[i]) ? 'Procurement mailbox' : 'Listed contact',
        provenance: 'SOURCE_VERIFIED',
      });
    }
  }
  return out;
}

function roleFromLabel(label: string): string {
  const l = lc(label);
  if (l.includes('contracting officer')) return 'Contracting Officer';
  if (l.includes('contract specialist')) return 'Contract Specialist';
  if (l.includes('procurement')) return 'Procurement Officer';
  if (l.includes('purchasing')) return 'Purchasing';
  if (l.includes('buyer')) return 'Buyer';
  if (l.includes('questions')) return 'Questions contact';
  return 'Point of Contact';
}

// ------------------------------------------------------------ requirement details
function firstSegment(text: string, re: RegExp): Field<string> {
  const seg = segments(text).find((s) => re.test(s));
  return seg ? verified(normalizeWs(seg).slice(0, 280), normalizeWs(seg).slice(0, 280)) : nil();
}

const CERT_RE =
  /\b(TAA[- ]compliant|Trade Agreements Act|Buy American|total small business set-aside|small business set-aside|8\(a\)|HUBZone|SDVOSB|WOSB|EDWOSB|authorized (?:reseller|partner|distributor)|ISO ?\d{4,5}|FIPS 140-[23]|Section 508|E-Rate|EPEAT(?: Gold| Silver)?|ENERGY STAR|Section 889|HIPAA|NIST (?:SP )?800-171|CMMC(?: Level \d)?|HUB (?:certified|vendor)|MWBE|DBE)\b/gi;

export function extractDetails(text: string, itemsSpecs: string[]) {
  const certs = uniq([...text.matchAll(CERT_RE)].map((m) => m[0]));
  const delivery = text.match(/(?:deliver(?:y|ed)? (?:to|location|address)|ship to|place of performance)\s*[:\-–]?\s*([^.\n]{5,110})/i);
  return {
    specifications: itemsSpecs.length ? verified(itemsSpecs.join('; '), itemsSpecs.join('; ')) : nil<string>(),
    deliveryLocation: delivery ? verified(delivery[1].trim(), normalizeWs(delivery[0])) : nil<string>(),
    warranty: firstSegment(text, /warrant/i),
    installation: firstSegment(text, /\b(install(?:ation|ed)?|imaging|deploy(?:ment)?|rack(?:ing)? and stack|white[- ]glove|asset tag)/i),
    support: firstSegment(text, /\b(technical support|on-?site support|support services|maintenance|next business day|nbd|sla|24x7|24\/7)\b/i),
    vendorRequirements: firstSegment(text, /\b(vendors?|bidders?|offerors?|respondents?|suppliers?|quoters?)\b[^.]{0,40}\b(must|shall|required to|are required)\b|\bmust be an? (?:authorized|registered)\b/i),
    certifications: certs.length ? verified(certs.join(', '), certs.join(', ')) : nil<string>(),
  };
}

// --------------------------------------------------------------------- facade
export function extractRequirements(doc: RawDocument): Extraction {
  const text = doc.text;
  const full = `${doc.title}\n${doc.text}`;
  const organization = extractOrganization(doc, full);
  const loc = extractLocation(doc, full);
  const items = extractItems(doc.title, text);
  const qtyItems = items.filter((i) => i.quantity != null);
  const totalQuantity: Field<number> = qtyItems.length
    ? verified(
        qtyItems.reduce((s, i) => s + (i.quantity ?? 0), 0),
        qtyItems.map((i) => i.evidence).filter(Boolean).slice(0, 2).join(' … '),
      )
    : nil();
  const specs = items.map((i) => i.specs).filter((s): s is string => !!s);
  const details = extractDetails(text, specs);
  const pt: ProcurementType = detectProcurementType(full, doc.structured?.procurementType ?? null);
  return {
    organization,
    organizationType: inferOrganizationType(organization.value, doc, full),
    items,
    categories: uniq(items.map((i) => i.category).filter((c): c is string => !!c)),
    totalQuantity,
    budget: extractBudget(full),
    deadline: extractDeadline(doc, full),
    deliveryLocation: details.deliveryLocation,
    city: loc.city,
    state: loc.state,
    zip: loc.zip,
    country: loc.country,
    procurementType:
      pt === 'UNKNOWN'
        ? { value: 'UNKNOWN', provenance: 'UNKNOWN', evidence: null }
        : doc.structured?.procurementType
          ? verified(pt, `Notice type: ${pt}`)
          : inferred(pt, null),
    specifications: details.specifications,
    warranty: details.warranty,
    installation: details.installation,
    support: details.support,
    vendorRequirements: details.vendorRequirements,
    certifications: details.certifications,
    contacts: extractContacts(doc, full),
  };
}
