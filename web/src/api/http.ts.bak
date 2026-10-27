
import type { OpportunityQuery } from '@etm/shared';
import type { Api } from './client';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
const res = await fetch(path, {
  method,
  credentials: 'include',
  headers:
    body !== undefined
      ? { 'content-type': 'application/json' }
      : undefined,
  body: body !== undefined ? JSON.stringify(body) : undefined,
});

  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json')
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof data.error === 'string'
        ? data.error
        : `Request failed (${res.status})`;

    throw new ApiError(res.status, message);
  }

  return data as T;
}

export function toSearchParams(q: OpportunityQuery): string {
  const p = new URLSearchParams();

  for (const [k, v] of Object.entries(q)) {
    if (
      v === undefined ||
      v === null ||
      v === '' ||
      (Array.isArray(v) && !v.length)
    ) {
      continue;
    }

    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }

  const s = p.toString();
  return s ? `?${s}` : '';
}

export const httpApi: Api = {
  mode: 'server',

  // Configuration and dashboard
  config: () => req('GET', '/api/config'),
  dashboard: () => req('GET', '/api/dashboard'),

  // Opportunities
  listOpportunities: (q) =>
    req('GET', `/api/opportunities${toSearchParams(q)}`),

  search: (query, filters) =>
    req('POST', '/api/search', {
      query,
      filters,
      page: filters.page,
      pageSize: filters.pageSize,
    }),

  getOpportunity: (id) =>
    req('GET', `/api/opportunities/${id}`),

  setStatus: (id, status) =>
    req('POST', `/api/opportunities/${id}/status`, { status }),

  assign: (id, owner) =>
    req('POST', `/api/opportunities/${id}/assign`, { owner }),

  addNote: (id, body) =>
    req('POST', `/api/opportunities/${id}/notes`, { body }),

  updatePipeline: (id, patch) =>
    req('POST', `/api/opportunities/${id}/pipeline`, patch),

  save: (id, saved) =>
    req('POST', `/api/opportunities/${id}/save`, { saved }),

  merge: (id, duplicateId) =>
    req('POST', `/api/opportunities/${id}/merge`, { duplicateId }),

  dismissDuplicate: (id, duplicateId) =>
    req('POST', `/api/opportunities/${id}/dismiss-duplicate`, {
      duplicateId,
    }),

  exportCsv: (q) =>
    req('GET', `/api/opportunities/export.csv${toSearchParams(q)}`),

  // Map, organizations, and analytics
  map: () => req('GET', '/api/map'),
  organizations: () => req('GET', '/api/organizations'),
  analytics: () => req('GET', '/api/analytics'),
  historical: () => req('GET', '/api/historical'),

  // Products
  products: () => req('GET', '/api/products'),

  createProduct: (p) =>
    req('POST', '/api/products', p),

  deleteProduct: (id) =>
    req('DELETE', `/api/products/${id}`),

  importProducts: (csv, replaceDemo) =>
    req('POST', '/api/products/import', { csv, replaceDemo }),

  rematch: () =>
    req('POST', '/api/opportunities/rematch', {}),

  addCategory: (name) =>
    req('POST', '/api/categories', { name }),

  // Data sources
  sources: () => req('GET', '/api/sources'),
  runs: () => req('GET', '/api/sources/runs?limit=40'),

  testSource: (key) =>
    req('POST', '/api/sources/test', { key }),

  updateSource: (key, patch) =>
    req('PUT', `/api/sources/${key}`, patch),

  startSync: (sources) =>
    req('POST', '/api/sync', { sources }),

  syncProgress: (runId) =>
    req('GET', `/api/sync/${runId}`),

  // Alerts
  alerts: () => req('GET', '/api/alerts'),

  saveAlert: (rule) =>
    rule.id
      ? req('PUT', `/api/alerts/${rule.id}`, rule)
      : req('POST', '/api/alerts', rule),

  deleteAlert: (id) =>
    req('DELETE', `/api/alerts/${id}`),

  alertEvents: () =>
    req('GET', '/api/alerts/events?limit=40'),

  markAlertsRead: () =>
    req('POST', '/api/alerts/events/read', { ids: 'all' }),

  // Settings
  settings: () => req('GET', '/api/settings'),

  updateSettings: (patch) =>
    req('PUT', '/api/settings', patch),

  // User management
  users: () =>
    req('GET', '/api/users'),

  createUser: (u) =>
    req('POST', '/api/users', u),

  updateUser: (id, patch) =>
    req('PUT', `/api/users/${id}`, patch),

  deleteUser: (id) =>
    req('DELETE', `/api/users/${id}`),  
  resetUserPassword: (id, password, confirmPassword) =>
  req('POST', `/api/users/${id}/password`, {
    password,
    confirmPassword,
  }),
  logout: () =>
  req<{ success: boolean }>('POST', '/api/auth/logout', {}),
};
