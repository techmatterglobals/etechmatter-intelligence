// Alert delivery: in-app (always), browser (client polls /api/alerts/events),
// webhook (POST JSON — works as-is), e-mail (Resend supported; others: add a branch).
import type { AlertEvent, AlertNotifier, AlertRule, Opportunity } from '@etm/shared';
import { env } from '../config/env';

export const serverNotifier: AlertNotifier = {
  async deliver(event: AlertEvent, rule: AlertRule, opp: Opportunity) {
    const out: AlertEvent['deliveries'] = [];
    const link = `${env.appBaseUrl.replace(/\/$/, '')}/#/opportunities/${opp.id}`;
    const payload = {
      event: 'opportunity.alert',
      rule: { id: rule.id, name: rule.name },
      opportunity: {
        id: opp.id, title: opp.title, organization: opp.organizationName, state: opp.state, city: opp.city, intent: opp.intentLevel,
        intentScore: opp.intentScore, matchScore: opp.matchScore, quantity: opp.quantity, deadline: opp.deadline, source: opp.source,
        sourceUrl: opp.sourceUrl, summary: opp.aiSummary, isDemo: opp.isDemo, link,
      },
    };
    for (const ch of rule.channels) {
      if (ch === 'IN_APP') out.push({ channel: ch, status: 'SENT', detail: 'Notification center' });
      else if (ch === 'BROWSER') out.push({ channel: ch, status: 'SENT', detail: 'Delivered to open dashboards (browser permission required)' });
      else if (ch === 'WEBHOOK') {
        if (!rule.webhookUrl) {
          out.push({ channel: ch, status: 'NOT_CONFIGURED', detail: 'No webhook URL on this alert' });
          continue;
        }
        try {
          const r = await fetch(rule.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
          out.push({ channel: ch, status: r.ok ? 'SENT' : 'FAILED', detail: `HTTP ${r.status}` });
        } catch (e) {
          out.push({ channel: ch, status: 'FAILED', detail: e instanceof Error ? e.message : String(e) });
        }
      } else if (ch === 'EMAIL') {
        if (!env.email.apiKey || env.email.provider !== 'resend' || !rule.email) {
          out.push({ channel: ch, status: 'NOT_CONFIGURED', detail: !rule.email ? 'No recipient on this alert' : 'Set EMAIL_PROVIDER=resend and EMAIL_API_KEY' });
          continue;
        }
        try {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${env.email.apiKey}` },
            body: JSON.stringify({
              from: env.email.from,
              to: [rule.email],
              subject: `${opp.intentLevel === 'HOT' ? '🔥 ' : ''}${opp.organizationName ?? 'New opportunity'} — ${opp.requirementSummary}`,
              text: `${opp.aiSummary}\n\nIntent ${opp.intentLevel} ${opp.intentScore}/100 · Match ${opp.matchScore}%\nDeadline: ${opp.deadline ?? 'not stated'}\nSource: ${opp.source} ${opp.sourceUrl ?? ''}\n\nOpen: ${link}${opp.isDemo ? '\n\n[DEMO DATA]' : ''}`,
            }),
          });
          out.push({ channel: ch, status: r.ok ? 'SENT' : 'FAILED', detail: `HTTP ${r.status}` });
        } catch (e) {
          out.push({ channel: ch, status: 'FAILED', detail: e instanceof Error ? e.message : String(e) });
        }
      }
    }
    return out;
  },
};
