// Structured-output contract for LLM providers + validation + grounding.
//
// 1. buildPrompt()      – the instruction + JSON schema sent to any LLM
// 2. parseJson()        – tolerant JSON extraction from the model response
// 3. validateOutput()   – strict schema validation (reject → heuristic fallback)
// 4. groundOutput()     – anti-hallucination: every quantity, date, budget,
//                         email, phone and name must literally appear in the
//                         source text, otherwise it is nulled. Other fields
//                         without verbatim evidence are downgraded to
//                         AI_INFERENCE.

import { HARDWARE_CATEGORIES, ORGANIZATION_TYPES, STATES } from '../constants';
import { parseDateLoose, textContains, uniq } from '../text';
import type { ContactInfo, DocumentKind, Extraction, Field, OrganizationType, ProcurementType, RawDocument, RequestedItem } from '../types';
import { analyzeHeuristically } from './heuristicProvider';
import type { AIAnalysisResult } from './types';

const DOC_KINDS: DocumentKind[] = ['PROCUREMENT_NOTICE', 'PLANNED_PURCHASE', 'AWARD_NOTICE', 'NEWS_ARTICLE', 'JOB_POSTING', 'ADVERTISEMENT', 'OTHER'];
const PROC_TYPES: ProcurementType[] = [
  'RFQ', 'RFP', 'ITB', 'SOLICITATION', 'COMBINED_SYNOPSIS', 'SOURCES_SOUGHT', 'PRESOLICITATION', 'SOLE_SOURCE', 'AWARD', 'PLANNED_PURCHASE', 'DIRECT_REQUEST', 'UNKNOWN',
];

export const LLM_JSON_SCHEMA = {
  type: 'object',
  required: ['document_kind', 'hardware_relevant', 'items', 'summary', 'reasoning'],
  properties: {
    document_kind: { enum: DOC_KINDS },
    hardware_relevant: { type: 'boolean' },
    is_us: { type: ['boolean', 'null'] },
    procurement_type: { enum: [...PROC_TYPES, null] },
    organization: { $ref: '#/$defs/evidenced_string' },
    organization_type: { enum: [...ORGANIZATION_TYPES, null] },
    location: {
      type: 'object',
      properties: { city: { type: ['string', 'null'] }, state: { type: ['string', 'null'] }, zip: { type: ['string', 'null'] }, evidence: { type: ['string', 'null'] } },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'evidence'],
        properties: {
          description: { type: 'string' },
          category: { enum: [...HARDWARE_CATEGORIES, null] },
          brand: { type: ['string', 'null'] },
          model: { type: ['string', 'null'] },
          part_number: { type: ['string', 'null'] },
          quantity: { type: ['integer', 'null'] },
          specs: { type: ['string', 'null'] },
          evidence: { type: 'string', description: 'verbatim sentence from the source' },
        },
      },
    },
    budget: { $ref: '#/$defs/evidenced_number' },
    deadline: { $ref: '#/$defs/evidenced_string', description: 'value as YYYY-MM-DD' },
    delivery_location: { $ref: '#/$defs/evidenced_string' },
    warranty: { $ref: '#/$defs/evidenced_string' },
    installation: { $ref: '#/$defs/evidenced_string' },
    support: { $ref: '#/$defs/evidenced_string' },
    vendor_requirements: { $ref: '#/$defs/evidenced_string' },
    certifications: { $ref: '#/$defs/evidenced_string' },
    contacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: ['string', 'null'] }, title: { type: ['string', 'null'] }, email: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] }, role: { type: ['string', 'null'] }, evidence: { type: ['string', 'null'] },
        },
      },
    },
    summary: { type: 'string' },
    reasoning: { type: 'array', items: { type: 'string' } },
  },
  $defs: {
    evidenced_string: { type: 'object', properties: { value: { type: ['string', 'null'] }, evidence: { type: ['string', 'null'] } } },
    evidenced_number: { type: 'object', properties: { value: { type: ['number', 'null'] }, evidence: { type: ['string', 'null'] } } },
  },
} as const;

export function buildPrompt(doc: RawDocument): { system: string; user: string } {
  const system = `You are the buying-intent analyst for ETechMatter, a U.S. IT hardware reseller.
You read ONE public document (procurement notice, web page, post) and return ONLY a JSON object that follows the schema.

Decide the document kind from CONTEXT, not keywords:
- PROCUREMENT_NOTICE: an organization is actively asking vendors for quotes/bids/proposals or states it needs to buy now (RFQ, RFP, ITB, sources sought, "we need 40 laptops").
- PLANNED_PURCHASE: a future/planned refresh or approved budget without an open solicitation.
- AWARD_NOTICE: the purchase was already awarded (historical).
- NEWS_ARTICLE, JOB_POSTING (unless it ALSO contains an explicit purchase requirement), ADVERTISEMENT, OTHER.

Hard rules:
- NEVER invent or guess. If a value is not stated in the document, return null.
- Quantities, budgets, deadlines, names, emails and phone numbers must appear verbatim in the document.
- Every "evidence" must be an exact quote copied from the document (max 300 chars).
- Do not infer contact people. Do not construct emails from names.
- "category" must be one of: ${HARDWARE_CATEGORIES.join(', ')}.
- "state" must be a two-letter U.S. state code or null.
- Keep "summary" to 1–2 factual sentences. "reasoning" is a short list of the contextual signals you used.

JSON schema:
${JSON.stringify(LLM_JSON_SCHEMA)}`;
  const user = `SOURCE: ${doc.sourceName} (${doc.sourceType})
URL: ${doc.sourceUrl ?? 'n/a'}
PUBLISHED: ${doc.publishedAt ?? 'unknown'}
STRUCTURED FIELDS FROM SOURCE API: ${JSON.stringify(doc.structured ?? {})}
TITLE: ${doc.title}

DOCUMENT TEXT:
"""
${doc.text.slice(0, 24_000)}
"""

Return only the JSON object.`;
  return { system, user };
}

export function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object in model response');
  return JSON.parse(body.slice(start, end + 1));
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export interface ValidatedLLMOutput {
  document_kind: DocumentKind;
  hardware_relevant: boolean;
  is_us: boolean | null;
  procurement_type: ProcurementType | null;
  organization: { value: string | null; evidence: string | null };
  organization_type: OrganizationType | null;
  location: { city: string | null; state: string | null; zip: string | null; evidence: string | null };
  items: { description: string; category: string | null; brand: string | null; model: string | null; part_number: string | null; quantity: number | null; specs: string | null; evidence: string | null }[];
  budget: { value: number | null; evidence: string | null };
  deadline: { value: string | null; evidence: string | null };
  delivery_location: { value: string | null; evidence: string | null };
  warranty: { value: string | null; evidence: string | null };
  installation: { value: string | null; evidence: string | null };
  support: { value: string | null; evidence: string | null };
  vendor_requirements: { value: string | null; evidence: string | null };
  certifications: { value: string | null; evidence: string | null };
  contacts: { name: string | null; title: string | null; email: string | null; phone: string | null; role: string | null; evidence: string | null }[];
  summary: string;
  reasoning: string[];
}

export function validateOutput(input: unknown): { ok: true; value: ValidatedLLMOutput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['root is not an object'] };
  const o = input;
  if (!DOC_KINDS.includes(o.document_kind as DocumentKind)) errors.push('document_kind invalid');
  if (typeof o.hardware_relevant !== 'boolean') errors.push('hardware_relevant must be boolean');
  if (!Array.isArray(o.items)) errors.push('items must be an array');
  if (typeof o.summary !== 'string') errors.push('summary must be a string');
  if (o.procurement_type != null && !PROC_TYPES.includes(o.procurement_type as ProcurementType)) errors.push('procurement_type invalid');
  if (errors.length) return { ok: false, errors };

  const ev = (v: unknown) => (isObj(v) ? { value: strOrNull(v.value), evidence: strOrNull(v.evidence) } : { value: null, evidence: null });
  const evNum = (v: unknown) =>
    isObj(v) ? { value: typeof v.value === 'number' && isFinite(v.value) ? v.value : null, evidence: strOrNull(v.evidence) } : { value: null, evidence: null };
  const loc = isObj(o.location) ? o.location : {};
  const items = (o.items as unknown[]).filter(isObj).map((it) => ({
    description: strOrNull(it.description) ?? '',
    category: (HARDWARE_CATEGORIES as readonly string[]).includes(it.category as string) ? (it.category as string) : null,
    brand: strOrNull(it.brand),
    model: strOrNull(it.model),
    part_number: strOrNull(it.part_number),
    quantity: Number.isInteger(it.quantity) && (it.quantity as number) > 0 ? (it.quantity as number) : null,
    specs: strOrNull(it.specs),
    evidence: strOrNull(it.evidence),
  }));
  const contacts = (Array.isArray(o.contacts) ? o.contacts : []).filter(isObj).map((c) => ({
    name: strOrNull(c.name), title: strOrNull(c.title), email: strOrNull(c.email), phone: strOrNull(c.phone), role: strOrNull(c.role), evidence: strOrNull(c.evidence),
  }));
  const state = strOrNull(loc.state)?.toUpperCase() ?? null;
  return {
    ok: true,
    value: {
      document_kind: o.document_kind as DocumentKind,
      hardware_relevant: o.hardware_relevant as boolean,
      is_us: typeof o.is_us === 'boolean' ? o.is_us : null,
      procurement_type: (o.procurement_type as ProcurementType) ?? null,
      organization: ev(o.organization),
      organization_type: ORGANIZATION_TYPES.includes(o.organization_type as OrganizationType) ? (o.organization_type as OrganizationType) : null,
      location: { city: strOrNull(loc.city), state: state && STATES.some((s) => s.code === state) ? state : null, zip: strOrNull(loc.zip), evidence: strOrNull(loc.evidence) },
      items,
      budget: evNum(o.budget),
      deadline: ev(o.deadline),
      delivery_location: ev(o.delivery_location),
      warranty: ev(o.warranty),
      installation: ev(o.installation),
      support: ev(o.support),
      vendor_requirements: ev(o.vendor_requirements),
      certifications: ev(o.certifications),
      contacts,
      summary: (o.summary as string).trim(),
      reasoning: Array.isArray(o.reasoning) ? (o.reasoning as unknown[]).filter((r): r is string => typeof r === 'string').slice(0, 10) : [],
    },
  };
}

/**
 * Apply grounding rules to validated LLM output and merge with the heuristic
 * baseline (heuristic values fill any field the LLM left null).
 */
export function groundOutput(doc: RawDocument, v: ValidatedLLMOutput, provider: string, model: string | null): AIAnalysisResult {
  const text = `${doc.title}\n${doc.text}\n${JSON.stringify(doc.structured ?? {})}`;
  const base = analyzeHeuristically(doc);
  const corrections: string[] = [];
  const has = (s: string | null | undefined) => !!s && textContains(text, s);

  const field = (name: string, f: { value: string | null; evidence: string | null }, fallback: Field<string>, strict = false): Field<string> => {
    if (!f.value) return fallback;
    if (has(f.evidence) && (has(f.value) || !strict)) return { value: f.value, provenance: 'SOURCE_VERIFIED', evidence: f.evidence };
    if (strict) {
      corrections.push(`${name}: "${f.value}" not found in source — removed`);
      return fallback.provenance === 'SOURCE_VERIFIED' ? fallback : { value: null, provenance: 'UNKNOWN', evidence: null };
    }
    corrections.push(`${name}: no verbatim evidence — marked AI inference`);
    return { value: f.value, provenance: 'AI_INFERENCE', evidence: f.evidence };
  };

  // deadline: parse + must be literally supported
  let deadline = base.extraction.deadline;
  if (v.deadline.value) {
    const iso = parseDateLoose(v.deadline.value);
    if (iso && has(v.deadline.evidence)) deadline = { value: iso, provenance: 'SOURCE_VERIFIED', evidence: v.deadline.evidence };
    else if (!base.extraction.deadline.value) corrections.push(`deadline: "${v.deadline.value}" not supported by source — removed`);
  }

  // budget: the number must appear in the evidence, and the evidence in the text
  let budget = base.extraction.budget;
  if (v.budget.value != null) {
    const digits = String(Math.round(v.budget.value));
    const evDigits = (v.budget.evidence ?? '').replace(/[^0-9]/g, '');
    if (has(v.budget.evidence) && (evDigits.includes(digits) || /\d\s*(k|m|million|thousand)/i.test(v.budget.evidence ?? '')))
      budget = { value: v.budget.value, provenance: 'SOURCE_VERIFIED', evidence: v.budget.evidence };
    else corrections.push('budget: not supported by source — removed');
  }

  // items: quantity/brand/model must be present in the quoted evidence
  const items: RequestedItem[] = [];
  for (const it of v.items) {
    const evOk = has(it.evidence);
    const ev = it.evidence ?? '';
    let quantity = it.quantity;
    if (quantity != null && !(evOk && new RegExp(`\\b${quantity.toLocaleString('en-US').replace(/,/g, ',?')}\\b`).test(ev))) {
      corrections.push(`item "${it.description}": quantity ${quantity} not in source — removed`);
      quantity = null;
    }
    const brand = it.brand && has(it.brand) ? it.brand : null;
    const model = it.model && has(it.model) ? it.model : null;
    const part = it.part_number && has(it.part_number) ? it.part_number : null;
    if (it.brand && !brand) corrections.push(`item brand "${it.brand}" not in source — removed`);
    if (it.model && !model) corrections.push(`item model "${it.model}" not in source — removed`);
    items.push({
      description: it.description,
      category: it.category,
      brand,
      model,
      partNumber: part,
      quantity,
      specs: it.specs,
      provenance: evOk ? 'SOURCE_VERIFIED' : 'AI_INFERENCE',
      evidence: evOk ? it.evidence : null,
    });
  }

  // contacts: every identifier must literally appear
  const contacts: ContactInfo[] = [];
  for (const c of v.contacts) {
    const name = c.name && has(c.name) ? c.name : null;
    const email = c.email && has(c.email) ? c.email : null;
    const phone = c.phone && has(c.phone) ? c.phone : null;
    if ((c.name && !name) || (c.email && !email) || (c.phone && !phone)) corrections.push('contact: unsupported identifier removed');
    if (!name && !email && !phone) continue;
    contacts.push({ name, title: c.title && has(c.title) ? c.title : null, email, phone, linkedin: null, role: c.role, provenance: 'SOURCE_VERIFIED' });
  }

  const qtyItems = items.filter((i) => i.quantity);
  const org = field('organization', v.organization, base.extraction.organization, true);
  const loc = v.location;
  const locOk = has(loc.evidence) || (loc.city ? has(loc.city) : false);
  const extraction: Extraction = {
    ...base.extraction,
    organization: org,
    organizationType: v.organization_type ? { value: v.organization_type, provenance: 'AI_INFERENCE', evidence: null } : base.extraction.organizationType,
    items: items.length ? items : base.extraction.items,
    categories: uniq((items.length ? items : base.extraction.items).map((i) => i.category).filter((c): c is string => !!c)),
    totalQuantity: qtyItems.length
      ? { value: qtyItems.reduce((s, i) => s + (i.quantity ?? 0), 0), provenance: 'SOURCE_VERIFIED', evidence: qtyItems.map((i) => i.evidence).join(' … ').slice(0, 300) }
      : items.length ? { value: null, provenance: 'UNKNOWN', evidence: null } : base.extraction.totalQuantity,
    budget,
    deadline,
    city: loc.city && locOk ? { value: loc.city, provenance: 'SOURCE_VERIFIED', evidence: loc.evidence } : base.extraction.city,
    state: loc.state && locOk ? { value: loc.state, provenance: has(loc.evidence) ? 'SOURCE_VERIFIED' : 'AI_INFERENCE', evidence: loc.evidence } : base.extraction.state,
    zip: loc.zip && has(loc.zip) ? { value: loc.zip, provenance: 'SOURCE_VERIFIED', evidence: loc.evidence } : base.extraction.zip,
    procurementType: v.procurement_type
      ? { value: v.procurement_type, provenance: doc.structured?.procurementType ? 'SOURCE_VERIFIED' : 'AI_INFERENCE', evidence: null }
      : base.extraction.procurementType,
    deliveryLocation: field('delivery_location', v.delivery_location, base.extraction.deliveryLocation),
    warranty: field('warranty', v.warranty, base.extraction.warranty),
    installation: field('installation', v.installation, base.extraction.installation),
    support: field('support', v.support, base.extraction.support),
    vendorRequirements: field('vendor_requirements', v.vendor_requirements, base.extraction.vendorRequirements),
    certifications: field('certifications', v.certifications, base.extraction.certifications),
    contacts: contacts.length ? contacts : base.extraction.contacts,
  };

  return {
    classification: {
      documentKind: v.document_kind,
      hardwareRelevant: v.hardware_relevant && extraction.items.length > 0,
      isUS: v.is_us ?? base.classification.isUS,
      signals: v.reasoning.length ? v.reasoning : base.classification.signals,
    },
    extraction,
    summary: v.summary,
    reasoning: v.reasoning,
    provider,
    model,
    groundingCorrections: corrections,
  };
}
