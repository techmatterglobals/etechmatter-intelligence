import { expandCategories } from '../query/applyQuery';
import { lc, newId } from '../text';
import type { AlertEvent, AlertRule, Opportunity } from '../types';

export function ruleMatches(rule: AlertRule, o: Opportunity): boolean {
  if (!rule.active) return false;
  if (o.intentLevel === 'IRRELEVANT' || o.status === 'MERGED') return false;
  if (rule.intentLevels.length && !rule.intentLevels.includes(o.intentLevel)) return false;
  if (rule.categories.length) {
    const cats = expandCategories(rule.categories);
    if (!o.categories.some((c) => cats.includes(c))) return false;
  }
  if (rule.states.length && (!o.state || !rule.states.includes(o.state))) return false;
  if (rule.minQuantity != null && (o.quantity == null || o.quantity < rule.minQuantity)) return false;
  if (rule.minMatchScore != null && o.matchScore < rule.minMatchScore) return false;
  if (rule.keywords.length) {
    const hay = lc(`${o.title} ${o.description} ${o.organizationName ?? ''}`);
    if (!rule.keywords.some((k) => hay.includes(lc(k)))) return false;
  }
  return true;
}

export interface AlertNotifier {
  deliver(event: AlertEvent, rule: AlertRule, opp: Opportunity): Promise<AlertEvent['deliveries']>;
}

/** Default notifier: in-app only; email/webhook are logged as not configured. */
export const inAppNotifier: AlertNotifier = {
  async deliver(_e, rule) {
    return rule.channels.map((ch) =>
      ch === 'IN_APP' || ch === 'BROWSER'
        ? { channel: ch, status: 'SENT' as const, detail: ch === 'BROWSER' ? 'Shown as browser notification if permitted' : 'Added to notification center' }
        : { channel: ch, status: 'NOT_CONFIGURED' as const, detail: `${ch} delivery requires server configuration` },
    );
  },
};

export function newAlertEvent(rule: AlertRule, o: Opportunity): AlertEvent {
  return {
    id: newId('alev'),
    ruleId: rule.id,
    ruleName: rule.name,
    opportunityId: o.id,
    opportunityTitle: `${o.organizationName ?? 'Unknown organization'} — ${o.requirementSummary}`,
    intentLevel: o.intentLevel,
    intentScore: o.intentScore,
    createdAt: new Date().toISOString(),
    read: false,
    deliveries: [],
  };
}
