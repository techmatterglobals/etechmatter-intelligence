import { STATES, type AlertRule, type IntentLevel } from '@etm/shared';
import { useState } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';
import { IntentIcon } from '../components/intel';
import { Button, Card, CardHeader, ChipToggle, ErrorBox, Field, Pill, Spinner, Toggle, inp, inputCls } from '../components/ui';
import { useApp } from '../lib/appContext';
import { timeAgo } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { Link } from '../lib/router';

const CATS = ['Laptops', 'Desktop PCs', 'Workstations', 'Servers', 'Storage', 'Networking', 'Firewalls', 'Wireless Access Points', 'Monitors', 'UPS', 'Printers'];
const CHANNELS: AlertRule['channels'] = ['IN_APP', 'BROWSER', 'EMAIL', 'WEBHOOK'];

export function Alerts() {
  const { api, version, toast } = useApp();
  const rules = useAsync(() => api.alerts(), [version]);
  const events = useAsync(() => api.alertEvents(), [version]);
  const blank = { name: '', categories: ['Servers'], states: [] as string[], intentLevels: ['HOT'] as IntentLevel[], minQuantity: '50', channels: ['IN_APP'] as AlertRule['channels'], email: '', webhookUrl: '' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  if (rules.error) return <ErrorBox message={rules.error} onRetry={rules.reload} />;
  if (!rules.data) return <Spinner />;
  const tog = <T,>(l: T[], v: T) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div>
        <div className="eyebrow">Be first to respond</div>
        <h1 className="font-display text-2xl font-semibold text-ink">Alerts</h1>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="New alert rule" eyebrow="Fires when a newly discovered opportunity matches" />
            <form
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api.saveAlert({ ...f, name: f.name || `${f.intentLevels.join('/')} ${f.categories.join(', ') || 'any hardware'}${f.states.length ? ` in ${f.states.join(', ')}` : ''}`, minQuantity: f.minQuantity ? Number(f.minQuantity) : null, email: f.email || null, webhookUrl: f.webhookUrl || null });
                  toast('Alert rule created');
                  setF(blank);
                  rules.reload();
                } catch (err) {
                  toast(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Name" htmlFor="al-name">
                <input id="al-name" className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Hot server deals in TX/CA/FL" />
              </Field>
              <Field label="Product">
                <div className="flex flex-wrap gap-1.5">
                  {CATS.map((c) => (
                    <ChipToggle key={c} active={f.categories.includes(c)} onClick={() => setF({ ...f, categories: tog(f.categories, c) })}>
                      {c}
                    </ChipToggle>
                  ))}
                </div>
              </Field>
              <Field label="States (none = all)">
                <div className="flex flex-wrap items-center gap-1.5">
                  <select id="al-state" className={inp({ size: 'sm', w: 'w-auto' })} value="" onChange={(e) => e.target.value && setF({ ...f, states: [...new Set([...f.states, e.target.value])] })} aria-label="Add state">
                    <option value="">Add state…</option>
                    {[...STATES].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {f.states.map((s) => (
                    <ChipToggle key={s} active onClick={() => setF({ ...f, states: f.states.filter((x) => x !== s) })}>
                      {s} ×
                    </ChipToggle>
                  ))}
                </div>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Intent">
                  <div className="flex gap-1.5">
                    {(['HOT', 'WARM', 'LOW'] as IntentLevel[]).map((l) => (
                      <ChipToggle key={l} active={f.intentLevels.includes(l)} onClick={() => setF({ ...f, intentLevels: tog(f.intentLevels, l) })}>
                        <IntentIcon level={l} /> {l}
                      </ChipToggle>
                    ))}
                  </div>
                </Field>
                <Field label="Minimum quantity" htmlFor="al-qty">
                  <input id="al-qty" inputMode="numeric" className={inputCls} value={f.minQuantity} onChange={(e) => setF({ ...f, minQuantity: e.target.value.replace(/\D/g, '') })} placeholder="Any" />
                </Field>
              </div>
              <Field label="Deliver via" hint="E-mail and webhook deliveries run on the backend (EMAIL_API_KEY / webhook URL). In-app is always on.">
                <div className="flex flex-wrap gap-1.5">
                  {CHANNELS.map((c) => (
                    <ChipToggle key={c} active={f.channels.includes(c)} onClick={() => setF({ ...f, channels: tog(f.channels, c) })}>
                      {c.replace('_', '-')}
                    </ChipToggle>
                  ))}
                </div>
              </Field>
              {f.channels.includes('EMAIL') && (
                <Field label="E-mail recipient" htmlFor="al-email">
                  <input id="al-email" type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
                </Field>
              )}
              {f.channels.includes('WEBHOOK') && (
                <Field label="Webhook URL (receives JSON POST)" htmlFor="al-hook">
                  <input id="al-hook" type="url" className={inputCls} value={f.webhookUrl} onChange={(e) => setF({ ...f, webhookUrl: e.target.value })} placeholder="https://hooks.slack.com/…" />
                </Field>
              )}
              <div className="flex justify-end">
                <Button type="submit" variant="primary" icon={<LuPlus />} loading={busy}>
                  Create alert
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader title="Alert rules" eyebrow={`${rules.data.length} rule(s)`} />
            <ul className="flex flex-col divide-y divide-line">
              {rules.data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Toggle id={`al-on-${r.id}`} label={`Enable ${r.name}`} checked={r.active} onChange={(v) => api.saveAlert({ id: r.id, active: v }).then(rules.reload)} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">{r.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.intentLevels.map((l) => <Pill key={l} tone={l === 'HOT' ? 'hot' : l === 'WARM' ? 'warm' : 'low'}>{l}</Pill>)}
                      {r.categories.map((c) => <Pill key={c} tone="outline">{c}</Pill>)}
                      <Pill tone="muted">{r.states.length ? r.states.join(', ') : 'All states'}</Pill>
                      {r.minQuantity != null && <Pill tone="muted">≥ {r.minQuantity} units</Pill>}
                      {r.minMatchScore != null && <Pill tone="muted">match ≥ {r.minMatchScore}%</Pill>}
                      <Pill tone="brand">{r.channels.join(' · ')}</Pill>
                    </div>
                    <div className="mt-1 text-[11px] text-ink-3 tnum">
                      Triggered {r.triggerCount}× {r.lastTriggeredAt ? `· last ${timeAgo(r.lastTriggeredAt)}` : ''}
                    </div>
                  </div>
                  {confirmDel === r.id ? (
                    <span className="flex gap-1">
                      <Button size="sm" variant="danger" onClick={() => api.deleteAlert(r.id).then(() => { setConfirmDel(null); rules.reload(); })}>Delete</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDel(null)}>Keep</Button>
                    </span>
                  ) : (
                    <button className="rounded p-1.5 text-ink-3 hover:bg-sunken hover:text-hot cursor-pointer" aria-label={`Delete ${r.name}`} onClick={() => setConfirmDel(r.id)}>
                      <LuTrash2 />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card>
          <CardHeader title="Triggered alerts" eyebrow="Most recent" />
          {!events.data?.length && <p className="text-xs text-ink-3">Nothing triggered yet. Run Sync Now — new matching opportunities appear here and in the bell menu.</p>}
          <ul className="flex flex-col gap-3">
            {events.data?.map((e) => (
              <li key={e.id} className="text-sm">
                <Link to={`/opportunities/${e.opportunityId}`} className="font-medium text-ink hover:text-brand">
                  {e.opportunityTitle}
                </Link>
                <div className="text-[11px] text-ink-3">
                  {e.ruleName} · {timeAgo(e.createdAt)}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {e.deliveries.map((d, i) => (
                    <Pill key={i} tone={d.status === 'SENT' ? 'low' : d.status === 'FAILED' ? 'hot' : 'muted'} title={d.detail}>
                      {d.channel}: {d.status.replace('_', ' ')}
                    </Pill>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
