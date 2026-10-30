import { analyzeHeuristically } from '../../packages/shared/src/ai/heuristicProvider';
import { buildOpportunity } from '../../packages/shared/src/engine/analyze';
import { classifyDocument } from '../../packages/shared/src/engine/classify';
import type { RawDocument } from '../../packages/shared/src/types';

const now = new Date().toISOString();

const doc = {
  sourceKey: 'public_web',
  sourceName: 'Public Web Discovery',
  sourceId: 'vgy7hc',
  sourceType: 'PUBLIC_WEB',
  sourceUrl:
    'https://dir.texas.gov/it-solutions-and-services/selling-through-dir/schedule-of-solicitation-opportunities',
  sourceConfidence: 'MEDIUM',
  isDemo: false,
  title:
    'Schedule of Solicitation Opportunities | Texas Department of Information Resources',
  text:
    'Texas DIR schedule of solicitation opportunities. Seeking desktops and laptops. Presolicitation. Contact Samantha O Connor.',
  publishedAt: null,
  updatedAt: null,
  retrievedAt: now,
} as RawDocument;

const ai = analyzeHeuristically(doc);

// Mirror the safety override in sync.ts.
ai.classification = classifyDocument(doc);

const opportunity = buildOpportunity(doc, ai, {
  catalog: [],
  now,
});

const result = {
  documentKind: opportunity.documentKind,
  procurementType: opportunity.procurementType,
  intentLevel: opportunity.intentLevel,
  intentScore: opportunity.intentScore,
  matchLevel: opportunity.matchLevel,
  matchScore: opportunity.matchScore,
  overallOpportunityScore: opportunity.overallOpportunityScore,
  buyerName: opportunity.buyerName,
  contacts: opportunity.contacts.length,
  productMatches: opportunity.productMatches.length,
  nextAction: opportunity.nextAction,
};

console.log(JSON.stringify(result, null, 2));

const passed =
  result.documentKind === 'OTHER' &&
  result.procurementType === 'UNKNOWN' &&
  result.intentLevel === 'IRRELEVANT' &&
  result.intentScore === 0 &&
  result.matchLevel === 'NONE' &&
  result.matchScore === 0 &&
  result.overallOpportunityScore === 0 &&
  result.buyerName === null &&
  result.contacts === 0 &&
  result.productMatches === 0 &&
  result.nextAction.includes('verify a specific solicitation');

if (!passed) {
  throw new Error('DIR full-analysis safeguard FAILED');
}

console.log('PASS: Texas DIR listing is non-actionable.');