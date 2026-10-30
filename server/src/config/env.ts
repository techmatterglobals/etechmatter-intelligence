// Server-side configuration. Secrets are read ONLY here and never sent to the browser.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')]) {
  if (existsSync(p)) {
    try {
      process.loadEnvFile(p);
    } catch {
      /* ignore malformed .env */
    }
    break;
  }
}

const str = (k: string, d = '') => (process.env[k] ?? d).trim();
const num = (k: string, d: number) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && process.env[k] !== '' && process.env[k] !== undefined ? v : d;
};
const bool = (k: string, d: boolean) => {
  const v = process.env[k];
  if (v === undefined || v === '') return d;
  return /^(1|true|yes|on)$/i.test(v);
};
const list = (k: string, d: string[]) => {
  const v = process.env[k];
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : d;
};

export const env = {
  port: num('PORT', 4000),
  nodeEnv: str('NODE_ENV', 'development'),
  corsOrigin: str('CORS_ORIGIN', '*'),
  basicAuth: str('APP_BASIC_AUTH'), // "user:password" — protects the whole app when set
  serveWebDist: str('SERVE_WEB_DIST', '../web/dist'),

  databaseUrl: str('DATABASE_URL'),
  dataStore: (str('DATA_STORE') || (str('DATABASE_URL') ? 'postgres' : 'memory')) as 'postgres' | 'memory',
  seedDemoData: bool('SEED_DEMO_DATA', true),
  demoFeedEnabled: bool('DEMO_FEED_ENABLED', true),

  schedulerEnabled: bool('SCHEDULER_ENABLED', true),

  sam: {
    apiKey: str('SAM_API_KEY'),
    baseUrl: str('SAM_API_BASE_URL', 'https://api.sam.gov/opportunities/v2/search'),
    intervalMinutes: num('SAM_SYNC_INTERVAL_MINUTES', 15),
    dailyRequestLimit: num('SAM_DAILY_REQUEST_LIMIT', 10),
    lookbackDays: num('SAM_POSTED_LOOKBACK_DAYS', 3),
    noticeTypes: str('SAM_NOTICE_TYPES', 'o,k,p,r,s'),
    naicsCodes: list('SAM_NAICS_CODES', ['334111', '334112', '334118', '334210', '334220', '334290', '334419', '335999', '423430', '423690', '541519']),
    pscPrefixes: list('SAM_PSC_PREFIXES', ['70', '58', '59', '61', '7A', '7B', '7C', '7D', '7E', '7F', '7G', '7H', '7J', '7K']),
    fetchDescriptions: bool('SAM_FETCH_DESCRIPTIONS', false),
    maxPagesPerRun: num('SAM_MAX_PAGES_PER_RUN', 2),
  },

  usaspending: {
    enabled: bool('USASPENDING_ENABLED', true),
    baseUrl: str('USASPENDING_API_BASE_URL', 'https://api.usaspending.gov'),
    intervalMinutes: num('USASPENDING_SYNC_INTERVAL_MINUTES', 1440),
    lookbackDays: num('USASPENDING_LOOKBACK_DAYS', 365),
    naicsCodes: list('USASPENDING_NAICS_CODES', ['334111', '334112', '334118', '423430']),
    maxRecords: num('USASPENDING_MAX_RECORDS', 200),
  },

  web: {
    userAgent: str('WEB_USER_AGENT', 'ETechMatterIntelligenceBot/1.0 (+https://etechmatter.com)'),
    intervalMinutes: num('WEB_SYNC_INTERVAL_MINUTES', 120),
    seedUrls: list('WEB_DISCOVERY_URLS', []),
    requestTimeoutMs: num('WEB_REQUEST_TIMEOUT_MS', 15000),
  },

  state: {
    intervalMinutes: num('STATE_SYNC_INTERVAL_MINUTES', 60),
    portalsJson: str('STATE_PORTAL_FEEDS'), // JSON array, see .env.example
  },

  ai: {
    provider: (str('AI_PROVIDER', 'heuristic') || 'heuristic') as 'heuristic' | 'anthropic' | 'openai',
    model: str('AI_MODEL'),
    anthropicKey: str('ANTHROPIC_API_KEY'),
    openaiKey: str('OPENAI_API_KEY'),
    openaiBaseUrl: str('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    maxConcurrency: num('AI_MAX_CONCURRENCY', 2),
    timeoutMs: num('AI_TIMEOUT_MS', 60000),
  },

  email: {
    provider: str('EMAIL_PROVIDER'), // "resend" supported out of the box
    apiKey: str('EMAIL_API_KEY'),
    from: str('EMAIL_FROM', 'alerts@etechmatter.com'),
  },
  appBaseUrl: str('APP_BASE_URL', 'http://localhost:5173'),
};

/** Safe view of configuration for the admin UI — never includes secret values. */
export function publicConfig() {
  return {
    dataStore: env.dataStore,
    databaseConfigured: !!env.databaseUrl,
    schedulerEnabled: env.schedulerEnabled,
    seedDemoData: env.seedDemoData,
    demoFeedEnabled: env.demoFeedEnabled,
    keys: [
      { name: 'DATABASE_URL', configured: !!env.databaseUrl, purpose: 'PostgreSQL connection' },
      { name: 'SAM_API_KEY', configured: !!env.sam.apiKey, purpose: 'SAM.gov Contract Opportunities API' },
      { name: 'ANTHROPIC_API_KEY', configured: !!env.ai.anthropicKey, purpose: 'Claude AI provider' },
      { name: 'OPENAI_API_KEY', configured: !!env.ai.openaiKey, purpose: 'OpenAI-compatible AI provider' },
      { name: 'EMAIL_API_KEY', configured: !!env.email.apiKey, purpose: `Alert e-mail (${env.email.provider || 'provider not set'})` },
      { name: 'APP_BASIC_AUTH', configured: !!env.basicAuth, purpose: 'Password-protects the app' },
    ],
    ai: { provider: env.ai.provider, model: env.ai.model || null },
    sam: {
      baseUrl: env.sam.baseUrl,
      intervalMinutes: env.sam.intervalMinutes,
      dailyRequestLimit: env.sam.dailyRequestLimit,
      noticeTypes: env.sam.noticeTypes,
      naicsCodes: env.sam.naicsCodes,
      fetchDescriptions: env.sam.fetchDescriptions,
    },
  };
}
