import { PROCUREMENT_LABELS } from '../constants';
import { classifyDocument } from '../engine/classify';
import { extractRequirements } from '../engine/extract';
import type { Classification, Extraction, RawDocument } from '../types';
import type { AIAnalysisResult, AIProvider } from './types';

/**
 * Built-in deterministic provider. Always available, needs no API key, and is
 * the fallback whenever an LLM call fails or returns schema-invalid JSON.
 */
export class HeuristicProvider implements AIProvider {
  readonly name = 'heuristic-rules';
  readonly model = null;
  isConfigured() {
    return true;
  }
  async analyze(doc: RawDocument): Promise<AIAnalysisResult> {
    return analyzeHeuristically(doc);
  }
}

export function analyzeHeuristically(doc: RawDocument): AIAnalysisResult {
  const classification = classifyDocument(doc);
  const extraction = extractRequirements(doc);
  return {
    classification,
    extraction,
    summary: buildSummary(classification, extraction),
    reasoning: classification.signals,
    provider: 'heuristic-rules',
    model: null,
    groundingCorrections: [],
  };
}

export function describeItems(x: Extraction, max = 4): string {
  const parts = x.items.slice(0, max).map((i) => {
    if (i.description && i.description.length <= 70 && (!i.quantity || i.description.includes(i.quantity.toLocaleString('en-US')) || i.description.includes(String(i.quantity))))
      return i.quantity && !/\d/.test(i.description.slice(0, 6)) ? `${i.quantity.toLocaleString('en-US')} × ${i.description}` : i.description;
    const q = i.quantity ? `${i.quantity.toLocaleString('en-US')} ` : '';
    const what = i.model ? `${i.brand ?? ''} ${i.model} ${i.category ? `(${i.category.toLowerCase()})` : ''}` : i.brand ? `${i.brand} ${lcCat(i.category)}` : lcCat(i.category);
    return `${q}${what}`.replace(/\s+/g, ' ').trim();
  });
  if (x.items.length > max) parts.push(`${x.items.length - max} more item(s)`);
  if (parts.length <= 1) return parts[0] ?? 'IT hardware';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function lcCat(c: string | null) {
  if (!c) return 'IT hardware';
  if (c === 'UPS') return 'UPS units';
  if (c === 'Desktop PCs') return 'desktop PCs';
  if (c === 'GPUs' || c === 'CPUs' || c === 'SSD' || c === 'HDD' || c === 'RAM') return c;
  return c.toLowerCase();
}

export function buildSummary(c: Classification, x: Extraction): string {
  const org = x.organization.value ?? 'An unidentified organization';
  const items = describeItems(x);
  const pt = x.procurementType.value;
  const dl = x.deadline.value ? ` Responses are due ${new Date(x.deadline.value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}.` : '';
  switch (c.documentKind) {
    case 'PROCUREMENT_NOTICE': {
      const verb =
        pt === 'RFQ' ? 'is requesting vendor quotations for' :
        pt === 'RFP' ? 'is soliciting proposals for' :
        pt === 'ITB' ? 'is inviting bids for' :
        pt === 'SOURCES_SOUGHT' ? 'is conducting market research (sources sought) for' :
        pt === 'PRESOLICITATION' ? 'has announced an upcoming solicitation for' :
        pt === 'DIRECT_REQUEST' ? 'has publicly stated a need for' :
        'is actively procuring';
      return `${org} ${verb} ${items}.${dl}`;
    }
    case 'PLANNED_PURCHASE':
      return `${org} has indicated a planned purchase of ${items}; no active solicitation was found in the source.`;
    case 'AWARD_NOTICE':
      return `${org} awarded a contract covering ${items}. This is historical purchasing intelligence, not an open request.`;
    case 'NEWS_ARTICLE':
      return 'News/editorial content mentioning IT hardware — no buying requirement found.';
    case 'JOB_POSTING':
      return 'Job posting — no procurement requirement found.';
    case 'ADVERTISEMENT':
      return 'Product advertisement — not a buyer requirement.';
    default:
      return pt && pt !== 'UNKNOWN'
        ? `${org}: ${PROCUREMENT_LABELS[pt]} referencing ${items}.`
        : `${org} — document references ${items}; buying intent unclear.`;
  }
}
