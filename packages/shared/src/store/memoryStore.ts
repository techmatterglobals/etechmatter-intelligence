import { DEFAULT_BUYING_KEYWORDS, DEFAULT_INTENT_PHRASES, HARDWARE_CATEGORIES } from '../constants';
import { DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS } from '../engine/scoring';
import { applyQuery, matchesQuery, sortOpportunities, toSummary } from '../query/applyQuery';
import { newId } from '../text';
import type {
  AlertEvent,
  AlertRule,
  AppSettings,
  HistoricalRecord,
  Opportunity,
  OpportunityQuery,
  OpportunitySummary,
  Page,
  Product,
  SourceRun,
  User,
} from '../types';
import type { Repository, SourceConfigRecord } from './repository';

export function defaultSettings(): AppSettings {
  return {
    categories: [...HARDWARE_CATEGORIES],
    buyingKeywords: [...DEFAULT_BUYING_KEYWORDS],
    intentPhrases: [...DEFAULT_INTENT_PHRASES],
    intentWeights: { ...DEFAULT_WEIGHTS },
    thresholds: { ...DEFAULT_THRESHOLDS },
    companyName: 'ETechMatter',
    companyWebsite: 'https://etechmatter.com',
  };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** In-process repository. Used for demo mode, tests and the browser standalone build. */
export class MemoryStore implements Repository {
  readonly kind = 'memory' as const;
  private opps = new Map<string, Opportunity>();
  private products = new Map<string, Product>();
  private settings: AppSettings = defaultSettings();
  private sources = new Map<string, SourceConfigRecord>();
  private runs: SourceRun[] = [];
  private rules = new Map<string, AlertRule>();
  private events: AlertEvent[] = [];
  private users: User[] = [];
  private historical = new Map<string, HistoricalRecord>();

  async listOpportunities(q: OpportunityQuery): Promise<Page<OpportunitySummary>> {
    return applyQuery([...this.opps.values()], q);
  }
  async getOpportunity(id: string) {
    const o = this.opps.get(id);
    return o ? clone(o) : null;
  }
  async findBySource(sourceKey: string, sourceId: string) {
    for (const o of this.opps.values()) if (o.sourceKey === sourceKey && o.sourceId === sourceId) return clone(o);
    return null;
  }
  async dedupePool() {
    const cutoff = Date.now() - 120 * 86_400_000;
    return [...this.opps.values()].filter((o) => o.status !== 'MERGED' && o.intentLevel !== 'IRRELEVANT' && new Date(o.discoveredAt).getTime() > cutoff);
  }
  async saveOpportunity(o: Opportunity) {
    this.opps.set(o.id, clone(o));
    return clone(o);
  }
  async patchOpportunity(id: string, patch: Partial<Opportunity>) {
    const o = this.opps.get(id);
    if (!o) return null;
    const next = { ...o, ...clone(patch), recordUpdatedAt: new Date().toISOString() };
    this.opps.set(id, next);
    return clone(next);
  }
  async aggregationRows() {
    return [...this.opps.values()];
  }
  async exportRows(q: OpportunityQuery, limit: number) {
    return sortOpportunities([...this.opps.values()].filter((o) => matchesQuery(o, q, new Date())), q.sort).slice(0, limit).map(toSummary);
  }
  async countOpportunities() {
    return this.opps.size;
  }

  async listProducts() {
    return [...this.products.values()].sort((a, b) => a.category.localeCompare(b.category) || a.manufacturer.localeCompare(b.manufacturer));
  }
  async createProduct(p: Omit<Product, 'id' | 'createdAt'>) {
    const existing = [...this.products.values()].find((x) => x.sku === p.sku);
    const prod: Product = { ...p, id: existing?.id ?? newId('prd'), createdAt: existing?.createdAt ?? new Date().toISOString() };
    this.products.set(prod.id, prod);
    return prod;
  }
  async updateProduct(id: string, patch: Partial<Product>) {
    const p = this.products.get(id);
    if (!p) return null;
    const next = { ...p, ...patch, id };
    this.products.set(id, next);
    return next;
  }
  async deleteProduct(id: string) {
    return this.products.delete(id);
  }

  async getSettings() {
    return clone(this.settings);
  }
  async updateSettings(patch: Partial<AppSettings>) {
    this.settings = { ...this.settings, ...clone(patch) };
    return clone(this.settings);
  }

  async getSourceConfigs() {
    return [...this.sources.values()].map(clone);
  }
  async upsertSourceConfig(key: string, patch: Partial<SourceConfigRecord>) {
    const prev: SourceConfigRecord = this.sources.get(key) ?? {
      key, enabled: true, intervalMinutes: 60, config: {}, lastRunAt: null, lastSuccessAt: null, lastRunNew: null, lastStatus: null, lastMessage: null,
    };
    const next = { ...prev, ...patch, key };
    this.sources.set(key, next);
    return clone(next);
  }
  async saveRun(run: SourceRun) {
    const i = this.runs.findIndex((r) => r.id === run.id);
    if (i >= 0) this.runs[i] = run;
    else this.runs.unshift(run);
    this.runs = this.runs.slice(0, 500);
  }
  async listRuns(limit: number, sourceKey?: string) {
    return this.runs.filter((r) => !sourceKey || r.sourceKey === sourceKey).slice(0, limit);
  }

  async listAlertRules() {
    return [...this.rules.values()];
  }
  async saveAlertRule(rule: AlertRule) {
    this.rules.set(rule.id, clone(rule));
    return rule;
  }
  async deleteAlertRule(id: string) {
    return this.rules.delete(id);
  }
  async listAlertEvents(limit: number) {
    return this.events.slice(0, limit).map(clone);
  }
  async createAlertEvent(e: AlertEvent) {
    this.events.unshift(e);
    this.events = this.events.slice(0, 1000);
  }
  async markAlertEventsRead(ids: string[] | 'all') {
    for (const e of this.events) if (ids === 'all' || ids.includes(e.id)) e.read = true;
  }

  async listUsers() {
    return [...this.users];
  }
  async createUser(u: Omit<User, 'id'>) {
    const user = { ...u, id: newId('usr') };
    this.users.push(user);
    return user;
  }

  async upsertHistorical(records: HistoricalRecord[]) {
    let n = 0;
    for (const r of records) {
      const k = `${r.sourceKey}:${r.awardId}`;
      if (!this.historical.has(k)) n++;
      this.historical.set(k, r);
    }
    return n;
  }
  async listHistorical(limit: number) {
    return [...this.historical.values()].sort((a, b) => (b.actionDate ?? '').localeCompare(a.actionDate ?? '')).slice(0, limit);
  }
}
