// Product matching: buyer requirement ↔ ETechMatter catalog.
//
//  EXACT        part number match, or same manufacturer + same model
//  HIGH         same manufacturer + category + product line (buyer gave no model,
//               or a sibling configuration of the same model), or a brand-agnostic
//               requirement we can fill from the category
//  ALTERNATIVE  same category but a different model/series/brand (e.g. buyer asks
//               for Catalyst 9300, we carry Catalyst 9200)
//  NONE         nothing in the catalog serves this line item

import { CATEGORY_GROUPS } from '../constants';
import { lc } from '../text';
import type { MatchLevel, Product, ProductMatch, RequestedItem } from '../types';

const norm = (s: string | null | undefined) => lc(s).replace(/[^a-z0-9]/g, '');
const brandNorm = (s: string | null | undefined) => {
  const n = norm(s);
  if (n === 'hewlettpackardenterprise') return 'hpe';
  if (n === 'ciscomeraki' || n === 'meraki') return 'cisco';
  if (n === 'fortigate') return 'fortinet';
  if (n === 'paloalto') return 'paloaltonetworks';
  return n;
};

function modelTokens(model: string | null | undefined): string[] {
  return lc(model)
    .split(/[\s\-/]+/)
    .filter(Boolean);
}

/** first alphabetic token = product line ("poweredge"), first numeric-bearing token = model number ("r760") */
function lineAndNumber(model: string | null | undefined) {
  const toks = modelTokens(model);
  const line = toks.find((t) => /^[a-z+]+$/.test(t) && t.length > 1) ?? null;
  const num = toks.find((t) => /\d/.test(t)) ?? null;
  return { line, num };
}

function sameFamilyNumber(a: string, b: string): boolean {
  // R760 vs R750, 9300 vs 9200, 5550 vs 5540: same letter prefix + same length digits
  const pa = a.match(/^([a-z]*)(\d+)/);
  const pb = b.match(/^([a-z]*)(\d+)/);
  if (!pa || !pb) return false;
  return pa[1] === pb[1] && pa[2].length === pb[2].length;
}

function categoriesCompatible(a: string | null, b: string): boolean {
  if (!a) return false;
  if (a === b) return true;
  for (const members of Object.values(CATEGORY_GROUPS)) {
    if (members.includes(a) && members.includes(b) && (a === 'Networking' || b === 'Networking' || a === 'Storage' || b === 'Storage')) return true;
  }
  return false;
}

export function matchItem(item: RequestedItem, catalog: Product[]): ProductMatch[] {
  const results: ProductMatch[] = [];
  const reqModel = norm(item.model);
  const reqPart = norm(item.partNumber);
  const reqBrand = brandNorm(item.brand);
  const req = lineAndNumber(item.model);

  for (const p of catalog) {
    const pBrand = brandNorm(p.manufacturer);
    const pModel = norm(p.model);
    const pPart = norm(p.partNumber);
    const pl = lineAndNumber(p.model);
    let level: MatchLevel = 'NONE';
    let score = 0;
    let reason = '';

    if (reqPart && pPart && (reqPart === pPart || pModel.includes(reqPart) || reqPart.includes(pPart))) {
      level = 'EXACT';
      score = 100;
      reason = `Part number ${item.partNumber} matches catalog`;
    } else if (reqModel && reqBrand === pBrand && (pModel === reqModel || pModel.endsWith(reqModel) || reqModel.endsWith(pModel))) {
      level = 'EXACT';
      score = 98;
      reason = `${p.manufacturer} ${p.model} is the requested model`;
    } else if (reqModel && reqBrand === pBrand && req.num && pl.num && (pl.num.startsWith(req.num) || req.num.startsWith(pl.num))) {
      level = 'HIGH';
      score = 90;
      reason = `Same model (${p.model}), different configuration`;
    } else if (!categoriesCompatible(item.category, p.category)) {
      continue;
    } else if (reqModel && reqBrand === pBrand && req.line && pl.line === req.line && req.num && pl.num && sameFamilyNumber(req.num, pl.num)) {
      level = 'ALTERNATIVE';
      score = 76;
      reason = `Same ${p.manufacturer} ${capital(req.line)} family — alternative to requested ${item.model}`;
    } else if (reqModel && reqBrand === pBrand) {
      level = 'ALTERNATIVE';
      score = 68;
      reason = `Same manufacturer, different model than requested ${item.model}`;
    } else if (!reqModel && reqBrand && reqBrand === pBrand) {
      level = 'HIGH';
      score = 88;
      reason = `${p.manufacturer} ${p.category.toLowerCase()} requested without a specific model`;
    } else if (!reqBrand) {
      level = 'HIGH';
      score = item.category === p.category ? 84 : 72;
      reason = `Brand-agnostic ${lc(item.category)} requirement — catalog item fits the category`;
      if (item.category !== p.category) level = 'ALTERNATIVE';
    } else {
      level = 'ALTERNATIVE';
      score = 60;
      reason = `Buyer named ${item.brand}; ${p.manufacturer} is an alternative brand in the same category`;
    }

    // mild availability/spec bonus
    if (level !== 'EXACT' && p.availability && /in stock/i.test(p.availability)) score += 2;
    results.push({
      productId: p.id,
      sku: p.sku,
      manufacturer: p.manufacturer,
      model: p.model,
      partNumber: p.partNumber,
      category: p.category,
      price: p.price,
      level,
      score: Math.min(100, score),
      requestedItem: item.description,
      reason,
    });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface MatchSummary {
  matches: ProductMatch[];
  score: number; // 0–100
  level: MatchLevel;
}

/**
 * Opportunity-level match: average of each requested line item's best match
 * (a line item with no match counts as 0), so "3 of 4 items covered" is visible.
 */
export function matchOpportunity(items: RequestedItem[], catalog: Product[]): MatchSummary {
  if (!items.length || !catalog.length) return { matches: [], score: 0, level: 'NONE' };
  const all: ProductMatch[] = [];
  const bests: number[] = [];
  let bestLevel: MatchLevel = 'NONE';
  const rank: Record<MatchLevel, number> = { EXACT: 3, HIGH: 2, ALTERNATIVE: 1, NONE: 0 };
  for (const item of items) {
    const ms = matchItem(item, catalog);
    bests.push(ms[0]?.score ?? 0);
    if (ms[0] && rank[ms[0].level] > rank[bestLevel]) bestLevel = ms[0].level;
    all.push(...ms.slice(0, 2));
  }
  const score = Math.round(bests.reduce((s, n) => s + n, 0) / bests.length);
  // dedupe products, keep best score per product
  const byProduct = new Map<string, ProductMatch>();
  for (const m of all) {
    const e = byProduct.get(m.productId);
    if (!e || e.score < m.score) byProduct.set(m.productId, m);
  }
  return {
    matches: [...byProduct.values()].sort((a, b) => b.score - a.score).slice(0, 6),
    score,
    level: bestLevel,
  };
}
