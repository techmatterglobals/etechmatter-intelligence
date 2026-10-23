// Connector registry â€” add a new source by implementing SourceConnector and
// listing it here. Nothing else in the app needs to change.
import { DemoFeedConnector, type Repository, type SourceConnector, type SourceInfo } from '@etm/shared';
import { env } from '../config/env';
import { GenericWebConnector } from './genericWeb';
import { GovContractScoutConnector } from './govContractScout';
import { SamGovConnector } from './samGov';
import { StateProcurementConnector } from './stateProcurement';
import { USAspendingConnector } from './usaspending';

export function createConnectors(): SourceConnector[] {
  const list: SourceConnector[] = [new SamGovConnector(), new StateProcurementConnector(), new GenericWebConnector(), new USAspendingConnector(), new GovContractScoutConnector()];
  if (env.demoFeedEnabled) list.push(new DemoFeedConnector());
  return list;
}

export async function describeSources(repo: Repository, connectors: SourceConnector[], nextRuns: Record<string, string | null>): Promise<SourceInfo[]> {
  const configs = await repo.getSourceConfigs();
  return connectors.map((c) => {
    const cfg = configs.find((x) => x.key === c.key);
    const config = cfg?.config ?? {};
    if (c instanceof DemoFeedConnector) (config.released as string[] | undefined)?.forEach((k) => c.released.add(k));
    let st = cfg && !cfg.enabled ? { status: 'DISABLED' as const, message: 'Disabled in admin' } : c.status(config);
    if (cfg?.lastStatus === 'ERROR' && st.status === 'CONNECTED') st = { status: 'ERROR' as const, message: `Last run failed: ${cfg.lastMessage ?? 'unknown error'}` };
    return {
      key: c.key,
      name: c.name,
      type: c.type,
      confidence: c.confidence,
      description: c.description,
      status: st.status,
      statusMessage: st.message,
      enabled: cfg?.enabled ?? true,
      intervalMinutes: cfg?.intervalMinutes ?? c.defaultIntervalMinutes,
      isLive: c.isLive,
      isDemo: c.isDemo,
      lastRunAt: cfg?.lastRunAt ?? null,
      lastSuccessAt: cfg?.lastSuccessAt ?? null,
      nextRunAt: nextRuns[c.key] ?? null,
      lastRunNew: cfg?.lastRunNew ?? null,
      docsUrl: c.docsUrl,
      requiredEnv: c.requiredEnv,
      config: redact(config),
    };
  });
}

function redact(cfg: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) out[k] = /key|secret|token|password/i.test(k) ? 'â€¢â€¢â€¢â€¢' : v;
  return out;
}

