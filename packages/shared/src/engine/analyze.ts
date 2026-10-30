// Turns (document + AI analysis) into a scored, matched, evidence-backed Opportunity.

import type { AIAnalysisResult } from '../ai/types';
import { describeItems } from '../ai/heuristicProvider';
import { daysBetween, newId, normalizeWs, uniq } from '../text';
import type { AppSettings, Evidence, Opportunity, Product, Provenance, RawDocument } from '../types';
import { findDuplicateCandidates } from './dedupe';
import { matchOpportunity } from './matching';
import { scoreIntent } from './scoring';

export interface BuildOptions {
  catalog: Product[];
  settings?: AppSettings;
  pool?: Opportunity[]; // existing opportunities for soft-duplicate detection
  now?: string;
  existing?: Opportunity | null; // hard duplicate (same source id) → update in place
}

export function buildOpportunity(doc: RawDocument, ai: AIAnalysisResult, opts: BuildOptions): Opportunity {
  const now = opts.now ?? new Date().toISOString();
  const x = ai.extraction;
  const c = ai.classification;

  // ---------- evidence (every opportunity must carry source evidence)
  const evidence: Evidence[] = [];
  const pushEv = (field: string, snippet: string | null | undefined) => {
    if (!snippet) return;
    const s = normalizeWs(snippet).slice(0, 400);
    if (evidence.some((e) => e.snippet === s)) return;
    evidence.push({ id: newId('ev'), sourceUrl: doc.sourceUrl, sourceName: doc.sourceName, snippet: s, field, publishedAt: doc.publishedAt, retrievedAt: doc.retrievedAt });
  };
  pushEv('title', doc.title);
  for (const it of x.items) if (it.provenance === 'SOURCE_VERIFIED') pushEv(`item:${it.category ?? 'hardware'}`, it.evidence);
  if (x.deadline.provenance === 'SOURCE_VERIFIED') pushEv('deadline', x.deadline.evidence);
  if (x.budget.provenance === 'SOURCE_VERIFIED') pushEv('budget', x.budget.evidence);
  if (x.organization.provenance === 'SOURCE_VERIFIED') pushEv('organization', x.organization.evidence);

  // ---------- matching & dedupe
  // irrelevant documents (news, ads, jobs) are never matched to the catalog
  const relevant = c.hardwareRelevant && !['NEWS_ARTICLE', 'JOB_POSTING', 'ADVERTISEMENT'].includes(c.documentKind);
  const match = relevant ? matchOpportunity(x.items, opts.catalog) : { matches: [], score: 0, level: 'NONE' as const };
  const draftForDedupe = {
    id: opts.existing?.id,
    title: doc.title,
    description: doc.text.slice(0, 2000),
    organizationName: x.organization.value,
    deadline: x.deadline.value,
    categories: x.categories,
    quantity: x.totalQuantity.value,
    sourceKey: doc.sourceKey,
    sourceId: doc.sourceId,
    sourceUrl: doc.sourceUrl,
    state: x.state.value,
  };
  const duplicateCandidates = opts.pool ? findDuplicateCandidates(draftForDedupe, opts.pool) : [];

  // ---------- scoring
  const intent = scoreIntent({
    doc,
    classification: c,
    extraction: x,
    isDuplicate: duplicateCandidates.some((d) => d.score >= 0.75 && isOlder(d.opportunityId, opts.pool)),
    now,
    settings: opts.settings,
  });

  // ---------- value estimate (clearly labelled; a stated budget always wins)
  let estimatedOpportunityValue: number | null = null;
  let estimatedValueBasis: string | null = null;
  if (x.budget.value) {
    estimatedOpportunityValue = x.budget.value;
    estimatedValueBasis = 'Budget stated in source';
  } else {
    let sum = 0;
    const parts: string[] = [];
    for (const it of x.items) {
      if (!it.quantity) continue;
      const m = match.matches.find((mm) => mm.requestedItem === it.description && mm.price) ?? match.matches.find((mm) => mm.category === it.category && mm.price);
      if (m?.price) {
        sum += m.price * it.quantity;
        parts.push(`${it.quantity} × ${m.manufacturer} ${m.model}`);
      }
    }
    if (sum > 0) {
      estimatedOpportunityValue = Math.round(sum);
      estimatedValueBasis = `ESTIMATE: quantity × ETechMatter catalog price (${parts.join(', ')})`;
    }
  }

  const primary = x.contacts.find((k) => k.name) ?? x.contacts[0] ?? null;
  const overall =
    intent.level === 'IRRELEVANT'
      ? intent.score
      : Math.round(intent.score * 0.55 + intent.urgencyScore * 0.15 + match.score * 0.3);

  const fieldProvenance: Record<string, Provenance> = {
    organizationName: x.organization.provenance,
    organizationType: x.organizationType.provenance,
    city: x.city.provenance,
    state: x.state.provenance,
    quantity: x.totalQuantity.provenance,
    budget: x.budget.provenance,
    deadline: x.deadline.provenance,
    procurementType: x.procurementType.provenance,
    buyer: primary?.provenance ?? 'UNKNOWN',
    summary: 'AI_INFERENCE',
    estimatedOpportunityValue: x.budget.value ? 'SOURCE_VERIFIED' : estimatedOpportunityValue ? 'AI_INFERENCE' : 'UNKNOWN',
  };

  const why = whyItMatters(ai, intent.urgencyScore, match.level, match.score, now);
  const next = nextBestAction(ai, intent.level, now);

  const base: Opportunity = {
    id: opts.existing?.id ?? newId('opp'),
    title: doc.title,
    description: doc.text,
    sourceKey: doc.sourceKey,
    source: doc.sourceName,
    sourceUrl: doc.sourceUrl,
    sourceId: doc.sourceId,
    sourceType: doc.sourceType,
    sourceConfidence: doc.sourceConfidence,
    isDemo: doc.isDemo,
    publishedAt: doc.publishedAt,
    updatedAt: doc.updatedAt,
    discoveredAt: opts.existing?.discoveredAt ?? doc.retrievedAt,
    lastCheckedAt: doc.retrievedAt,
    deadline: x.deadline.value,
    createdAt: opts.existing?.createdAt ?? now,
    recordUpdatedAt: now,

    organizationId: null,
    organizationName: x.organization.value,
    organizationWebsite: doc.structured?.organizationWebsite ?? null,
    organizationType: x.organizationType.value ?? 'Unknown',
    industry: industryFor(x.organizationType.value),
    employeeCount: null,
    city: x.city.value,
    state: x.state.value,
    zipCode: x.zip.value,
    country: x.country.value ?? (c.isUS ? 'US' : null),

    buyerName: primary?.name ?? null,
    buyerTitle: primary?.title ?? null,
    buyerEmail: primary?.email ?? null,
    buyerPhone: primary?.phone ?? null,
    buyerLinkedin: primary?.linkedin ?? null,
    contacts: x.contacts,

    requirementSummary: requirementLine(ai),
    hardwareCategory: x.categories[0] ?? null,
    categories: x.categories,
    items: x.items,
    productsRequested: x.items.map((i) => i.description),
    brandsRequested: uniq(x.items.map((i) => i.brand).filter((b): b is string => !!b)),
    modelsRequested: uniq(x.items.map((i) => i.model).filter((b): b is string => !!b)),
    partNumbers: uniq(x.items.map((i) => i.partNumber).filter((b): b is string => !!b)),
    quantity: x.totalQuantity.value,
    budget: x.budget.value,
    currency: 'USD',
    procurementType: x.procurementType.value ?? 'UNKNOWN',
    documentKind: c.documentKind,
    requirementDetails: {
      specifications: x.specifications,
      deliveryLocation: x.deliveryLocation,
      warranty: x.warranty,
      installation: x.installation,
      support: x.support,
      vendorRequirements: x.vendorRequirements,
      certifications: x.certifications,
    },
    fieldProvenance,

    intentLevel: intent.level,
    intentScore: intent.score,
    urgencyScore: intent.urgencyScore,
    urgencyLabel: intent.urgencyLabel,
    matchScore: match.score,
    matchLevel: match.level,
    overallOpportunityScore: overall,
    estimatedOpportunityValue,
    estimatedValueBasis,
    scoreReasons: intent.reasons,
    productMatches: match.matches,

    evidence,
    aiSummary: ai.summary,
    aiReasoning: [...ai.reasoning, ...ai.groundingCorrections.map((g) => `Grounding check: ${g}`)],
    aiProvider: ai.model ? `${ai.provider} (${ai.model})` : ai.provider,
    whyItMatters: why,
    nextAction: next,

    duplicateCandidates,
    mergedIntoId: opts.existing?.mergedIntoId ?? null,
    mergedSources: opts.existing?.mergedSources ?? [],

    status: opts.existing?.status ?? 'NEW',
    owner: opts.existing?.owner ?? null,
    saved: opts.existing?.saved ?? false,
    notes: opts.existing?.notes ?? [],
    activities: opts.existing?.activities ?? [
      { id: newId('act'), type: 'CREATED', actor: 'Ingestion pipeline', detail: `Discovered via ${doc.sourceName}`, createdAt: doc.retrievedAt },
    ],
    lastContactedAt: opts.existing?.lastContactedAt ?? null,
    nextFollowUp: opts.existing?.nextFollowUp ?? null,
    quoteValue: opts.existing?.quoteValue ?? null,
    expectedCloseDate: opts.existing?.expectedCloseDate ?? null,
  };
    if (
    doc.sourceType === 'PUBLIC_WEB' &&
    c.documentKind === 'OTHER' &&
    c.signals.includes(
      'General procurement listing page, not an individual solicitation'
    )
  ) {
    base.documentKind = 'OTHER';
    base.procurementType = 'UNKNOWN';

    base.intentLevel = 'IRRELEVANT';
    base.intentScore = 0;
    base.urgencyScore = 0;
    base.matchLevel = 'NONE';
    base.matchScore = 0;
    base.overallOpportunityScore = 0;

    base.deadline = null;
    base.buyerName = null;
    base.buyerTitle = null;
    base.buyerEmail = null;
    base.buyerPhone = null;
    base.buyerLinkedin = null;
    base.contacts = [];

    base.requirementSummary =
      'General procurement schedule, not an individual solicitation.';
    base.hardwareCategory = null;
    base.categories = [];
    base.items = [];
    base.productsRequested = [];
    base.brandsRequested = [];
    base.modelsRequested = [];
    base.partNumbers = [];
    base.quantity = null;
    base.budget = null;
    base.estimatedOpportunityValue = null;
    base.estimatedValueBasis = null;
    base.productMatches = [];
    base.scoreReasons = [];
    base.requirementDetails = {
  specifications: { value: null, provenance: 'UNKNOWN' },
  deliveryLocation: { value: null, provenance: 'UNKNOWN' },
  warranty: { value: null, provenance: 'UNKNOWN' },
  installation: { value: null, provenance: 'UNKNOWN' },
  support: { value: null, provenance: 'UNKNOWN' },
  vendorRequirements: { value: null, provenance: 'UNKNOWN' },
  certifications: { value: null, provenance: 'UNKNOWN' },
};

    base.aiSummary =
      'General procurement listing. Individual solicitation notices must be reviewed separately.';
    base.aiReasoning = [
      ...base.aiReasoning,
      'Safety check: this is a general procurement listing, not an individual solicitation.',
    ];
    base.whyItMatters = [
      'This page is a procurement discovery source, not an actionable solicitation.',
    ];
    base.nextAction =
      'Review the procurement schedule and verify a specific solicitation before qualifying a lead.';
  }

  return base;
}

function isOlder(id: string, pool?: Opportunity[]) {
  return !!pool?.some((p) => p.id === id);
}

function industryFor(t: string | null): string | null {
  switch (t) {
    case 'K-12 Education':
    case 'Higher Education':
      return 'Education';
    case 'Healthcare':
      return 'Healthcare';
    case 'Federal Government':
    case 'State Government':
    case 'County Government':
    case 'City Government':
    case 'Public Agency':
      return 'Government';
    default:
      return null;
  }
}

function requirementLine(ai: AIAnalysisResult): string {
  const x = ai.extraction;
  if (!x.items.length) return 'No hardware requirement identified';
  const kind = ai.classification.documentKind;
  const verb = kind === 'PLANNED_PURCHASE' ? 'Planning' : kind === 'AWARD_NOTICE' ? 'Awarded' : 'Seeking';
  return `${verb} ${describeItems(x, 3)}`;
}

export function whyItMatters(ai: AIAnalysisResult, urgency: number, matchLevel: string, matchScore: number, now: string): string[] {
  const x = ai.extraction;
  const c = ai.classification;
  const out: string[] = [];
  if (c.documentKind === 'PROCUREMENT_NOTICE') out.push('Active procurement requirement');
  if (c.documentKind === 'PLANNED_PURCHASE') out.push('Early signal — get in before the formal solicitation');
  if (c.documentKind === 'AWARD_NOTICE') out.push('Historical buyer of this hardware — useful for future targeting');
  if (x.totalQuantity.value) out.push(`${x.totalQuantity.value.toLocaleString('en-US')} units requested`);
  if (matchLevel === 'EXACT') out.push('Exact product match in the ETechMatter catalog');
  else if (matchLevel === 'HIGH') out.push(`Hardware category matches ETechMatter (${matchScore}% match)`);
  else if (matchLevel === 'ALTERNATIVE') out.push('ETechMatter can offer an alternative product');
  if (x.deadline.value) {
    const d = Math.ceil(daysBetween(now, x.deadline.value));
    if (d >= 0 && d <= 7) out.push(`Deadline within ${Math.max(d, 1)} day${d === 1 ? '' : 's'}`);
    else if (d > 7) out.push(`Deadline in ${d} days — time to prepare a strong quote`);
  }
  if (c.isUS) out.push('U.S. buyer');
  if (x.contacts.some((k) => k.email || k.phone)) out.push('Contact information published');
  if (x.budget.value) out.push(`Budget disclosed ($${x.budget.value.toLocaleString('en-US')})`);
  void urgency;
  return out;
}

export function nextBestAction(ai: AIAnalysisResult, level: string, now: string): string {
  const x = ai.extraction;
  const c = ai.classification;
  const hasContact = x.contacts.some((k) => k.email || k.phone);
  const d = x.deadline.value ? Math.ceil(daysBetween(now, x.deadline.value)) : null;
  if (level === 'IRRELEVANT') return 'No action — not a buying signal. Kept for audit only.';
  if (d !== null && d < 0) return 'Deadline has passed. Check the source for amendments or a re-bid; otherwise archive.';
  if (c.documentKind === 'AWARD_NOTICE') return 'Add the buyer to a nurture list and watch for the next refresh cycle or re-compete.';
  if (c.documentKind === 'PLANNED_PURCHASE')
    return 'Introduce ETechMatter to the IT/procurement team now and offer a no-cost configuration and budget quote ahead of the solicitation.';
  const pt = x.procurementType.value;
  if (pt === 'SOURCES_SOUGHT' || pt === 'PRESOLICITATION') {
  if (d === null) {
    return 'Review the original notice, confirm whether a response is requested, and check for a response deadline before submitting a capability statement.';
  }

  return 'Review the notice requirements and submit a capability statement before the stated response deadline, if requested.';
}
  const urgency = d !== null && d <= 3 ? ' Priority: due in ≤3 days.' : '';
  if (hasContact) return `Contact the procurement contact, confirm specifications and submit a quotation before the deadline.${urgency}`;
  return `Organization identified — contact not publicly available. Download the solicitation from the original source and submit through the portal.${urgency}`;
}

/** Re-run product matching for a stored opportunity (e.g. after a catalog import). */
export function rematchOpportunity(o: Opportunity, catalog: Product[]): Partial<Opportunity> {
  const relevant = o.intentLevel !== 'IRRELEVANT';
  const match = relevant ? matchOpportunity(o.items, catalog) : { matches: [], score: 0, level: 'NONE' as const };
  let estimatedOpportunityValue = o.budget ?? null;
  let estimatedValueBasis = o.budget ? 'Budget stated in source' : null;
  if (!o.budget) {
    let sum = 0;
    const parts: string[] = [];
    for (const it of o.items) {
      if (!it.quantity) continue;
      const m = match.matches.find((mm) => mm.requestedItem === it.description && mm.price) ?? match.matches.find((mm) => mm.category === it.category && mm.price);
      if (m?.price) {
        sum += m.price * it.quantity;
        parts.push(`${it.quantity} × ${m.manufacturer} ${m.model}`);
      }
    }
    if (sum > 0) {
      estimatedOpportunityValue = Math.round(sum);
      estimatedValueBasis = `ESTIMATE: quantity × ETechMatter catalog price (${parts.join(', ')})`;
    }
  }
  return {
    productMatches: match.matches,
    matchScore: match.score,
    matchLevel: match.level,
    overallOpportunityScore: relevant ? Math.round(o.intentScore * 0.55 + o.urgencyScore * 0.15 + match.score * 0.3) : o.intentScore,
    estimatedOpportunityValue,
    estimatedValueBasis,
  };
}
