// Explainable intent scoring service.
//
// The score is computed deterministically from classified + extracted facts,
// never taken from an LLM's self-reported number. Every point is attached to a
// human-readable reason so a salesperson can see WHY an opportunity is HOT.
// Weights are editable in /admin → Intent Rules.

import { daysBetween } from '../text';
import type { AppSettings, Classification, Extraction, IntentLevel, IntentScore, IntentWeights, RawDocument, ScoreReason } from '../types';

export const DEFAULT_WEIGHTS: IntentWeights = {
  explicitProcurement: 25,
  earlyProcurement: 15,
  plannedPurchase: 12,
  exactProduct: 18,
  genericProduct: 8,
  quantity: 14,
  deadline: 10,
  deadlineUrgent: 4,
  usOrganization: 6,
  contact: 10,
  organizationOnly: 4,
  recentPublication: 8,
  budget: 5,
  news: -30,
  jobPosting: -30,
  advertisement: -25,
  historical: -20,
  duplicate: -20,
  irrelevant: -100,
  nonUS: -30,
  expired: -40,
};

export const DEFAULT_THRESHOLDS = { hot: 75, warm: 50, low: 25 };

export interface ScoreInput {
  doc: RawDocument;
  classification: Classification;
  extraction: Extraction;
  isDuplicate?: boolean;
  now?: string;
  settings?: Pick<AppSettings, 'intentWeights' | 'thresholds'>;
}

export function scoreIntent(input: ScoreInput): IntentScore {
  const { doc, classification: c, extraction: x } = input;
  const w = input.settings?.intentWeights ?? DEFAULT_WEIGHTS;
  const th = input.settings?.thresholds ?? DEFAULT_THRESHOLDS;
  const now = input.now ?? new Date().toISOString();
  const reasons: ScoreReason[] = [];
  const add = (code: string, label: string, points: number) => {
    if (points !== 0) reasons.push({ code, label, points });
  };

  const pt = x.procurementType.value;
  const kind = c.documentKind;

  // ---- buying-signal strength
  if (kind === 'PROCUREMENT_NOTICE') {
    if (pt && ['RFQ', 'RFP', 'ITB', 'SOLICITATION', 'COMBINED_SYNOPSIS', 'DIRECT_REQUEST'].includes(pt)) {
      add('EXPLICIT_PROCUREMENT', `Explicit ${pt === 'DIRECT_REQUEST' ? 'buying request' : pt.replace('_', ' ')}`, w.explicitProcurement);
    } else if (pt && ['SOURCES_SOUGHT', 'PRESOLICITATION', 'SOLE_SOURCE'].includes(pt)) {
      add('EARLY_PROCUREMENT', `Early-stage procurement (${pt.replace('_', ' ').toLowerCase()})`, w.earlyProcurement);
    } else {
      add('EXPLICIT_PROCUREMENT', 'Procurement language present', Math.round(w.explicitProcurement * 0.6));
    }
  } else if (kind === 'PLANNED_PURCHASE') {
    add('PLANNED', 'Planned purchase (no active solicitation yet)', w.plannedPurchase);
  }

  // ---- requirement specificity
  const exact = x.items.find((i) => i.model || i.partNumber);
  if (exact) {
    add('EXACT_PRODUCT', `Exact product requested: ${[exact.brand, exact.model ?? exact.partNumber].filter(Boolean).join(' ')}`, w.exactProduct);
  } else if (x.items.length) {
    add('GENERIC_PRODUCT', `Hardware category identified: ${x.categories.slice(0, 3).join(', ')}`, w.genericProduct);
  }
  if (x.totalQuantity.value) {
    const top = x.items.find((i) => i.quantity);
    add('QUANTITY', `${x.totalQuantity.value.toLocaleString('en-US')} units specified${top?.category ? ` (${top.category.toLowerCase()})` : ''}`, w.quantity);
  }
  if (x.budget.value) add('BUDGET', `Budget stated ($${x.budget.value.toLocaleString('en-US')})`, w.budget);

  // ---- timing
  let urgencyScore = 20;
  let urgencyLabel = 'No deadline stated';
  if (x.deadline.value) {
    const days = daysBetween(now, x.deadline.value);
    if (days < 0) {
      add('EXPIRED', 'Response deadline has passed', w.expired);
      urgencyScore = 0;
      urgencyLabel = 'Deadline passed';
    } else {
      const d = Math.ceil(days);
      add('DEADLINE', `Deadline in ${d} day${d === 1 ? '' : 's'}`, w.deadline + (d <= 7 ? w.deadlineUrgent ?? 0 : 0));
      urgencyScore = d <= 3 ? 100 : d <= 7 ? 85 : d <= 14 ? 65 : d <= 30 ? 45 : 25;
      urgencyLabel = d <= 1 ? 'Due within 24 hours' : `Due in ${d} days`;
    }
  }
  if (doc.publishedAt) {
    const age = daysBetween(doc.publishedAt, now);
    if (age <= 7) add('RECENT', 'Published within the last 7 days', w.recentPublication);
    else if (age <= 30) add('RECENT', 'Published within the last 30 days', Math.round(w.recentPublication / 2));
  }

  // ---- buyer identification
  if (c.isUS === true) add('US_ORG', 'U.S. organization', w.usOrganization);
  if (c.isUS === false) add('NON_US', 'Non-U.S. buyer', w.nonUS);
  const hasContact = x.contacts.some((k) => k.email || k.phone);
  if (hasContact) add('CONTACT', 'Buyer contact published in source', w.contact);
  else if (x.organization.value) add('ORG_ONLY', 'Buyer organization identified', w.organizationOnly);

  // ---- negative context
  if (kind === 'NEWS_ARTICLE') add('NEWS', 'News/editorial content, not a buying request', w.news);
  if (kind === 'JOB_POSTING') add('JOB', 'Job posting without procurement intent', w.jobPosting);
  if (kind === 'ADVERTISEMENT') add('AD', 'Product advertisement', w.advertisement);
  if (kind === 'AWARD_NOTICE') add('HISTORICAL', 'Award/historical purchase — no open requirement', w.historical);
  if (input.isDuplicate) add('DUPLICATE', 'Possible duplicate of an existing opportunity', w.duplicate);
  if (!c.hardwareRelevant) add('IRRELEVANT', 'No IT hardware requirement found', w.irrelevant);

  const raw = reasons.reduce((s, r) => s + r.points, 0);
  let score = Math.max(0, Math.min(100, raw));

  // ---- level with contextual guards (a news story can never be HOT, however many keywords it has)
  let level: IntentLevel;
  if (!c.hardwareRelevant || ['NEWS_ARTICLE', 'JOB_POSTING', 'ADVERTISEMENT', 'OTHER'].includes(kind)) {
    level = score >= th.low && kind === 'OTHER' && c.hardwareRelevant ? 'LOW' : 'IRRELEVANT';
    if (level === 'IRRELEVANT') score = Math.min(score, th.low - 1);
  } else if (kind === 'AWARD_NOTICE') {
    level = 'LOW';
    score = Math.min(Math.max(score, th.low), th.warm - 1);
  } else if (kind === 'PLANNED_PURCHASE' || (kind === 'PROCUREMENT_NOTICE' && (pt === 'SOURCES_SOUGHT' || pt === 'PRESOLICITATION'))) {
    // a stated plan / early market research from an identified buyer is a WARM lead by definition
    if (score >= th.low && x.organization.value) {
      level = 'WARM';
      score = Math.max(th.warm, Math.min(score, th.hot - 1));
    } else level = score >= th.low ? 'LOW' : 'IRRELEVANT';
    if (kind === 'PLANNED_PURCHASE') score = Math.min(score, th.hot - 1);
  } else if (urgencyScore === 0 && x.deadline.value) {
    level = 'LOW';
    score = Math.min(score, th.warm - 1);
  } else {
    level = score >= th.hot ? 'HOT' : score >= th.warm ? 'WARM' : score >= th.low ? 'LOW' : 'IRRELEVANT';
  }

  return { score, level, reasons, urgencyScore, urgencyLabel };
}
