import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.SAM_API_KEY = 'test-key';
process.env.SAM_DAILY_REQUEST_LIMIT = '2';

// Recorded-shape sample of a SAM.gov v2 search response (values are illustrative).
const SAMPLE = {
  totalRecords: 2,
  opportunitiesData: [
    {
      noticeId: 'abc123', title: 'Desktop Computers and Monitors — Brand Name or Equal', solicitationNumber: 'W912-26-Q-0001',
      fullParentPathName: 'DEPT OF DEFENSE.DEPT OF THE ARMY.W6QK ACC-PICA', postedDate: '2026-09-24', type: 'Combined Synopsis/Solicitation',
      responseDeadLine: '2026-10-05T14:00:00-05:00', naicsCode: '334111', classificationCode: '7021',
      typeOfSetAsideDescription: 'Total Small Business Set-Aside (FAR 19.5)', uiLink: 'https://sam.gov/opp/abc123/view',
      pointOfContact: [{ fullName: 'Jane Doe', title: 'Contract Specialist', email: 'jane.doe@army.mil', phone: '5555550100', type: 'primary' }],
      placeOfPerformance: { city: { name: 'Picatinny Arsenal' }, state: { code: 'NJ' }, zip: '07806' },
      descriptionText: 'The Government intends to purchase 120 desktop computers and 120 24" monitors. Quotes are due October 5, 2026.',
    },
    { noticeId: 'zzz', title: 'Janitorial Services', naicsCode: '561720', type: 'Solicitation', postedDate: '2026-09-24' },
  ],
};

test('SAM.gov connector: fetch → local hardware filter → normalize → pipeline', async () => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify(SAMPLE), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const { SamGovConnector } = await import('../src/connectors/samGov');
    const { MemoryStore, runSync, HeuristicProvider } = await import('@etm/shared');
    const sam = new SamGovConnector();
    assert.equal(sam.status({}).status, 'CONNECTED');
    const repo = new MemoryStore();
    const res = await runSync({ repo, connectors: [sam], ai: new HeuristicProvider(), trigger: 'MANUAL' });
    assert.equal(res.status, 'COMPLETE');
    assert.equal(res.newCount, 1, 'janitorial notice filtered out');
    assert.ok(calls[0].includes('api_key=test-key') && calls[0].includes('postedFrom='));
    const o = (await repo.aggregationRows())[0];
    const full = (await repo.getOpportunity(o.id))!;
    assert.equal(full.source, 'SAM.gov');
    assert.equal(full.sourceUrl, 'https://sam.gov/opp/abc123/view');
    assert.equal(full.state, 'NJ');
    assert.equal(full.buyerEmail, 'jane.doe@army.mil');
    assert.equal(full.procurementType, 'COMBINED_SYNOPSIS');
    assert.equal(full.quantity, 240);
    assert.equal(full.fieldProvenance.deadline, 'SOURCE_VERIFIED');
    assert.equal(full.isDemo, false);
    // second run: unchanged notice is not re-analysed
    const res2 = await runSync({ repo, connectors: [sam], ai: new HeuristicProvider(), trigger: 'MANUAL' });
    assert.equal(res2.newCount, 0);
    assert.equal(res2.duplicateCount, 1);
    // budget guard: limit 2 → third request refused
    const res3 = await runSync({ repo, connectors: [sam], ai: new HeuristicProvider(), trigger: 'MANUAL' });
    assert.ok(res3.sources[0].status === 'SKIPPED' || res3.sources[0].status === 'ERROR');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('SAM.gov connector without key reports "not configured" and is skipped', async () => {
  const { SamGovConnector } = await import('../src/connectors/samGov');
  const { env } = await import('../src/config/env');
  const saved = env.sam.apiKey;
  env.sam.apiKey = '';
  assert.equal(new SamGovConnector().status({}).status, 'NOT_CONFIGURED');
  env.sam.apiKey = saved;
});

test('robots.txt parsing', async () => {
  const { parseRobots, isPathAllowed } = await import('../src/connectors/http');
  const rules = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/bids\n\nUser-agent: BadBot\nDisallow: /', 'ETechMatterIntelligenceBot/1.0');
  assert.equal(isPathAllowed(rules, '/private/x'), false);
  assert.equal(isPathAllowed(rules, '/private/bids/rfq'), true);
  assert.equal(isPathAllowed(rules, '/'), true);
});

test('RSS parsing for state/local portals', async () => {
  const { parseFeed } = await import('../src/connectors/http');
  const items = parseFeed('<rss><channel><item><title><![CDATA[RFQ: 40 laptops]]></title><link>https://x.gov/b/1</link><description>Quotes due</description><pubDate>Wed, 24 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>');
  assert.equal(items[0].title, 'RFQ: 40 laptops');
  assert.equal(items[0].link, 'https://x.gov/b/1');
});
