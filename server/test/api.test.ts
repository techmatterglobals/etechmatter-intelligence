import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';

process.env.DATA_STORE = 'memory';
process.env.SEED_DEMO_DATA = 'true';
process.env.DEMO_FEED_ENABLED = 'true';
process.env.AGGREGATED_PROCUREMENT_ENABLED = 'false';
process.env.SCHEDULER_ENABLED = 'false';
process.env.USASPENDING_ENABLED = 'false';
process.env.SAM_API_KEY = '';

let base = '';
let close: () => void;
before(async () => {
  const { createApp } = await import('../src/index');
  const app = await createApp();
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = () => app.server.close();
});
after(() => close());

const get = async (p: string) => {
  const r = await fetch(base + p);
  assert.equal(r.status, 200, `${p} â†’ ${r.status}`);
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.text();
};
const post = async (p: string, body: unknown, status = 200) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(r.status, status, `${p} â†’ ${r.status}`);
  return r.json();
};

test('dashboard + opportunities + filters + pagination', async () => {
  const d = await get('/api/dashboard');
  assert.ok(d.stats.hotCount > 0);
  assert.equal(d.sources.find((s: any) => s.key === 'sam_gov').statusMessage.includes('not configured'), true);
  const page = await get('/api/opportunities?intent=HOT&pageSize=5&page=2');
  assert.equal(page.page, 2);
  assert.ok(page.items.length <= 5);
  assert.ok(page.items.every((o: any) => o.intentLevel === 'HOT'));
  const tx = await get('/api/opportunities?states=TX&categories=Servers');
  assert.ok(tx.items.every((o: any) => o.state === 'TX'));
});

test('natural-language search', async () => {
  const r = await post('/api/search', { query: 'Find hospitals in Texas looking for servers' });
  assert.ok(r.parsed.interpretations.length >= 3);
  assert.ok(r.results.items.length >= 1);
  assert.ok(r.results.items.every((o: any) => o.state === 'TX' && o.organizationType === 'Healthcare'));
});

test('detail, pipeline actions, notes, merge', async () => {
  const list = await get('/api/opportunities?pageSize=50&sort=discovered');
  const withDup = list.items.find((o: any) => o.hasDuplicates);
  assert.ok(withDup, 'a seeded duplicate exists');
  const o = await get(`/api/opportunities/${withDup.id}`);
  assert.ok(o.evidence.length > 0);
  await post(`/api/opportunities/${o.id}/status`, { status: 'CONTACTED' });
  await post(`/api/opportunities/${o.id}/assign`, { owner: 'Sarah Chen' });
  const n = await post(`/api/opportunities/${o.id}/notes`, { body: 'Called purchasing, sent line card.' });
  assert.equal(n.status, 'CONTACTED');
  assert.equal(n.owner, 'Sarah Chen');
  assert.ok(n.lastContactedAt);
  assert.equal(n.notes[0].body, 'Called purchasing, sent line card.');
  await post(`/api/opportunities/${o.id}/status`, { status: 'BOGUS' }, 400);
  const merged = await post(`/api/opportunities/${o.id}/merge`, { duplicateId: o.duplicateCandidates[0].opportunityId });
  assert.equal(merged.mergedSources.length, 1);
  const dup = await get(`/api/opportunities/${o.duplicateCandidates[0].opportunityId}`);
  assert.equal(dup.status, 'MERGED');
});

test('sync now runs the pipeline and reports stages', async () => {
  const { runId } = await post('/api/sync', {});
  let p: any;
  for (let i = 0; i < 50; i++) {
    p = await get(`/api/sync/${runId}`);
    if (p.status !== 'RUNNING') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(p.status, 'COMPLETE');
  assert.ok(p.stages.every((s: any) => s.status === 'done'));
  assert.ok(p.sources.some((s: any) => s.key === 'sam_gov' && s.status === 'SKIPPED'));
  assert.ok(p.newCount >= 1);
});

test('products: add, import CSV, rematch', async () => {
  const p = await post('/api/products', { sku: 'T-1', manufacturer: 'Apple', model: 'MacBook Air 13', category: 'Laptops', price: 1099 });
  assert.equal(p.manufacturer, 'Apple');
  const imp = await post('/api/products/import', { csv: 'sku,manufacturer,model,category,price\nT-2,Zebra,DS2208,Scanners,129\nbad,,,\n' });
  assert.equal(imp.imported, 1);
  assert.equal(imp.errors.length, 1);
  const rm = await post('/api/opportunities/rematch', {});
  assert.ok(rm.rematched > 10);
});

test('alerts, sources, analytics, export, admin', async () => {
  const a = await post('/api/alerts', { name: 'Test', categories: ['Laptops'], states: ['ca'], intentLevels: ['HOT'], minQuantity: 50 });
  assert.deepEqual(a.states, ['CA']);
  const t = await post('/api/sources/test', { key: 'sam_gov' });
  assert.equal(t.ok, false);
  assert.match(t.message, /not configured/i);
  const an = await get('/api/analytics');
  assert.ok(an.byState.length > 3);
  assert.ok(an.historical.isDemo);
  const csv = await get('/api/opportunities/export.csv?intent=HOT');
  assert.match(csv as string, /^Company,Website,Contact,Title,Email,Phone,State,City,Product,Quantity,Intent,Score,Deadline,Source,Source URL,Published Date,Discovered Date,Status/);
  assert.match(csv as string, /DEMO DATA/);
  const s = await (await fetch(base + '/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intentWeights: { quantity: 18 } }) })).json();
  assert.equal(s.intentWeights.quantity, 18);
  const cfg = await get('/api/config');
  assert.ok(!JSON.stringify(cfg).includes('api_key='));
  const orgs = await get('/api/organizations');
  assert.ok(orgs.length >= 10);
});
