// Contextual document classifier (rules engine).
//
// This is deliberately NOT a keyword counter. It decides what KIND of document
// it is looking at (a procurement notice, a plan, a news story, a job ad, a
// product advertisement, an award) and only then whether hardware is involved.
// "Dell laptops" inside a news review is irrelevant; the same words inside
// "request for quotation for 250 Dell laptops" are a HOT signal.
//
// When an LLM provider is configured, its classification is used instead and
// this engine acts as a fallback + sanity check.

import { CATEGORY_PATTERNS, STATES } from '../constants';
import { lc } from '../text';
import type { Classification, DocumentKind, ProcurementType, RawDocument } from '../types';

const RX = {
  explicitProcurement:
    /\b(request for (?:quotations?|quotes?|proposals?|bids?)|rfq|rfp|itb|ifb|invitation (?:to|for) bids?|combined synopsis|solicitation (?:no\.?|number|#)|sealed bids?|bids? (?:are )?(?:due|will be received|opening)|quotes? (?:are )?(?:requested|due)|submit (?:a |your )?(?:quote|quotation|proposal|bid)s?|responses? (?:are )?due|(?:seeking|requesting) (?:quotes|quotations|proposals|bids|vendors?|suppliers?)|vendors? (?:interested|are invited)|interested vendors|offerors? (?:shall|must)|looking for (?:a )?(?:suppliers?|vendors?))\b/,
  weakProcurement: /\b(we need|looking to (?:purchase|buy|procure)|purchase of|procurement of|intends? to (?:purchase|procure|acquire)|equipment needed)\b/,
  earlyProcurement: /\b(sources sought|request for information|rfi|market research|presolicitation|pre-solicitation|notice of intent|capability statements?)\b/,
  planned:
    /\b(plans? to (?:refresh|replace|upgrade|purchase|buy|procure|acquire)|planning (?:a|to|for)|next (?:fiscal )?year|(?:budget|funding) (?:was |has been )?approved|board (?:approved|voted)|upcoming (?:refresh|upgrade|replacement)|(?:technology|device|hardware|it) refresh (?:plan|cycle|program)|will be (?:replacing|upgrading|purchasing)|later this year|in fy ?\d{2,4}|capital (?:plan|budget|improvement))\b/,
  news: /\b(according to|announced (?:today|on|that)|press release|told reporters|in an interview|staff writer|hands-on review|review:|benchmarks?|we tested|analysts? (?:say|expect)|market share|quarterly earnings|shipments (?:rose|fell))\b/,
  job: /\b(job (?:description|opening|posting|title)|we are hiring|now hiring|apply (?:now|online|today)|salary|compensation range|responsibilities include|qualifications:|minimum qualifications|full[- ]time|part[- ]time|years of experience|equal opportunity employer)\b/,
  ad: /\b(shop now|buy now|on sale|free shipping|add to cart|limited[- ]time (?:offer|deal)|\d+% off|order today|in stock now|lowest prices?|best deals?|save \$\d+)\b/,
  award: /\b(awarded to|award notice|contract award|was awarded|award (?:date|amount)|notice of award|intent to award)\b/,
};

export function detectCategories(text: string): string[] {
  const t = lc(text);
  const found: string[] = [];
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    if (patterns.test(t)) found.push(category);
  }
  return found;
}

export function detectProcurementType(text: string, hint?: ProcurementType | null): ProcurementType {
  if (hint && hint !== 'UNKNOWN') return hint;
  const t = lc(text);
  if (/\b(request for quotations?|request for quotes?|rfq|quote request|requesting (?:quotes|quotations)|quotations? (?:are )?requested)\b/.test(t)) return 'RFQ';
  if (/\b(request for proposals?|rfp)\b/.test(t)) return 'RFP';
  if (/\b(invitation (?:to|for) bids?|itb|ifb|sealed bids?)\b/.test(t)) return 'ITB';
  if (/\bcombined synopsis\b/.test(t)) return 'COMBINED_SYNOPSIS';
  if (/\b(sources sought|request for information|rfi)\b/.test(t)) return 'SOURCES_SOUGHT';
  if (/\b(presolicitation|pre-solicitation)\b/.test(t)) return 'PRESOLICITATION';
  if (/\b(sole source|justification and approval|j&a|brand name justification)\b/.test(t)) return 'SOLE_SOURCE';
  if (RX.award.test(t)) return 'AWARD';
  if (/\bsolicitation\b/.test(t)) return 'SOLICITATION';
  if (RX.planned.test(t)) return 'PLANNED_PURCHASE';
  if (/\b(we need|looking to (?:purchase|buy)|seeking (?:quotes|quotations|vendors?|suppliers?)|quotes? requested)\b/.test(t))
    return 'DIRECT_REQUEST';
  return 'UNKNOWN';
}

export function detectUS(doc: RawDocument, text: string): boolean | null {
  const c = doc.structured?.country;
  if (c) return /^(us|usa|united states)$/i.test(c.trim());
  if (doc.structured?.state && STATES.some((s) => s.code === doc.structured!.state)) return true;
  if (/\.gov\b|\.us\b|\bk12\.[a-z]{2}\.us\b/.test(lc(doc.sourceUrl ?? ''))) return true;
  const stateHit = STATES.some(
    (s) => new RegExp(`\\b${s.name}\\b`).test(text) || new RegExp(`,\\s*${s.code}\\b(?:\\s+\\d{5})?`).test(text),
  );
  if (stateHit) return true;
  if (/\b(canada|united kingdom|australia|india|germany|mexico|philippines|nigeria)\b/i.test(text)) return false;
  return null;
}

export function classifyDocument(doc: RawDocument): Classification {
  const text = `${doc.title}\n${doc.text}`;
  const t = lc(text);
  const signals: string[] = [];
  const categories = detectCategories(text);
  const hardwareRelevant = categories.length > 0;
  if (hardwareRelevant) signals.push(`Hardware vocabulary: ${categories.slice(0, 4).join(', ')}`);
  else signals.push('No IT hardware requirement detected');

  const hint = doc.structured?.procurementType ?? null;
  const explicit = RX.explicitProcurement.test(t) || ['RFQ', 'RFP', 'ITB', 'SOLICITATION', 'COMBINED_SYNOPSIS'].includes(hint ?? '');
  const weak = RX.weakProcurement.test(t);
  const early = RX.earlyProcurement.test(t) || ['SOURCES_SOUGHT', 'PRESOLICITATION'].includes(hint ?? '');
  const planned = RX.planned.test(t);
  const news = RX.news.test(t);
  const job = RX.job.test(t);
  const ad = RX.ad.test(t);
  const award = RX.award.test(t) || hint === 'AWARD';

  if (weak && !explicit) signals.push('Direct buying language ("we need", "purchase of")');
  if (explicit) signals.push('Explicit procurement language (quote/proposal/bid requested)');
  if (early) signals.push('Early-stage procurement language (sources sought / RFI / presolicitation)');
  if (planned) signals.push('Forward-looking purchase plan language');
  if (news) signals.push('Editorial/news language');
  if (job) signals.push('Job-posting language');
  if (ad) signals.push('Retail/advertising language');
  if (award) signals.push('Award language (purchase already made)');

  let kind: DocumentKind;
  if (award && !explicit) kind = 'AWARD_NOTICE';
  else if ((explicit || early) && !ad) kind = 'PROCUREMENT_NOTICE'; // explicit buying requirement wins even inside a job page
  else if (weak && !news && !job && !ad) kind = 'PROCUREMENT_NOTICE';
  else if (ad) kind = 'ADVERTISEMENT';
  else if (job) kind = 'JOB_POSTING';
  else if (news && !planned) kind = 'NEWS_ARTICLE';
  else if (planned) kind = 'PLANNED_PURCHASE';
  else if (hint && hint !== 'UNKNOWN') kind = 'PROCUREMENT_NOTICE';
  else kind = 'OTHER';

  const isUS = detectUS(doc, text);
  if (isUS === true) signals.push('U.S. location identified');
  if (isUS === false) signals.push('Non-U.S. location');

  return { documentKind: kind, hardwareRelevant, isUS, signals };
}
