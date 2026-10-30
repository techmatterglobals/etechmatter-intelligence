// Sync orchestration + backend scheduler.
//  • one sync runs at a time (manual and scheduled share a lock)
//  • each source has its own interval (admin-editable); interval 0 = manual only
//  • progress is kept in memory so the UI can poll /api/sync/:runId
import { newId, runSync, type AIProvider, type Repository, type SourceConnector, type SyncProgress } from '@etm/shared';
import { env } from '../config/env';
import { serverNotifier } from './notifier';

export class SyncService {
  private runs = new Map<string, SyncProgress>();
  private current: Promise<SyncProgress> | null = null;
  private currentId: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private nextRun: Record<string, string | null> = {};
  running = false;

  constructor(private repo: Repository, private connectors: SourceConnector[], private ai: AIProvider) {}

  get nextRuns() {
    return this.nextRun;
  }
  get activeRunId() {
    return this.currentId;
  }

  getProgress(runId: string) {
    return this.runs.get(runId) ?? null;
  }

  /** Starts a sync (or returns the one in flight). Resolves immediately with the run id. */
  start(trigger: 'MANUAL' | 'SCHEDULED', onlyKeys?: string[]): { runId: string; alreadyRunning: boolean } {
    if (this.current && this.currentId) return { runId: this.currentId, alreadyRunning: true };
    const runId = newId('sync');
    this.currentId = runId;
    this.runs.set(runId, {
      runId, status: 'RUNNING', stages: [], startedAt: new Date().toISOString(), finishedAt: null, newCount: 0, updatedCount: 0,
      duplicateCount: 0, irrelevantCount: 0, alertsTriggered: 0, sources: [], message: 'Starting…',
    });
    this.current = runSync({
      repo: this.repo,
      connectors: this.connectors,
      ai: this.ai,
      notifier: serverNotifier,
      trigger,
      onlyKeys,
      runId,
      onProgress: (p) => this.runs.set(runId, p),
      log: (m) => console.log(`[sync] ${m}`),
    })
      .then((p) => {
        this.runs.set(runId, p);
        console.log(`[sync] ${trigger} ${onlyKeys?.join(',') ?? 'all'} → ${p.message}`);
        return p;
      })
      .finally(() => {
        this.current = null;
        this.currentId = null;
        // keep the last 50 progress records
        const keys = [...this.runs.keys()];
        for (const k of keys.slice(0, Math.max(0, keys.length - 50))) this.runs.delete(k);
      });
    return { runId, alreadyRunning: false };
  }

  async runAndWait(trigger: 'MANUAL' | 'SCHEDULED', onlyKeys?: string[]) {
    const { runId } = this.start(trigger, onlyKeys);
    await this.current;
    return this.getProgress(runId)!;
  }

  /** Backend scheduler: checks every 30s which sources are due. */
  startScheduler() {
    if (!env.schedulerEnabled || this.timer) return;
    this.running = true;
    const tick = async () => {
      try {
        const configs = await this.repo.getSourceConfigs();
        const due: string[] = [];
        const now = Date.now();
        for (const c of this.connectors) {
          const cfg = configs.find((x) => x.key === c.key);
          const interval = cfg?.intervalMinutes ?? c.defaultIntervalMinutes;
          if (!interval || cfg?.enabled === false || c.isDemo) {
            this.nextRun[c.key] = null;
            continue;
          }
          const st = c.status(cfg?.config ?? {});
          if (st.status === 'NOT_CONFIGURED' || st.status === 'CONFIG_REQUIRED' || st.status === 'DISABLED') {
            this.nextRun[c.key] = null;
            continue;
          }
          const last = cfg?.lastRunAt ? new Date(cfg.lastRunAt).getTime() : 0;
          const next = last + interval * 60_000;
          this.nextRun[c.key] = new Date(Math.max(next, now)).toISOString();
          if (next <= now) due.push(c.key);
        }
        if (due.length && !this.current) this.start('SCHEDULED', due);
      } catch (e) {
        console.error('[scheduler] tick failed', e);
      }
    };
    void tick();
    this.timer = setInterval(tick, 30_000);
    console.log('[scheduler] started (30s tick)');
  }

  stopScheduler() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }
}
