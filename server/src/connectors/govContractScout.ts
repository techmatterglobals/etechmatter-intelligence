import {
  BaseConnector,
  type ConnectorContext,
  type ConnectorStatusReport,
  type RawDocument,
} from '@etm/shared';
import { env } from '../config/env';
import { politeFetch } from './http';

interface GovContract {
  id: string;
  title: string;
  contract_number?: string | null;
  state?: string | null;
  agency?: string | null;
  location?: string | null;
  posting_date?: string | null;
  due_date?: string | null;
  estimated_value?: number | string | null;
  naics_codes?: string[] | null;
  keywords?: string[] | null;
  status?: string | null;
  days_until_due?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  description?: string | null;
  source_url?: string | null;
  has_attachments?: boolean;
}

interface ContractsResponse {
  data?: GovContract[];
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
    total_pages?: number;
  };
  error?: {
    message?: string;
  };
}
interface ContractDetailResponse {
  data?: GovContract;
  error?: {
    message?: string;
  };
}
const safeDate = (value?: string | null): string | null => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
};

export class GovContractScoutConnector extends BaseConnector<GovContract> {
  readonly key = 'govcontractscout';
  readonly name = 'GovContractScout';
  readonly type = 'STATE_PROCUREMENT' as const;
  readonly confidence = 'MEDIUM' as const;
  readonly description =
  'Aggregated public procurement records retrieved from the GovContractScout API.';
  readonly isLive = true;
  readonly defaultIntervalMinutes = env.aggregatedProcurement.intervalMinutes;
  override readonly docsUrl = 'https://scout.govbidportals.com/docs/api';
  override readonly requiredEnv = [
    'AGGREGATED_PROCUREMENT_ENABLED',
    'AGGREGATED_PROCUREMENT_API_KEY',
  ];

  private get baseUrl(): string {
    return env.aggregatedProcurement.baseUrl.replace(/\/+$/, '');
  }

  status(_config: Record<string, unknown>): ConnectorStatusReport {
    if (!env.aggregatedProcurement.enabled) {
      return {
        status: 'NOT_CONFIGURED',
        message: 'Set AGGREGATED_PROCUREMENT_ENABLED=true to enable this connector.',
      };
    }

    if (!env.aggregatedProcurement.apiKey) {
      return {
        status: 'NOT_CONFIGURED',
        message: 'AGGREGATED_PROCUREMENT_API_KEY is missing.',
      };
    }

    return {
      status: 'CONNECTED',
      message: 'GovContractScout API credentials are configured; connection test is available.',
    };
  }

  override async test(
    _config: Record<string, unknown>,
  ): Promise<{ ok: boolean; message: string }> {
    if (!env.aggregatedProcurement.enabled) {
      return { ok: false, message: 'GovContractScout connector is disabled in environment settings.' };
    }

    if (!env.aggregatedProcurement.apiKey) {
      return { ok: false, message: 'AGGREGATED_PROCUREMENT_API_KEY is missing.' };
    }

    try {
      const url = new URL(`${this.baseUrl}/contracts`);
      url.searchParams.set('per_page', '10');
      url.searchParams.set('per_page', '200');

      const response = await politeFetch(url.toString(), {
        headers: { Authorization: `Bearer ${env.aggregatedProcurement.apiKey}` },
      });

      if (!response.ok) {
        return {
          ok: false,
          message: `GovContractScout returned HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
        };
      }

      const result = (await response.json()) as ContractsResponse;

      if (!Array.isArray(result.data)) {
        return { ok: false, message: 'API response did not contain a contracts data array.' };
      }

      return {
        ok: true,
        message: `Connected successfully; API reports ${result.meta?.total ?? 'an unknown number of'} records.`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }


  
async fetch(ctx: ConnectorContext): Promise<GovContract[]> {
  if (
    !env.aggregatedProcurement.enabled ||
    !env.aggregatedProcurement.apiKey
  ) {
    ctx.log(
      'GovContractScout skipped: connector is disabled or API key is missing.',
    );
    return [];
  }

  // Respect the configured maximum number of pages.
  const maxPages = Math.max(
    1,
    Math.floor(env.aggregatedProcurement.maxPages) || 1,
  );

  const records: GovContract[] = [];
  const apiKey = env.aggregatedProcurement.apiKey;
  const perPage = 20;

  // Step 1: Fetch contract lists.
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(`${this.baseUrl}/contracts`);

    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));

    ctx.log(
      `GovContractScout request: page=${page}, per_page=${perPage}`,
    );

    let response: Response;

    try {
      response = await politeFetch(
        url.toString(),
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            'User-Agent': 'ETechMatter-Intelligence/1.0',
          },
        },
        30000,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      ctx.log(
        `GovContractScout network error on page ${page}: ${message}`,
      );

      throw new Error(
        `GovContractScout request failed on page ${page}: ${message}`,
      );
    }

    ctx.log(
      `GovContractScout response: page=${page}, status=${response.status}`,
    );

    if (!response.ok) {
      const errorBody = (await response.text()).slice(0, 1000);

      ctx.log(
        `GovContractScout HTTP error: page=${page}, ` +
          `status=${response.status}, body=${errorBody}`,
      );

      throw new Error(
        `GovContractScout HTTP ${response.status} on page ${page}: ` +
          errorBody.slice(0, 500),
      );
    }

    let result: ContractsResponse;

    try {
      result = (await response.json()) as ContractsResponse;
    } catch {
      throw new Error(
        `GovContractScout returned invalid JSON on page ${page}.`,
      );
    }

    if (!Array.isArray(result.data)) {
      throw new Error(
        `GovContractScout response is missing the data array on page ${page}.`,
      );
    }

    ctx.log(
      `GovContractScout page ${page}: ${result.data.length} contracts; ` +
        `API total=${result.meta?.total ?? 'unknown'}`,
    );

    records.push(...result.data);

    if (
      result.data.length === 0 ||
      (result.meta?.total_pages !== undefined &&
        page >= result.meta.total_pages) ||
      result.data.length < perPage
    ) {
      break;
    }
  }

  ctx.log(
    `GovContractScout list fetch completed: ${records.length} contracts.`,
  );

  // Step 2: Fetch individual contract details.
  // If a detail request fails, preserve the original list record.
  const enrichedRecords: GovContract[] = [];

  for (const contract of records) {
    if (!contract.id) {
      ctx.log('GovContractScout received a contract without an ID.');
      enrichedRecords.push(contract);
      continue;
    }

    const detailUrl =
      `${this.baseUrl}/contracts/${encodeURIComponent(contract.id)}`;

    try {
      const detailResponse = await politeFetch(
        detailUrl,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            'User-Agent': 'ETechMatter-Intelligence/1.0',
          },
        },
        30000,
      );

      if (!detailResponse.ok) {
        ctx.log(
          `GovContractScout detail HTTP ${detailResponse.status} ` +
            `for contract ${contract.id}; using list data.`,
        );

        enrichedRecords.push(contract);
        continue;
      }

      const payload =
        (await detailResponse.json()) as ContractDetailResponse;

      const detail = payload.data;

      if (!detail || typeof detail !== 'object') {
        ctx.log(
          `GovContractScout detail missing for ${contract.id}; using list data.`,
        );

        enrichedRecords.push(contract);
        continue;
      }

      const enriched: GovContract = { ...contract };

      for (const [field, value] of Object.entries(detail)) {
        if (value !== null && value !== undefined && value !== '') {
          (enriched as unknown as Record<string, unknown>)[field] =
            value;
        }
      }

      ctx.log(
        `GovContractScout detail loaded: ${contract.id}; ` +
          `description length=${enriched.description?.length ?? 0}`,
      );

      enrichedRecords.push(enriched);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      ctx.log(
        `GovContractScout detail fetch failed for ${contract.id}: ${message}. ` +
          'Using list data.',
      );

      enrichedRecords.push(contract);
    }
  }

  ctx.log(
    `GovContractScout fetch completed: ${enrichedRecords.length} contracts ready for normalization.`,
  );

  return enrichedRecords;
}



  normalize(contract: GovContract, ctx: ConnectorContext): RawDocument | null {
    if (!contract.id || !contract.title?.trim()) return null;

    const state =
      contract.state && contract.state.toUpperCase() !== 'US'
        ? contract.state
        : null;

    const naics = contract.naics_codes?.filter(Boolean) ?? [];
    const keywords = contract.keywords?.filter(Boolean) ?? [];
    const publishedAt = safeDate(contract.posting_date);
    const updatedAt = safeDate(contract.updated_at ?? contract.created_at);
    const deadline = safeDate(contract.due_date);

    const details = [
      `Contract: ${contract.title.trim()}`,
      contract.contract_number ? `Contract number: ${contract.contract_number}` : '',
      contract.agency ? `Agency: ${contract.agency}` : '',
      state ? `State: ${state}` : '',
      contract.location ? `Location: ${contract.location}` : '',
      contract.status ? `Status: ${contract.status}` : '',
      publishedAt ? `Posted: ${publishedAt}` : '',
      deadline ? `Response deadline: ${deadline}` : '',
      contract.estimated_value != null
        ? `Estimated value: ${contract.estimated_value} USD`
        : '',
      naics.length ? `NAICS codes: ${naics.join(', ')}` : '',
      keywords.length ? `Keywords: ${keywords.join(', ')}` : '',
      contract.days_until_due != null
        ? `Days until due: ${contract.days_until_due}`
        : '',
      contract.has_attachments ? 'Attachments available: yes' : '',
      contract.description?.trim() ?? '',
    ].filter(Boolean);

    return {
      sourceKey: this.key,
      sourceName: this.name,
      sourceType: this.type,
      sourceConfidence: this.confidence,
      sourceId: contract.id,
      sourceUrl:
        contract.source_url ||
        `${this.baseUrl}/contracts/${encodeURIComponent(contract.id)}`,
      title: contract.title.trim(),
      text: details.join('\n'),
      publishedAt,
      updatedAt,
      retrievedAt: ctx.now.toISOString(),
      structured: {
        organizationName: contract.agency ?? null,
        state,
        country: 'US',
        deadline,
        naics: naics[0] ?? null,
        solicitationNumber: contract.contract_number ?? null,
      },
      isDemo: false,
    };
  }
}



