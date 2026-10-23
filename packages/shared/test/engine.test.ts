import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyzeHeuristically,
  buildOpportunity,
  DEMO_CATALOG,
  groundOutput,
  matchItem,
  MemoryStore,
  opportunitiesToCsv,
  parseCsv,
  parseSearch,
  runSync,
  scoreIntent,
  seedDemo,
  DemoFeedConnector,
  HeuristicProvider,
  validateOutput,
  type Product,
  type RawDocument,
} from '../src/index';

const doc = (title: string, text: string, extra: Partial<RawDocument> = {}): RawDocument => ({
  sourceKey: 'test',
  sourceName: 'Test',
  sourceType: 'PUBLIC_WEB',
  sourceConfidence: 'LOW',
  sourceId: title,
  sourceUrl: 'https://example.org/x',
  title,
  text,
  publishedAt: new Date().toISOString(),
  updatedAt: null,
  retrievedAt: new Date().toISOString(),
  isDemo: false,
  ...extra,
});
const catalog: Product[] = DEMO_CATALOG.map((p, i) => ({ ...p, id: `p${i}`, createdAt: '' }));
const score = (d: RawDocument) => {
  const a = analyzeHeuristically(d);
  return { a, s: scoreIntent({ doc: d, classification: a.classification, extraction: a.extraction }) };
};

test('spec example: RFQ for 250 Dell laptops is HOT', () => {
  const { s, a } = score(doc('RFQ', 'Riverside School District, Austin, TX is issuing a Request for Quotation for 250 Dell laptops. Quotes due December 1, 2099.'));
  assert.equal(a.classification.documentKind, 'PROCUREMENT_NOTICE');
  assert.equal(s.level, 'HOT');
  assert.ok(s.reasons.some((r) => r.code === 'EXPLICIT_PROCUREMENT'));
  assert.equal(a.extraction.totalQuantity.value, 250);
});

test('spec example: planned refresh next year is WARM (never HOT)', () => {
  const { s, a } = score(doc('Plan', 'Lakeview County plans to refresh 400 laptops next year after the board approved the budget. Lakeview County, Ohio.'));
  assert.equal(a.classification.documentKind, 'PLANNED_PURCHASE');
  assert.equal(s.level, 'WARM');
});

test('spec example: article about Dell laptops is IRRELEVANT', () => {
  const { s } = score(doc('Review', 'In our hands-on review we tested the Dell Latitude 7450. According to analysts, laptop shipments rose.'));
  assert.equal(s.level, 'IRRELEVANT');
});

test('spec example: IT Manager job opening is IRRELEVANT', () => {
  const { s, a } = score(doc('Job', 'Job opening: IT Manager. Responsibilities include managing servers and laptops. Salary $90,000. Apply now.'));
  assert.equal(a.classification.documentKind, 'JOB_POSTING');
  assert.equal(s.level, 'IRRELEVANT');
});

test('spec example: extraction never invents missing values', () => {
  const a = analyzeHeuristically(doc('RFQ', 'XYZ School District is seeking quotations for 350 business-class laptops, docking stations and monitors.'));
  const x = a.extraction;
  assert.equal(x.organization.value, 'XYZ School District');
  assert.equal(x.procurementType.value, 'RFQ');
  const laptops = x.items.find((i) => i.category === 'Laptops');
  assert.equal(laptops?.quantity, 350);
  assert.equal(x.items.find((i) => i.category === 'Docking Stations')?.quantity, null);
  assert.equal(x.items.find((i) => i.category === 'Monitors')?.quantity, null);
  assert.equal(x.budget.value, null);
  assert.equal(x.deadline.value, null);
  assert.equal(x.contacts.length, 0);
});

test('model numbers are not mistaken for quantities', () => {
  const a = analyzeHeuristically(doc('x', 'Seeking quotes for Dell Latitude 5550 laptops and Cisco Catalyst 9300 switches.'));
  assert.ok(a.extraction.items.every((i) => i.quantity === null));
});

test('product matching: exact vs alternative', () => {
  const exact = matchItem({ description: '', category: 'Servers', brand: 'Dell', model: 'PowerEdge R760', partNumber: null, quantity: 5, specs: null, provenance: 'SOURCE_VERIFIED', evidence: null }, catalog);
  assert.equal(exact[0].level, 'EXACT');
  assert.equal(exact[0].model, 'PowerEdge R760');
  const cat = catalog.filter((p) => p.model !== 'Catalyst 9300-48P');
  const alt = matchItem({ description: '', category: 'Switches', brand: 'Cisco', model: 'Catalyst 9300', partNumber: null, quantity: 5, specs: null, provenance: 'SOURCE_VERIFIED', evidence: null }, cat);
  assert.equal(alt[0].level, 'ALTERNATIVE');
  assert.match(alt[0].model, /9200/);
});

test('grounding: LLM-invented quantity, email and deadline are removed', () => {
  const d = doc('RFQ', 'Oak County is requesting quotes for laptops. Contact procurement@oak.example.');
  const v = validateOutput({
    document_kind: 'PROCUREMENT_NOTICE', hardware_relevant: true, is_us: true, procurement_type: 'RFQ',
    organization: { value: 'Oak County', evidence: 'Oak County is requesting quotes for laptops.' },
    items: [{ description: 'laptops', category: 'Laptops', quantity: 500, evidence: 'Oak County is requesting quotes for laptops.' }],
    deadline: { value: '2026-12-01', evidence: 'due December 1' },
    contacts: [{ name: 'John Smith', email: 'john@oak.example' }, { email: 'procurement@oak.example' }],
    summary: 'x', reasoning: [],
  });
  assert.ok(v.ok);
  if (!v.ok) return;
  const r = groundOutput(d, v.value, 'test', null);
  assert.equal(r.extraction.items[0].quantity, null);
  assert.equal(r.extraction.deadline.value, null);
  assert.equal(r.extraction.contacts.length, 1);
  assert.equal(r.extraction.contacts[0].email, 'procurement@oak.example');
  assert.ok(r.groundingCorrections.length >= 3);
});

test('schema validation rejects malformed AI output', () => {
  assert.equal(validateOutput({ document_kind: 'NOPE' }).ok, false);
});

test('natural-language search parsing', () => {
  const a = parseSearch('Find hospitals in Texas looking for servers');
  assert.deepEqual(a.filters.states, ['TX']);
  assert.ok(a.filters.orgTypes?.includes('Healthcare'));
  assert.ok(a.filters.categories?.includes('Servers'));
  assert.ok(!a.filters.q);
  const b = parseSearch('Show hot opportunities with more than 100 laptops');
  assert.deepEqual(b.filters.intent, ['HOT']);
  assert.equal(b.filters.qtyMin, 101);
  const c = parseSearch('Show laptop RFQs posted today');
  assert.deepEqual(c.filters.procurementTypes, ['RFQ']);
  assert.equal(c.filters.posted, 'today');
  const d = parseSearch('Find opportunities closing this week');
  assert.equal(d.filters.deadlineWithin, '7d');
  const e = parseSearch('Find California organizations needing networking equipment');
  assert.deepEqual(e.filters.states, ['CA']);
  assert.ok(e.filters.categories?.includes('Switches'));
});

test('seed + demo feed run through the real pipeline; duplicates flagged not deleted', async () => {
  const repo = new MemoryStore();
  const r = await seedDemo(repo);
  assert.ok(r.seeded);
  const all = await repo.listOpportunities({ pageSize: 100 });
  assert.ok(all.total >= 25, `expected ≥25 relevant, got ${all.total}`);
  const withDup = (await repo.aggregationRows()).filter((o) => o.duplicateCandidates.length);
  assert.ok(withDup.length >= 2);
  for (const o of await repo.aggregationRows()) {
    assert.ok(o.evidence.length > 0, 'every opportunity keeps evidence');
    assert.equal(o.isDemo, true);
  }
  const demo = new DemoFeedConnector();
  const res = await runSync({ repo, connectors: [demo], ai: new HeuristicProvider(), trigger: 'MANUAL' });
  assert.equal(res.status, 'COMPLETE');
  assert.ok(res.newCount >= 1);
  // repeated syncs eventually exhaust the sample pool — nothing is fabricated
  for (let i = 0; i < 5; i++) await runSync({ repo, connectors: [new DemoFeedConnector()], ai: new HeuristicProvider(), trigger: 'MANUAL' });
  const last = await runSync({ repo, connectors: [new DemoFeedConnector()], ai: new HeuristicProvider(), trigger: 'MANUAL' });
  assert.equal(last.newCount, 0);
});

test('opportunity without evidence is impossible; hard duplicate updates in place', async () => {
  const d = doc('RFQ 1', 'Pine County is requesting quotes for 20 Dell PowerEdge R660 servers. Pine County, Ohio.');
  const a = analyzeHeuristically(d);
  const o = buildOpportunity(d, a, { catalog });
  assert.ok(o.evidence.length > 0);
  assert.equal(o.matchLevel, 'EXACT');
  const o2 = buildOpportunity(d, a, { catalog, existing: o });
  assert.equal(o2.id, o.id);
});

test('CSV round trip', () => {
  const rows = parseCsv('sku,manufacturer,model,category\nA,"Dell, Inc",X1,Laptops\n');
  assert.equal(rows[0].manufacturer, 'Dell, Inc');
  const csv = opportunitiesToCsv([]);
  assert.match(csv, /^Company,Website,Contact/);
});
