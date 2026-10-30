// Natural-language search → structured filters.
// "Find hospitals in Texas looking for servers" → { orgTypes:[Healthcare], states:[TX], categories:[Servers] }
// Deterministic so it runs instantly in the browser and server; an LLM can be
// layered on top later through the same ParsedSearch contract.

import { STATES } from '../constants';
import type { IntentLevel, MatchLevel, OpportunityQuery, OrganizationType, ParsedSearch, ProcurementType } from '../types';

const CATEGORY_SYNONYMS: [RegExp, string[], string][] = [
  [/\b(laptops?|notebooks?|chromebooks?)\b/, ['Laptops'], 'Laptops'],
  [/\b(desktops?|pcs|computers)\b/, ['Desktop PCs', 'Laptops', 'Workstations'], 'Computers'],
  [/\bworkstations?\b/, ['Workstations'], 'Workstations'],
  [/\bservers?\b/, ['Servers'], 'Servers'],
  [/\b(storage|san|nas)\b/, ['Storage', 'SSD', 'HDD'], 'Storage'],
  [/\b(network(?:ing)?|network equipment)\b/, ['Networking', 'Switches', 'Routers', 'Firewalls', 'Wireless Access Points'], 'Networking'],
  [/\bswitch(?:es)?\b/, ['Switches'], 'Switches'],
  [/\brouters?\b/, ['Routers'], 'Routers'],
  [/\bfirewalls?\b/, ['Firewalls'], 'Firewalls'],
  [/\b(wireless|access points?|wifi|wi-fi)\b/, ['Wireless Access Points'], 'Wireless Access Points'],
  [/\b(monitors?|displays?)\b/, ['Monitors'], 'Monitors'],
  [/\bdocks?|docking\b/, ['Docking Stations'], 'Docking Stations'],
  [/\bprinters?\b/, ['Printers'], 'Printers'],
  [/\bscanners?\b/, ['Scanners'], 'Scanners'],
  [/\b(ups|battery backup|power)\b/, ['UPS', 'Power Equipment'], 'UPS/Power'],
  [/\bracks?\b/, ['Racks'], 'Racks'],
  [/\b(gpus?|graphics)\b/, ['GPUs'], 'GPUs'],
  [/\b(ssds?)\b/, ['SSD'], 'SSD'],
  [/\b(cameras?|security hardware)\b/, ['Security Hardware'], 'Security Hardware'],
  [/\b(phones?|telecom|voip)\b/, ['Telecom Equipment'], 'Telecom'],
];

const ORG_SYNONYMS: [RegExp, OrganizationType[], string][] = [
  [/\b(hospitals?|health(?:care)?|medical|clinics?)\b/, ['Healthcare'], 'Healthcare organizations'],
  [/\b(schools?|school districts?|isds?|k-?12|districts?)\b/, ['K-12 Education'], 'K-12 schools'],
  [/\b(universit(?:y|ies)|colleges?|higher ed(?:ucation)?)\b/, ['Higher Education'], 'Universities/colleges'],
  [/\b(counties|county)\b/, ['County Government'], 'County government'],
  [/\b(cities|city|municipal(?:ities)?)\b/, ['City Government'], 'City government'],
  [/\b(federal|agencies)\b/, ['Federal Government'], 'Federal government'],
  [/\b(education|educational)\b/, ['K-12 Education', 'Higher Education'], 'Education'],
];

export function parseSearch(input: string, now = new Date()): ParsedSearch {
  const raw = input.trim();
  let t = ` ${raw.toLowerCase()} `;
  const f: OpportunityQuery = {};
  const interp: string[] = [];
  const consume = (re: RegExp) => {
    t = t.replace(re, ' ');
  };

  // ---- quantity: "more than 100", "over 50", "at least 200", "500+"
  const qm = t.match(/\b(?:more than|over|greater than|at least|min(?:imum)?|>=?)\s*(\d[\d,]*)\b|\b(\d[\d,]*)\s*\+/);
  if (qm) {
    const n = parseInt((qm[1] ?? qm[2]).replace(/,/g, ''), 10);
    f.qtyMin = /at least|min|>=/.test(qm[0]) || qm[2] ? n : n + 1;
    interp.push(`Quantity ≥ ${f.qtyMin}`);
    consume(qm[0].includes('+') ? /\b\d[\d,]*\s*\+/ : /\b(?:more than|over|greater than|at least|min(?:imum)?|>=?)\s*\d[\d,]*\b/);
  }
  const qmax = t.match(/\b(?:less than|under|fewer than|at most|up to)\s*(\d[\d,]*)\b/);
  if (qmax) {
    f.qtyMax = parseInt(qmax[1].replace(/,/g, ''), 10);
    interp.push(`Quantity ≤ ${f.qtyMax}`);
    consume(/\b(?:less than|under|fewer than|at most|up to)\s*\d[\d,]*\b/);
  }

  // ---- intent
  const intents: IntentLevel[] = [];
  if (/\bhot\b/.test(t)) intents.push('HOT');
  if (/\bwarm\b/.test(t)) intents.push('WARM');
  if (/\blow(?:[- ]intent)?\b/.test(t) && !/\blowest\b/.test(t)) intents.push('LOW');
  if (intents.length) {
    f.intent = intents;
    interp.push(`Intent: ${intents.join(', ')}`);
    consume(/\b(hot|warm|low)\b/g);
  }

  // ---- procurement type
  const pts: ProcurementType[] = [];
  if (/\brfqs?\b|\bquotes?\b|\bquotations?\b/.test(t)) pts.push('RFQ');
  if (/\brfps?\b|\bproposals?\b/.test(t)) pts.push('RFP');
  if (/\b(bids?|itbs?|ifbs?)\b/.test(t)) pts.push('ITB');
  if (/\bsources sought\b|\brfis?\b/.test(t)) pts.push('SOURCES_SOUGHT');
  if (pts.length) {
    f.procurementTypes = pts;
    interp.push(`Procurement: ${pts.join(', ')}`);
    consume(/\b(rfqs?|rfps?|quotes?|quotations?|proposals?|bids?|itbs?|ifbs?|sources sought|rfis?)\b/g);
  }

  // ---- time
  if (/\b(closing|due|deadline)s?\b[^.]*\b(this week|next 7 days|within a week|soon)\b|\bclosing (this week|soon)\b/.test(t)) {
    f.deadlineWithin = '7d';
    interp.push('Deadline within 7 days');
    consume(/\b(closing|due|deadlines?)\b|\b(this week|next 7 days|within a week|soon)\b/g);
  } else if (/\b(closing|due)\b[^.]*\btoday\b/.test(t)) {
    f.deadlineWithin = 'today';
    interp.push('Deadline today');
    consume(/\b(closing|due|today)\b/g);
  } else if (/\b(closing|due)\b[^.]*\b(this month|30 days)\b/.test(t)) {
    f.deadlineWithin = '30d';
    interp.push('Deadline within 30 days');
    consume(/\b(closing|due|this month|30 days)\b/g);
  }
  if (/\b(posted|published|new|discovered)?\s*today\b/.test(t)) {
    f.posted = 'today';
    interp.push('Posted today');
    consume(/\b(posted|published|new|discovered)?\s*today\b/);
  } else if (/\byesterday\b/.test(t)) {
    f.posted = 'yesterday';
    interp.push('Posted yesterday');
    consume(/\b(posted|published)?\s*yesterday\b/);
  } else if (/\b(this week|last 7 days|past week)\b/.test(t)) {
    f.posted = '7d';
    interp.push('Posted in the last 7 days');
    consume(/\b(posted|published)?\s*(this week|last 7 days|past week)\b/);
  } else if (/\b(last|past) hour\b/.test(t)) {
    f.discovered = '1h';
    interp.push('Discovered in the last hour');
    consume(/\b(last|past) hour\b/);
  }

  // ---- match
  const matches: MatchLevel[] = [];
  if (/\bexact match(?:es)?\b/.test(t)) matches.push('EXACT');
  if (/\bhigh match(?:es)?\b/.test(t)) matches.push('HIGH');
  if (/\balternatives?\b/.test(t)) matches.push('ALTERNATIVE');
  if (matches.length) {
    f.match = matches;
    interp.push(`Match: ${matches.join(', ')}`);
    consume(/\b(exact|high) match(?:es)?\b|\balternatives?\b/g);
  }

  // ---- states (full names anywhere; 2-letter codes only as uppercase tokens in the original text)
  const states: string[] = [];
  for (const s of [...STATES].sort((a, b) => b.name.length - a.name.length)) {
    const re = new RegExp(`\\b${s.name.toLowerCase()}\\b`);
    if (re.test(t)) {
      states.push(s.code);
      consume(re);
    }
  }
  for (const m of raw.matchAll(/\b([A-Z]{2})\b/g)) {
    if (STATES.some((s) => s.code === m[1]) && !['RFQ', 'RFP', 'IT', 'OR', 'IN', 'ME'].includes(m[1]) && !states.includes(m[1])) {
      states.push(m[1]);
      consume(new RegExp(`\\b${m[1].toLowerCase()}\\b`));
    }
  }
  if (states.length) {
    f.states = states;
    interp.push(`State: ${states.join(', ')}`);
  }

  // ---- organization type
  for (const [re, types, label] of ORG_SYNONYMS) {
    if (re.test(t)) {
      f.orgTypes = [...new Set([...(f.orgTypes ?? []), ...types])];
      interp.push(`Organization: ${label}`);
      consume(new RegExp(re.source, 'g'));
    }
  }

  // ---- categories
  const cats: string[] = [];
  const catLabels: string[] = [];
  for (const [re, list, label] of CATEGORY_SYNONYMS) {
    if (re.test(t)) {
      cats.push(...list);
      catLabels.push(label);
      consume(new RegExp(re.source, 'g'));
    }
  }
  if (cats.length) {
    f.categories = [...new Set(cats)];
    interp.push(`Hardware: ${catLabels.join(', ')}`);
  }

  // ---- source
  if (/\bsam(?:\.gov)?\b|\bfederal procurement\b/.test(t)) {
    f.sourceTypes = ['FEDERAL_PROCUREMENT'];
    interp.push('Source: Federal procurement');
    consume(/\bsam(?:\.gov)?\b/);
  }

  // ---- residual keywords
  const keywords = t
    .replace(/\b(find|show|me|all|list|get|looking|look|for|needing|need|needs|seeking|with|that|who|are|is|in|the|a|an|and|of|to|organizations?|opportunit(?:y|ies)|leads?|buyers?|requests?|requirements?|equipment|hardware|purchas\w*|buy\w*|than|posted|units?|which|from|at|on|some|any|it)\b/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (keywords) {
    f.q = keywords;
    interp.push(`Keywords: “${keywords}”`);
  }
  void now;
  return { filters: f, interpretations: interp, keywords };
}
