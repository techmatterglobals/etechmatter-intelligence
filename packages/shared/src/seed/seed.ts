import { HeuristicProvider } from '../ai/heuristicProvider';
import type { AIProvider } from '../ai/types';
import { runSync } from '../pipeline/sync';
import type { Repository } from '../store/repository';
import { newId } from '../text';
import type { AlertRule, HistoricalRecord } from '../types';
import { DEMO_CATALOG } from './catalog';
import { DemoFeedConnector } from './demoConnector';

export const DEMO_USERS = [
  { name: 'Muhammad Ali', email: 'admin@etechmatter.example', role: 'ADMIN' as const },
  { name: 'Sarah Chen', email: 'sarah@etechmatter.example', role: 'SALES' as const },
  { name: 'James Porter', email: 'james@etechmatter.example', role: 'SALES' as const },
];

export function demoAlertRules(now: string): AlertRule[] {
  return [
    {
      id: newId('alr'), name: 'Hot server deals — TX, CA, FL', categories: ['Servers'], states: ['TX', 'CA', 'FL'], intentLevels: ['HOT'],
      minQuantity: 10, minMatchScore: null, keywords: [], channels: ['IN_APP', 'BROWSER'], email: null, webhookUrl: null, active: true,
      createdAt: now, lastTriggeredAt: null, triggerCount: 0,
    },
    {
      id: newId('alr'), name: 'Any hot laptop RFQ ≥ 100 units', categories: ['Laptops'], states: [], intentLevels: ['HOT'],
      minQuantity: 100, minMatchScore: null, keywords: [], channels: ['IN_APP', 'EMAIL'], email: 'sales@etechmatter.example', webhookUrl: null, active: true,
      createdAt: now, lastTriggeredAt: null, triggerCount: 0,
    },
    {
      id: newId('alr'), name: 'Networking — exact/high catalog match', categories: ['Networking'], states: [], intentLevels: ['HOT', 'WARM'],
      minQuantity: null, minMatchScore: 80, keywords: [], channels: ['IN_APP'], email: null, webhookUrl: null, active: true,
      createdAt: now, lastTriggeredAt: null, triggerCount: 0,
    },
  ];
}

/** DEMO historical spending records (the USAspending connector replaces these with real awards). */
export function demoHistorical(now: Date): HistoricalRecord[] {
  const rows: [string, string, number, string, string, number][] = [
    ['Interagency Demo Logistics Center', 'Region 6', 212400, 'Rack servers (20 units)', 'TX', 14],
    ['Interagency Demo Logistics Center', 'Southeast Field Office', 96800, 'Network switches and optics', 'GA', 45],
    ['Federal Example Agency', 'Data Services Division', 684000, 'Enterprise laptops and docks', 'MO', 80],
    ['Federal Example Agency', 'Mountain Region', 143250, 'Monitors and docking stations', 'CO', 120],
    ['Federal Example Agency', 'Data Services Division', 1250000, 'Storage arrays and SAN fabric', 'MO', 200],
    ['Interagency Demo Logistics Center', 'Region 6', 74200, 'UPS units for network closets', 'TX', 240],
    ['Demo Research Administration', 'Pacific Lab', 388500, 'GPU compute nodes', 'WA', 150],
    ['Demo Research Administration', 'Pacific Lab', 51200, 'Workstations', 'WA', 300],
  ];
  return rows.map(([agency, sub, amount, desc, state, daysAgo], i) => ({
    id: newId('hist'),
    sourceKey: 'demo_feed',
    awardId: `DEMO-AWD-${1000 + i}`,
    recipientName: 'Sample Reseller (demo)',
    awardingAgency: agency,
    awardingSubAgency: sub,
    amount,
    description: desc,
    naicsCode: '423430',
    state,
    actionDate: new Date(now.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10),
    sourceUrl: null,
    retrievedAt: now.toISOString(),
    isDemo: true,
  }));
}

export interface SeedOptions {
  ai?: AIProvider;
  now?: Date;
  withDemoOpportunities?: boolean;
  log?: (m: string) => void;
}

/** Idempotent: seeds only an empty repository. */
export async function seedDemo(repo: Repository, opts: SeedOptions = {}) {
  const now = opts.now ?? new Date();
  if ((await repo.countOpportunities()) > 0 || (await repo.listProducts()).length > 0) return { seeded: false };
  for (const p of DEMO_CATALOG) await repo.createProduct(p);
  for (const u of DEMO_USERS) await repo.createUser(u);
  for (const r of demoAlertRules(now.toISOString())) await repo.saveAlertRule(r);
  await repo.upsertHistorical(demoHistorical(now));
  await repo.upsertSourceConfig('demo_feed', { enabled: true, intervalMinutes: 0, config: { released: [] } });
  if (opts.withDemoOpportunities === false) return { seeded: true, opportunities: 0 };
  const demo = new DemoFeedConnector();
  demo.mode = 'initial';
  const res = await runSync({ repo, connectors: [demo], ai: opts.ai ?? new HeuristicProvider(), trigger: 'SEED', now: () => now, log: opts.log });
  // seeding must not consume feed notices or count as the "last sync"
  await repo.upsertSourceConfig('demo_feed', { config: { released: [] }, lastSuccessAt: null, lastRunAt: null });
  // seeded alert events would be noise: clear trigger counts
  return { seeded: true, opportunities: res.newCount + res.irrelevantCount };
}
