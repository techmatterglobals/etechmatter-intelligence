import type {
  AlertEvent,
  AlertRule,
  Analytics,
  AppSettings,
  CountRow,
  HistoricalRecord,
  Opportunity,
  OpportunityQuery,
  OpportunitySummary,
  OrganizationRecord,
  Page,
  Product,
  SourceRun,
  User,
} from '../types';

export interface SourceConfigRecord {
  key: string;
  enabled: boolean;
  intervalMinutes: number;
  config: Record<string, unknown>;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastRunNew: number | null;
  lastStatus: string | null;
  lastMessage: string | null;
}

/**
 * Persistence contract. Implemented by:
 *   MemoryStore        – in-process (demo / tests / browser standalone mode)
 *   PrismaRepository   – PostgreSQL via Prisma (production)
 */
export interface Repository {
  readonly kind: 'memory' | 'postgres';

  // opportunities
  listOpportunities(q: OpportunityQuery): Promise<Page<OpportunitySummary>>;
  getOpportunity(id: string): Promise<Opportunity | null>;
  findBySource(sourceKey: string, sourceId: string): Promise<Opportunity | null>;
  dedupePool(): Promise<Opportunity[]>;
  saveOpportunity(o: Opportunity): Promise<Opportunity>;
  patchOpportunity(id: string, patch: Partial<Opportunity>): Promise<Opportunity | null>;
  /** slim rows for aggregation (stats, analytics, map, organizations) */
  aggregationRows(): Promise<Opportunity[]>;
  exportRows(q: OpportunityQuery, limit: number): Promise<OpportunitySummary[]>;
  countOpportunities(): Promise<number>;

  // catalog
  listProducts(): Promise<Product[]>;
  createProduct(p: Omit<Product, 'id' | 'createdAt'>): Promise<Product>;
  updateProduct(id: string, patch: Partial<Product>): Promise<Product | null>;
  deleteProduct(id: string): Promise<boolean>;

  // settings / categories / keywords / intent rules
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;

  // sources
  getSourceConfigs(): Promise<SourceConfigRecord[]>;
  upsertSourceConfig(key: string, patch: Partial<SourceConfigRecord>): Promise<SourceConfigRecord>;
  saveRun(run: SourceRun): Promise<void>;
  listRuns(limit: number, sourceKey?: string): Promise<SourceRun[]>;

  // alerts
  listAlertRules(): Promise<AlertRule[]>;
  saveAlertRule(rule: AlertRule): Promise<AlertRule>;
  deleteAlertRule(id: string): Promise<boolean>;
  listAlertEvents(limit: number): Promise<AlertEvent[]>;
  createAlertEvent(e: AlertEvent): Promise<void>;
  markAlertEventsRead(ids: string[] | 'all'): Promise<void>;

  // users
  listUsers(): Promise<User[]>;
  createUser(u: Omit<User, 'id'>): Promise<User>;

  // historical spending intelligence (kept separate from buying signals)
  upsertHistorical(records: HistoricalRecord[]): Promise<number>;
  listHistorical(limit: number): Promise<HistoricalRecord[]>;
}

export type { Analytics, CountRow, OrganizationRecord };
