// ============================================================================
// ETechMatter Intelligence — shared domain types
// Used by the backend (Node) and the frontend (React) so both speak one model.
// ============================================================================

export type IntentLevel = 'HOT' | 'WARM' | 'LOW' | 'IRRELEVANT';
export type MatchLevel = 'EXACT' | 'HIGH' | 'ALTERNATIVE' | 'NONE';

/** Where a value came from. Never present AI_INFERENCE as fact. */
export type Provenance = 'SOURCE_VERIFIED' | 'AI_INFERENCE' | 'UNKNOWN';

export type PipelineStatus =
  | 'NEW'
  | 'REVIEWED'
  | 'CONTACTED'
  | 'QUOTED'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST'
  | 'MERGED';

export type SourceType =
  | 'FEDERAL_PROCUREMENT'
  | 'STATE_PROCUREMENT'
  | 'LOCAL_PROCUREMENT'
  | 'EDUCATION'
  | 'HEALTHCARE'
  | 'PUBLIC_WEB'
  | 'HISTORICAL_SPENDING';

export type SourceConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ProcurementType =
  | 'RFQ'
  | 'RFP'
  | 'ITB'
  | 'SOLICITATION'
  | 'COMBINED_SYNOPSIS'
  | 'SOURCES_SOUGHT'
  | 'PRESOLICITATION'
  | 'SOLE_SOURCE'
  | 'AWARD'
  | 'PLANNED_PURCHASE'
  | 'DIRECT_REQUEST'
  | 'UNKNOWN';

export type DocumentKind =
  | 'PROCUREMENT_NOTICE'
  | 'PLANNED_PURCHASE'
  | 'AWARD_NOTICE'
  | 'NEWS_ARTICLE'
  | 'JOB_POSTING'
  | 'ADVERTISEMENT'
  | 'OTHER';

export type OrganizationType =
  | 'Federal Government'
  | 'State Government'
  | 'County Government'
  | 'City Government'
  | 'K-12 Education'
  | 'Higher Education'
  | 'Healthcare'
  | 'Public Agency'
  | 'Commercial'
  | 'Nonprofit'
  | 'Unknown';

export interface Field<T> {
  value: T | null;
  provenance: Provenance;
  /** Exact snippet from the source text supporting the value (when SOURCE_VERIFIED). */
  evidence?: string | null;
}

export interface ContactInfo {
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  role: string | null; // e.g. "Procurement Officer", "Primary POC"
  provenance: Provenance;
}

/** Output of SourceConnector.normalize(): one publicly retrieved document/notice. */
export interface RawDocument {
  sourceKey: string; // connector key, e.g. "sam_gov"
  sourceName: string; // display name, e.g. "SAM.gov"
  sourceType: SourceType;
  sourceConfidence: SourceConfidence;
  sourceId: string; // id within the source (noticeId, URL hash …)
  sourceUrl: string | null; // original, human-openable URL
  title: string;
  text: string; // full text used for analysis (what evidence snippets are cut from)
  publishedAt: string | null;
  updatedAt: string | null;
  retrievedAt: string;
  /** Values that came from structured API fields (these are SOURCE_VERIFIED). */
  structured?: {
    organizationName?: string | null;
    organizationType?: OrganizationType | null;
    organizationWebsite?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
    deadline?: string | null;
    procurementType?: ProcurementType | null;
    contacts?: ContactInfo[];
    naics?: string | null;
    psc?: string | null;
    setAside?: string | null;
    solicitationNumber?: string | null;
  };
  isDemo: boolean;
}

export interface RequestedItem {
  description: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  partNumber: string | null;
  quantity: number | null;
  specs: string | null;
  provenance: Provenance;
  evidence: string | null;
}

export interface Extraction {
  organization: Field<string>;
  organizationType: Field<OrganizationType>;
  items: RequestedItem[];
  categories: string[];
  totalQuantity: Field<number>;
  budget: Field<number>;
  deadline: Field<string>;
  deliveryLocation: Field<string>;
  city: Field<string>;
  state: Field<string>;
  zip: Field<string>;
  country: Field<string>;
  procurementType: Field<ProcurementType>;
  specifications: Field<string>;
  warranty: Field<string>;
  installation: Field<string>;
  support: Field<string>;
  vendorRequirements: Field<string>;
  certifications: Field<string>;
  contacts: ContactInfo[];
}

export interface Classification {
  documentKind: DocumentKind;
  hardwareRelevant: boolean;
  isUS: boolean | null;
  signals: string[]; // human-readable contextual signals detected
}

export interface ScoreReason {
  code: string;
  label: string;
  points: number;
}

export interface IntentScore {
  score: number; // 0–100
  level: IntentLevel;
  reasons: ScoreReason[];
  urgencyScore: number; // 0–100
  urgencyLabel: string;
}

export interface ProductMatch {
  productId: string;
  sku: string;
  manufacturer: string;
  model: string;
  partNumber: string | null;
  category: string;
  price: number | null;
  level: MatchLevel;
  score: number; // 0–100
  requestedItem: string;
  reason: string;
}

export interface Evidence {
  id: string;
  sourceUrl: string | null;
  sourceName: string;
  snippet: string;
  field: string | null; // which extracted field this supports
  publishedAt: string | null;
  retrievedAt: string;
}

export interface DuplicateCandidate {
  opportunityId: string;
  title: string;
  sourceName: string;
  score: number; // 0–1
  reasons: string[];
}

export interface Note {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface SalesActivity {
  id: string;
  type: 'STATUS_CHANGE' | 'ASSIGNED' | 'NOTE' | 'CONTACTED' | 'QUOTE' | 'MERGE' | 'SAVED' | 'CREATED';
  actor: string;
  detail: string;
  createdAt: string;
}

export interface Opportunity {
  id: string;
  title: string;
  description: string;

  // source
  sourceKey: string;
  source: string;
  sourceUrl: string | null;
  sourceId: string;
  sourceType: SourceType;
  sourceConfidence: SourceConfidence;
  isDemo: boolean;

  // timestamps (ISO)
  publishedAt: string | null;
  updatedAt: string | null; // source-side update time
  discoveredAt: string; // when OUR pipeline first found it
  lastCheckedAt: string;
  deadline: string | null;
  createdAt: string;
  recordUpdatedAt: string;

  // organization
  organizationId: string | null;
  organizationName: string | null;
  organizationWebsite: string | null;
  organizationType: OrganizationType;
  industry: string | null;
  employeeCount: number | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;

  // buyer (primary contact) — null unless publicly stated in the source
  buyerName: string | null;
  buyerTitle: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  buyerLinkedin: string | null;
  contacts: ContactInfo[];

  // requirement
  requirementSummary: string;
  hardwareCategory: string | null;
  categories: string[];
  items: RequestedItem[];
  productsRequested: string[];
  brandsRequested: string[];
  modelsRequested: string[];
  partNumbers: string[];
  quantity: number | null;
  budget: number | null;
  currency: string;
  procurementType: ProcurementType;
  documentKind: DocumentKind;
  requirementDetails: {
    specifications: Field<string>;
    deliveryLocation: Field<string>;
    warranty: Field<string>;
    installation: Field<string>;
    support: Field<string>;
    vendorRequirements: Field<string>;
    certifications: Field<string>;
  };
  fieldProvenance: Record<string, Provenance>;

  // scores
  intentLevel: IntentLevel;
  intentScore: number;
  urgencyScore: number;
  urgencyLabel: string;
  matchScore: number;
  matchLevel: MatchLevel;
  overallOpportunityScore: number;
  estimatedOpportunityValue: number | null;
  estimatedValueBasis: string | null;
  scoreReasons: ScoreReason[];
  productMatches: ProductMatch[];

  // intelligence
  evidence: Evidence[];
  aiSummary: string;
  aiReasoning: string[];
  aiProvider: string;
  whyItMatters: string[];
  nextAction: string;

  // duplicates
  duplicateCandidates: DuplicateCandidate[];
  mergedIntoId: string | null;
  mergedSources: { source: string; sourceUrl: string | null; sourceId: string }[];

  // pipeline
  status: PipelineStatus;
  owner: string | null;
  saved: boolean;
  notes: Note[];
  activities: SalesActivity[];
  lastContactedAt: string | null;
  nextFollowUp: string | null;
  quoteValue: number | null;
  expectedCloseDate: string | null;
}

/** Lightweight shape for feeds/lists (keeps payloads small). */
export type OpportunitySummary = Pick<
  Opportunity,
  | 'id'
  | 'title'
  | 'source'
  | 'sourceKey'
  | 'sourceType'
  | 'sourceConfidence'
  | 'sourceUrl'
  | 'isDemo'
  | 'publishedAt'
  | 'discoveredAt'
  | 'deadline'
  | 'organizationName'
  | 'organizationType'
  | 'city'
  | 'state'
  | 'requirementSummary'
  | 'hardwareCategory'
  | 'categories'
  | 'quantity'
  | 'procurementType'
  | 'intentLevel'
  | 'intentScore'
  | 'urgencyScore'
  | 'matchScore'
  | 'matchLevel'
  | 'overallOpportunityScore'
  | 'estimatedOpportunityValue'
  | 'status'
  | 'owner'
  | 'saved'
  | 'buyerName'
  | 'buyerEmail'
  | 'buyerPhone'
  | 'buyerTitle'
  | 'organizationWebsite'
> & { hasDuplicates: boolean };

export interface Product {
  id: string;
  sku: string;
  manufacturer: string;
  model: string;
  partNumber: string | null;
  category: string;
  description: string;
  specifications: string | null;
  price: number | null;
  availability: string | null;
  moq: number | null;
  warranty: string | null;
  url: string | null;
  isDemo: boolean;
  createdAt: string;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  type: OrganizationType;
  website: string | null;
  city: string | null;
  state: string | null;
  industry: string | null;
  employeeCount: number | null;
  opportunityCount: number;
  hotCount: number;
  latestDiscoveredAt: string | null;
  totalEstimatedValue: number;
  isDemo: boolean;
}

export type ConnectorStatus = 'CONNECTED' | 'NOT_CONFIGURED' | 'PARTIAL' | 'CONFIG_REQUIRED' | 'ERROR' | 'DISABLED' | 'DEMO';

export interface SourceInfo {
  key: string;
  name: string;
  type: SourceType;
  confidence: SourceConfidence;
  description: string;
  status: ConnectorStatus;
  statusMessage: string;
  enabled: boolean;
  intervalMinutes: number;
  isLive: boolean; // true = retrieves from a real external system
  isDemo: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  nextRunAt: string | null;
  lastRunNew: number | null;
  docsUrl: string | null;
  requiredEnv: string[];
  config: Record<string, unknown>;
}

export interface SourceRun {
  id: string;
  sourceKey: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'SKIPPED' | 'ERROR';
  fetched: number;
  created: number;
  updated: number;
  duplicates: number;
  irrelevant: number;
  message: string;
  trigger: 'SCHEDULED' | 'MANUAL' | 'SEED';
}

export interface SyncStage {
  key: 'connect' | 'fetch' | 'dedupe' | 'analyze' | 'match' | 'store' | 'alert' | 'complete';
  label: string;
  status: 'pending' | 'active' | 'done';
  detail?: string;
}

export interface SyncProgress {
  runId: string;
  status: 'RUNNING' | 'COMPLETE' | 'ERROR';
  stages: SyncStage[];
  startedAt: string;
  finishedAt: string | null;
  newCount: number;
  updatedCount: number;
  duplicateCount: number;
  irrelevantCount: number;
  alertsTriggered: number;
  sources: { key: string; name: string; status: string; message: string; fetched: number; created: number }[];
  message: string;
}

export interface AlertRule {
  id: string;
  name: string;
  categories: string[];
  states: string[];
  intentLevels: IntentLevel[];
  minQuantity: number | null;
  minMatchScore: number | null;
  keywords: string[];
  channels: ('IN_APP' | 'EMAIL' | 'BROWSER' | 'WEBHOOK')[];
  email: string | null;
  webhookUrl: string | null;
  active: boolean;
  createdAt: string;
  lastTriggeredAt: string | null;
  triggerCount: number;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  opportunityId: string;
  opportunityTitle: string;
  intentLevel: IntentLevel;
  intentScore: number;
  createdAt: string;
  read: boolean;
  deliveries: { channel: string; status: 'SENT' | 'LOGGED' | 'FAILED' | 'NOT_CONFIGURED'; detail: string }[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'SALES' | 'VIEWER';
}

export interface HistoricalRecord {
  id: string;
  sourceKey: string;
  awardId: string;
  recipientName: string | null;
  awardingAgency: string | null;
  awardingSubAgency: string | null;
  amount: number | null;
  description: string | null;
  naicsCode: string | null;
  state: string | null;
  actionDate: string | null;
  sourceUrl: string | null;
  retrievedAt: string;
  isDemo: boolean;
}

export interface IntentWeights {
  explicitProcurement: number;
  earlyProcurement: number;
  plannedPurchase: number;
  exactProduct: number;
  genericProduct: number;
  quantity: number;
  deadline: number;
  deadlineUrgent: number;
  usOrganization: number;
  contact: number;
  organizationOnly: number;
  recentPublication: number;
  budget: number;
  news: number;
  jobPosting: number;
  advertisement: number;
  historical: number;
  duplicate: number;
  irrelevant: number;
  nonUS: number;
  expired: number;
}

export interface AppSettings {
  categories: string[];
  buyingKeywords: string[];
  intentPhrases: string[];
  intentWeights: IntentWeights;
  thresholds: { hot: number; warm: number; low: number };
  companyName: string;
  companyWebsite: string;
}

export interface OpportunityQuery {
  q?: string;
  intent?: IntentLevel[];
  categories?: string[];
  sourceTypes?: SourceType[];
  sourceKeys?: string[];
  states?: string[];
  orgTypes?: OrganizationType[];
  procurementTypes?: ProcurementType[];
  discovered?: TimeWindow;
  posted?: TimeWindow;
  dateFrom?: string;
  dateTo?: string;
  deadlineWithin?: 'today' | '3d' | '7d' | '30d';
  qtyMin?: number;
  qtyMax?: number;
  match?: MatchLevel[];
  status?: PipelineStatus[];
  owner?: string;
  saved?: boolean;
  includeIrrelevant?: boolean;
  includeMerged?: boolean;
  data?: 'all' | 'live' | 'demo';
  sort?: 'score' | 'discovered' | 'deadline' | 'published' | 'value' | 'intent';
  page?: number;
  pageSize?: number;
}

export type TimeWindow = '15m' | '1h' | 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ParsedSearch {
  filters: OpportunityQuery;
  interpretations: string[];
  keywords: string;
}

export interface DashboardStats {
  hotCount: number;
  newToday: number;
  deadlinesUnder7: number;
  productMatches: number;
  estimatedPipeline: number;
  activeSources: number;
  totalSources: number;
  liveSources: number;
  totalOpportunities: number;
  demoCount: number;
  liveCount: number;
  lastSuccessfulSync: string | null;
  nextScheduledSync: string | null;
  schedulerRunning: boolean;
}

export interface CountRow {
  key: string;
  label: string;
  count: number;
  hot?: number;
  warm?: number;
  low?: number;
  value?: number;
}

export interface Analytics {
  byState: CountRow[];
  byCategory: CountRow[];
  bySource: CountRow[];
  byIntent: CountRow[];
  byDay: { date: string; count: number; hot: number }[];
  funnel: CountRow[];
  matchRate: { matched: number; total: number; rate: number; byLevel: CountRow[] };
  averageOpportunityValue: number | null;
  valuedCount: number;
  deadlines: { bucket: string; count: number }[];
  historical: {
    totalRecords: number;
    totalAmount: number;
    byAgency: CountRow[];
    recent: HistoricalRecord[];
    isDemo: boolean;
  };
}
