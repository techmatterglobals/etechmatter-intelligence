// The ingestion pipeline:
// source → fetch → normalize → parse → validate → deduplicate → classify →
// extract → identify buyer → enrich → score intent → product match → store → alert
//
// The same function runs from the backend scheduler, the "Sync Now" button and
// the browser standalone demo, so there is exactly one code path.

import { analyzeHeuristically } from '../ai/heuristicProvider';
import type { AIAnalysisResult, AIProvider } from '../ai/types';
import { buildOpportunity } from '../engine/analyze';
import type { Repository } from '../store/repository';
import { newId } from '../text';
import type { Opportunity, RawDocument, SourceRun, SyncProgress, SyncStage } from '../types';
import { inAppNotifier, newAlertEvent, ruleMatches, type AlertNotifier } from './alerts';
import type { ConnectorContext, SourceConnector } from './connector';

export interface SyncDeps {
  repo: Repository;
  connectors: SourceConnector[];
  ai: AIProvider;
  notifier?: AlertNotifier;
  trigger: SourceRun['trigger'];
  onlyKeys?: string[];
  onProgress?: (p: SyncProgress) => void;
  log?: (msg: string) => void;
  now?: () => Date;
  /** when true, disabled sources are skipped (scheduler); manual syncs honour it too */
  runId?: string;
}

const STAGES: [SyncStage['key'], string][] = [
  ['connect', 'Connecting to sources…'],
  ['fetch', 'Fetching new opportunities…'],
  ['dedupe', 'Deduplicating…'],
  ['analyze', 'AI analyzing…'],
  ['match', 'Matching products…'],
  ['store', 'Storing opportunities…'],
  ['alert', 'Evaluating alerts…'],
  ['complete', 'Complete.'],
];

export async function runSync(deps: SyncDeps): Promise<SyncProgress> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => undefined);
  const repo = deps.repo;
  const progress: SyncProgress = {
    runId: deps.runId ?? newId('sync'),
    status: 'RUNNING',
    stages: STAGES.map(([key, label]) => ({ key, label, status: 'pending' })),
    startedAt: now().toISOString(),
    finishedAt: null,
    newCount: 0,
    updatedCount: 0,
    duplicateCount: 0,
    irrelevantCount: 0,
    alertsTriggered: 0,
    sources: [],
    message: '',
  };
  const emit = () => deps.onProgress?.(JSON.parse(JSON.stringify(progress)));
  const stage = (key: SyncStage['key'], detail?: string) => {
    let reached = false;
    for (const s of progress.stages) {
      if (s.key === key) {
        s.status = key === 'complete' ? 'done' : 'active';
        if (detail) s.detail = detail;
        reached = true;
      } else if (!reached) s.status = 'done';
    }
    emit();
  };

  try {
    // ------------------------------------------------------------ connect
    stage('connect');
    const configs = await repo.getSourceConfigs();
    const selected = deps.connectors.filter((c) => !deps.onlyKeys || deps.onlyKeys.includes(c.key));
    const runnable: { c: SourceConnector; cfg: (typeof configs)[number] | undefined; run: SourceRun; ctx?: ConnectorContext }[] = [];
    for (const c of selected) {
      const cfg = configs.find((x) => x.key === c.key);
      const config = cfg?.config ?? {};
      const st = cfg && !cfg.enabled ? { status: 'DISABLED' as const, message: 'Source disabled in admin' } : c.status(config);
      const run: SourceRun = {
        id: newId('run'), sourceKey: c.key, startedAt: now().toISOString(), finishedAt: null, status: 'RUNNING',
        fetched: 0, created: 0, updated: 0, duplicates: 0, irrelevant: 0, message: '', trigger: deps.trigger,
      };
      if (st.status === 'NOT_CONFIGURED' || st.status === 'CONFIG_REQUIRED' || st.status === 'DISABLED' || st.status === 'ERROR') {
        run.status = 'SKIPPED';
        run.finishedAt = now().toISOString();
        run.message = st.message;
        await repo.saveRun(run);
        await repo.upsertSourceConfig(c.key, { lastRunAt: run.finishedAt, lastStatus: 'SKIPPED', lastMessage: st.message });
        progress.sources.push({ key: c.key, name: c.name, status: 'SKIPPED', message: st.message, fetched: 0, created: 0 });
        continue;
      }
      runnable.push({ c, cfg, run });
    }
    stage('connect', `${runnable.length} of ${selected.length} sources ready`);

    // ------------------------------------------------------------ fetch
    stage('fetch');
    const batches: { c: SourceConnector; run: SourceRun; docs: RawDocument[] }[] = [];
    for (const r of runnable) {
      const ctx: ConnectorContext = {
        now: now(),
        lastSuccessAt: r.cfg?.lastSuccessAt ?? null,
        config: r.cfg?.config ?? {},
        log: (m) => log(`[${r.c.key}] ${m}`),
        isKnown: async (id) => !!(await repo.findBySource(r.c.key, id)),
      };
      r.ctx = ctx;
      try {
        if (r.c.kind === 'historical' && r.c.fetchHistorical) {
          const recs = await r.c.fetchHistorical(ctx);
          const added = await repo.upsertHistorical(recs);
          r.run.fetched = recs.length;
          r.run.created = added;
          r.run.status = 'SUCCESS';
          r.run.message = `${recs.length} historical award records retrieved (${added} new). Historical intelligence — not current demand.`;
          continue;
        }
        const raw = await r.c.fetch(ctx);
        r.run.fetched = raw.length;
        const docs: RawDocument[] = [];
        let invalid = 0;
        for (const item of raw) {
          const n = r.c.normalize(item, ctx);
          if (!n) continue;
          const p = r.c.parse(n);
          const errs = r.c.validate(p);
          if (errs.length) {
            invalid++;
            log(`[${r.c.key}] rejected ${p.sourceId}: ${errs.join('; ')}`);
            continue;
          }
          docs.push(p);
        }
        const deduped = r.c.deduplicate(docs);
        r.run.message = `${raw.length} fetched, ${invalid} rejected by validation`;
        batches.push({ c: r.c, run: r.run, docs: deduped });
      } catch (e) {
        r.run.status = 'ERROR';
        r.run.message = e instanceof Error ? e.message : String(e);
        log(`[${r.c.key}] fetch failed: ${r.run.message}`);
      }
    }
    const totalDocs = batches.reduce((s, b) => s + b.docs.length, 0);
    stage('fetch', `${totalDocs} documents retrieved`);

    // ------------------------------------------------------------ dedupe (hard duplicates)
    stage('dedupe');
    const work: { b: (typeof batches)[number]; doc: RawDocument; existing: Opportunity | null }[] = [];
    for (const b of batches) {
      for (const doc of b.docs) {
        const existing = await repo.findBySource(doc.sourceKey, doc.sourceId);
        if (existing && (existing.updatedAt ?? '') === (doc.updatedAt ?? '') && existing.description === doc.text) {
          await repo.patchOpportunity(existing.id, { lastCheckedAt: doc.retrievedAt });
          b.run.duplicates++;
          continue;
        }
        work.push({ b, doc, existing });
      }
    }
    progress.duplicateCount = batches.reduce((s, b) => s + b.run.duplicates, 0);
    stage('dedupe', `${work.length} new/changed, ${progress.duplicateCount} unchanged`);

    // ------------------------------------------------------------ analyze
    stage('analyze');
    const analyses: AIAnalysisResult[] = [];
    let aiFallbacks = 0;
    for (let i = 0; i < work.length; i++) {
      const { doc } = work[i];
      try {
        analyses.push(await deps.ai.analyze(doc));
      } catch (e) {
        aiFallbacks++;
        log(`AI provider ${deps.ai.name} failed for ${doc.sourceId}: ${e instanceof Error ? e.message : e}. Using heuristic engine.`);
        const h = analyzeHeuristically(doc);
        h.reasoning = [...h.reasoning, `LLM provider failed — analysed by rules engine`];
        analyses.push(h);
      }
      if (i % 5 === 4) stage('analyze', `${i + 1}/${work.length} analysed`);
    }
    stage('analyze', `${work.length} documents analysed by ${deps.ai.name}${aiFallbacks ? ` (${aiFallbacks} fell back to rules engine)` : ''}`);

    // ------------------------------------------------------------ match + build
    stage('match');
    const catalog = await repo.listProducts();
    const settings = await repo.getSettings();
    const pool = await repo.dedupePool();
    const built: { opp: Opportunity; isNew: boolean; run: SourceRun }[] = [];
    for (let i = 0; i < work.length; i++) {
      const { doc, existing, b } = work[i];
      const opp = buildOpportunity(doc, analyses[i], { catalog, settings, pool, now: now().toISOString(), existing });
      built.push({ opp, isNew: !existing, run: b.run });
      pool.push(opp);
    }
    stage('match', `${built.filter((x) => x.opp.matchLevel !== 'NONE').length} opportunities matched to catalog`);

    // ------------------------------------------------------------ store
    stage('store');
    for (const { opp, isNew, run } of built) {
      await repo.saveOpportunity(opp);
      for (const d of opp.duplicateCandidates) {
        const other = await repo.getOpportunity(d.opportunityId);
        if (other && !other.duplicateCandidates.some((x) => x.opportunityId === opp.id)) {
          await repo.patchOpportunity(other.id, {
            duplicateCandidates: [...other.duplicateCandidates, { opportunityId: opp.id, title: opp.title, sourceName: opp.source, score: d.score, reasons: d.reasons }],
          });
        }
      }
      if (opp.intentLevel === 'IRRELEVANT') run.irrelevant++;
      if (isNew) run.created++;
      else run.updated++;
    }
    progress.newCount = built.filter((b) => b.isNew && b.opp.intentLevel !== 'IRRELEVANT').length;
    progress.updatedCount = built.filter((b) => !b.isNew).length;
    progress.irrelevantCount = built.filter((b) => b.opp.intentLevel === 'IRRELEVANT').length;
    stage('store', `${progress.newCount} new, ${progress.updatedCount} updated, ${progress.irrelevantCount} filtered as irrelevant`);

    // ------------------------------------------------------------ alert
    stage('alert');
    const rules = await repo.listAlertRules();
    const notifier = deps.notifier ?? inAppNotifier;
    for (const { opp, isNew } of built) {
      if (!isNew) continue;
      for (const rule of rules) {
        if (!ruleMatches(rule, opp)) continue;
        const ev = newAlertEvent(rule, opp);
        try {
          ev.deliveries = await notifier.deliver(ev, rule, opp);
        } catch (e) {
          ev.deliveries = [{ channel: 'ALL', status: 'FAILED', detail: e instanceof Error ? e.message : String(e) }];
        }
        await repo.createAlertEvent(ev);
        await repo.saveAlertRule({ ...rule, lastTriggeredAt: ev.createdAt, triggerCount: rule.triggerCount + 1 });
        rule.triggerCount++;
        progress.alertsTriggered++;
      }
    }
    stage('alert', `${progress.alertsTriggered} alert(s) triggered`);

    // ------------------------------------------------------------ finish runs
    for (const r of runnable) {
      if (r.run.status === 'RUNNING') r.run.status = 'SUCCESS';
      r.run.finishedAt = now().toISOString();
      if (r.run.status === 'SUCCESS' && r.c.kind === 'opportunities')
        r.run.message = `${r.run.fetched} fetched · ${r.run.created} new · ${r.run.updated} updated · ${r.run.duplicates} unchanged · ${r.run.irrelevant} irrelevant`;
      await repo.saveRun(r.run);
      await repo.upsertSourceConfig(r.c.key, {
        lastRunAt: r.run.finishedAt,
        lastStatus: r.run.status,
        lastMessage: r.run.message,
        ...(r.ctx ? { config: r.ctx.config } : {}),
        ...(r.run.status === 'SUCCESS' ? { lastSuccessAt: r.run.finishedAt, lastRunNew: r.run.created } : {}),
      });
      progress.sources.push({ key: r.c.key, name: r.c.name, status: r.run.status, message: r.run.message, fetched: r.run.fetched, created: r.run.created });
    }

    progress.status = 'COMPLETE';
    progress.finishedAt = now().toISOString();
    progress.message = `${progress.newCount} new opportunit${progress.newCount === 1 ? 'y' : 'ies'} discovered`;
    stage('complete', progress.message);
    return progress;
  } catch (e) {
    progress.status = 'ERROR';
    progress.finishedAt = now().toISOString();
    progress.message = e instanceof Error ? e.message : String(e);
    emit();
    return progress;
  }
}
