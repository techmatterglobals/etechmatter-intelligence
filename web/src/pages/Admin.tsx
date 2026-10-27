import type { AppSettings, IntentWeights, SourceInfo } from '@etm/shared';
import { useEffect, useState } from 'react';
import { LuCircleCheck, LuCircleX, LuPlus } from 'react-icons/lu';
import { Button, Card, CardHeader, ErrorBox, Field, Pill, Spinner, Tabs, Toggle, inp, inputCls } from '../components/ui';
import { useApp } from '../lib/appContext';
import { useAsync } from '../lib/hooks';
import { Link } from '../lib/router';
import { STATUS_LABEL, StatusDot } from './Dashboard';

type Tab = 'sources' | 'keys' | 'categories' | 'keywords' | 'rules' | 'users' | 'more';

export function Admin() {
  const [tab, setTab] = useState<Tab>('sources');
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <div className="eyebrow">/admin</div>
        <h1 className="font-display text-2xl font-semibold text-ink">Settings</h1>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'sources', label: 'Sources & refresh' },
          { key: 'keys', label: 'API keys' },
          { key: 'categories', label: 'Categories' },
          { key: 'keywords', label: 'Keywords' },
          { key: 'rules', label: 'Intent rules' },
          { key: 'users', label: 'Users' },
          { key: 'more', label: 'Catalog & alerts' },
        ]}
      />
      {tab === 'sources' && <SourcesAdmin />}
      {tab === 'keys' && <KeysAdmin />}
      {tab === 'categories' && <CategoriesAdmin />}
      {tab === 'keywords' && <KeywordsAdmin />}
      {tab === 'rules' && <RulesAdmin />}
      {tab === 'users' && <UsersAdmin />}
      {tab === 'more' && (
        <Card>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <Link to="/products" className="font-medium text-brand">Product catalog →</Link> add products manually or import a CSV.
            </li>
            <li>
              <Link to="/alerts" className="font-medium text-brand">Alert rules →</Link> product, state, intent and quantity triggers with in-app, browser, e-mail and webhook delivery.
            </li>
          </ul>
        </Card>
      )}
    </div>
  );
}

function SourcesAdmin() {
  const { api, toast, refresh } = useApp();
  const { data, error, reload } = useAsync(() => api.sources(), []);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  return (
    <div className="flex flex-col gap-3">
      {data.map((s) => (
        <SourceRow key={s.key} s={s} onSaved={() => { toast(`${s.name} saved`); reload(); refresh(); }} api={api} />
      ))}
    </div>
  );
}

function SourceRow({ s, onSaved, api }: { s: SourceInfo; onSaved: () => void; api: ReturnType<typeof useApp>['api'] }) {
  const [interval, setInterval_] = useState(String(s.intervalMinutes));
  const [urls, setUrls] = useState(((s.config.seedUrls as string[] | undefined) ?? []).join('\n'));
  const [portals, setPortals] = useState(JSON.stringify(s.config.portals ?? [], null, 2));
  const [err, setErr] = useState<string | null>(null);
  const save = async (patch: Parameters<typeof api.updateSource>[1]) => {
    setErr(null);
    try {
      await api.updateSource(s.key, patch);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <Toggle id={`src-${s.key}`} label={`Enable ${s.name}`} checked={s.enabled} onChange={(v) => save({ enabled: v })} />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink">{s.name}</div>
          <div className="flex items-center gap-1.5 text-xs text-ink-3">
            <StatusDot s={s.status} /> {STATUS_LABEL[s.status]} — {s.statusMessage}
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          Refresh every
          <input id={`int-${s.key}`} className={inp({ size: 'sm', w: 'w-20' })} inputMode="numeric" value={interval} onChange={(e) => setInterval_(e.target.value.replace(/\D/g, ''))} />
          min
          <Button size="sm" onClick={() => save({ intervalMinutes: Number(interval) })}>
            Save
          </Button>
        </label>
      </div>
      {s.key === 'public_web' && (
        <div className="mt-3">
          <Field label="Public pages / RSS feeds to monitor (one per line)" hint="Only publicly accessible URLs. robots.txt is checked before every fetch; logins, CAPTCHAs and paywalls are never bypassed." htmlFor="web-urls">
            <textarea id="web-urls" className="h-24 w-full rounded-md border border-line-strong bg-surface p-2 font-mono text-xs text-ink" value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://example-county.gov/bids/rss" />
          </Field>
          <Button size="sm" className="mt-2" onClick={() => save({ config: { seedUrls: urls.split(/\s+/).filter(Boolean) } })}>
            Save URLs
          </Button>
        </div>
      )}
      {s.key === 'state_local' && (
        <div className="mt-3">
          <Field
            label="Portal feeds (JSON)"
            hint='Each: {"name","state","sourceType":"STATE_PROCUREMENT|LOCAL_PROCUREMENT|EDUCATION|HEALTHCARE","format":"rss|json","url","organizationName","jsonItemsPath","fieldMap":{…}}'
            htmlFor="portals"
          >
            <textarea id="portals" className="h-32 w-full rounded-md border border-line-strong bg-surface p-2 font-mono text-xs text-ink" value={portals} onChange={(e) => setPortals(e.target.value)} />
          </Field>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => {
              try {
                const parsed = JSON.parse(portals);
                if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
                save({ config: { portals: parsed } });
              } catch (e) {
                setErr(`Invalid JSON: ${e instanceof Error ? e.message : e}`);
              }
            }}
          >
            Save portals
          </Button>
        </div>
      )}
      {s.key === 'sam_gov' && (
        <p className="mt-3 text-xs text-ink-3">
          The SAM.gov key is read from the server environment (<code className="font-mono">SAM_API_KEY</code>) and is never stored in the database or sent to the browser. Mind your key's daily request limit when lowering the interval — the connector stops at <code className="font-mono">SAM_DAILY_REQUEST_LIMIT</code>.
        </p>
      )}
      {err && <div className="mt-2 text-xs text-hot-ink">{err}</div>}
    </Card>
  );
}

function KeysAdmin() {
  const { api } = useApp();
  const { data } = useAsync(() => api.config(), []);
  if (!data) return <Spinner />;
  return (
    <Card>
      <CardHeader title="API keys & configuration" eyebrow="Set in the server .env — values are never shown here" />
      <ul className="flex flex-col divide-y divide-line">
        {data.keys.map((k) => (
          <li key={k.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div>
              <div className="font-mono text-xs text-ink">{k.name}</div>
              <div className="text-xs text-ink-3">{k.purpose}</div>
            </div>
            {k.configured ? (
              <Pill tone="low">
                <LuCircleCheck /> Configured
              </Pill>
            ) : (
              <Pill tone="muted">
                <LuCircleX /> Not configured
              </Pill>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-md bg-sunken p-3 text-xs text-ink-2">
        <b className="text-ink">AI provider:</b> {data.ai.message}. <b className="text-ink">Store:</b> {data.store}. <b className="text-ink">Scheduler:</b> {data.schedulerEnabled ? 'running' : 'off'}.
      </div>
    </Card>
  );
}

function useSettings() {
  const { api, toast } = useApp();
  const s = useAsync(() => api.settings(), []);
  const save = async (patch: Partial<AppSettings>, msg = 'Saved') => {
    try {
      s.setData(await api.updateSettings(patch));
      toast(msg);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  return { ...s, save };
}

function CategoriesAdmin() {
  const { data, save } = useSettings();
  const [name, setName] = useState('');
  if (!data) return <Spinner />;
  return (
    <Card>
      <CardHeader title="Hardware categories" eyebrow={`${data.categories.length} categories`} />
      <div className="flex flex-wrap gap-1.5">
        {data.categories.map((c) => (
          <Pill key={c} tone="outline">
            {c}
          </Pill>
        ))}
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save({ categories: [...data.categories, name.trim()] }, `Added ${name.trim()}`).then(() => setName(''));
        }}
      >
        <input id="new-cat" className={`${inputCls} max-w-xs`} value={name} onChange={(e) => setName(e.target.value)} placeholder="New category, e.g. Interactive Displays" aria-label="New category" />
        <Button type="submit" icon={<LuPlus />}>
          Add
        </Button>
      </form>
    </Card>
  );
}

function KeywordsAdmin() {
  const { data, save } = useSettings();
  const [kw, setKw] = useState('');
  const [ph, setPh] = useState('');
  useEffect(() => {
    if (data) {
      setKw(data.buyingKeywords.join('\n'));
      setPh(data.intentPhrases.join('\n'));
    }
  }, [data]);
  if (!data) return <Spinner />;
  return (
    <Card>
      <CardHeader title="Discovery vocabulary" eyebrow="Used to pre-filter public web pages before AI analysis" />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Buying & hardware keywords (one per line)" htmlFor="kw">
          <textarea id="kw" className="h-64 w-full rounded-md border border-line-strong bg-surface p-2 text-xs text-ink" value={kw} onChange={(e) => setKw(e.target.value)} />
        </Field>
        <Field label="Intent phrases (one per line)" htmlFor="ph">
          <textarea id="ph" className="h-64 w-full rounded-md border border-line-strong bg-surface p-2 text-xs text-ink" value={ph} onChange={(e) => setPh(e.target.value)} />
        </Field>
      </div>
      <Button className="mt-3" variant="primary" onClick={() => save({ buyingKeywords: kw.split('\n'), intentPhrases: ph.split('\n') }, 'Keywords saved')}>
        Save keywords
      </Button>
    </Card>
  );
}

const WEIGHT_LABELS: [keyof IntentWeights, string][] = [
  ['explicitProcurement', 'Explicit RFQ / RFP / ITB'],
  ['earlyProcurement', 'Sources sought / presolicitation'],
  ['plannedPurchase', 'Planned purchase'],
  ['exactProduct', 'Exact product (model / part #)'],
  ['genericProduct', 'Hardware category only'],
  ['quantity', 'Quantity specified'],
  ['deadline', 'Deadline specified'],
  ['deadlineUrgent', 'Extra if deadline ≤ 7 days'],
  ['usOrganization', 'U.S. organization'],
  ['contact', 'Buyer contact published'],
  ['organizationOnly', 'Organization identified (no contact)'],
  ['recentPublication', 'Published within 7 days'],
  ['budget', 'Budget stated'],
  ['news', 'News / article'],
  ['jobPosting', 'Job posting without procurement'],
  ['advertisement', 'Product advertisement'],
  ['historical', 'Historical / award only'],
  ['duplicate', 'Duplicate'],
  ['expired', 'Deadline passed'],
  ['nonUS', 'Non-U.S. buyer'],
  ['irrelevant', 'No hardware requirement'],
];

function RulesAdmin() {
  const { data, save } = useSettings();
  const [w, setW] = useState<Record<string, string>>({});
  const [t, setT] = useState({ hot: '', warm: '', low: '' });
  useEffect(() => {
    if (data) {
      setW(Object.fromEntries(Object.entries(data.intentWeights).map(([k, v]) => [k, String(v)])));
      setT({ hot: String(data.thresholds.hot), warm: String(data.thresholds.warm), low: String(data.thresholds.low) });
    }
  }, [data]);
  if (!data) return <Spinner />;
  return (
    <Card>
      <CardHeader title="Intent scoring rules" eyebrow="Explainable 0–100 score · applies to newly analysed documents" />
      <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
        {WEIGHT_LABELS.map(([k, label]) => (
          <label key={k} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm">
            <span className="text-ink-2">{label}</span>
            <input id={`w-${k}`} className={inp({ size: 'sm', w: 'w-20', extra: 'text-right font-mono' })} value={w[k] ?? ''} onChange={(e) => setW({ ...w, [k]: e.target.value.replace(/[^0-9-]/g, '') })} />
          </label>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {(['hot', 'warm', 'low'] as const).map((k) => (
          <Field key={k} label={`${k.toUpperCase()} threshold ≥`} htmlFor={`t-${k}`}>
            <input id={`t-${k}`} className={`${inputCls} font-mono`} value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value.replace(/\D/g, '') })} />
          </Field>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">Guards always apply regardless of weights: news, ads and job posts can't be HOT; planned purchases cap at WARM; awards are LOW (historical).</p>
      <Button
        className="mt-3"
        variant="primary"
        onClick={() =>
          save(
            { intentWeights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v)])) as unknown as IntentWeights, thresholds: { hot: Number(t.hot), warm: Number(t.warm), low: Number(t.low) } },
            'Scoring rules saved',
          )
        }
      >
        Save rules
      </Button>
    </Card>
  );
}



function UsersAdmin() {
  const { api, toast } = useApp();
  const { data, reload } = useAsync(() => api.users(), []);

  const [resetUser, setResetUser] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetting, setResetting] = useState(false);
const [createPassword, setCreatePassword] = useState('');
const [confirmCreatePassword, setConfirmCreatePassword] = useState('');
  const emptyForm = {
    name: '',
    email: '',
    role: 'SALES' as 'ADMIN' | 'SALES' | 'VIEWER',
  };

  const [f, setF] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!data) return <Spinner />;

  const cancelEdit = () => {
    setEditingId(null);
    setF(emptyForm);
  };

  const handleEdit = (u: (typeof data)[number]) => {
    setEditingId(u.id);
    setF({ name: u.name, email: u.email, role: u.role });
    document.getElementById('user-form')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  };

  const handleDelete = async (u: (typeof data)[number]) => {
    if (!window.confirm(`Delete user "${u.name}"? This action cannot be undone.`)) return;

    try {
      await api.deleteUser(u.id);
      if (editingId === u.id) cancelEdit();
      if (resetUser?.id === u.id) setResetUser(null);
      toast(`Deleted ${u.name}`);
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!editingId) {
      if (createPassword.length < 12 || createPassword.length > 256) {
        toast('Password must be 12–256 characters long');
        return;
      }

      if (createPassword !== confirmCreatePassword) {
        toast('Passwords do not match');
        return;
      }
    }

    setSaving(true);

    try {
      if (editingId) {
        await api.updateUser(editingId, f);
        toast(`Updated ${f.name}`);
      } else {
        await api.createUser({
          ...f,
          password: createPassword,
          confirmPassword: confirmCreatePassword,
        });
        toast(`Added ${f.name}`);
      }

      setCreatePassword('');
      setConfirmCreatePassword('');
      cancelEdit();
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resetUser || resetting) return;

    if (newPassword.length < 12 || newPassword.length > 256) {
      toast('Password must be 12–256 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast('Passwords do not match');
      return;
    }

    setResetting(true);
    try {
      await api.resetUserPassword(
        resetUser.id,
        newPassword,
        confirmPassword,
      );
      toast(`Password reset for ${resetUser.email}. All sessions were invalidated.`);
      setResetUser(null);
      setNewPassword('');
      setConfirmPassword('');
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Users"
        eyebrow="Manage users, password status and account access"
      />

      <ul className="flex flex-col divide-y divide-line">
        {data.map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ink">{u.name}</div>
              <div className="break-all text-ink-3">{u.email}</div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Pill tone={u.role === 'ADMIN' ? 'brand' : 'muted'}>
                  {u.role}
                </Pill>

                <Pill tone={u.passwordConfigured ? 'low' : 'muted'}>
                  {u.passwordConfigured ? 'Password configured' : 'Password not configured'}
                </Pill>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleEdit(u)}
              >
                Edit
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setResetUser({ id: u.id, name: u.name, email: u.email });
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                Reset password
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleDelete(u)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {resetUser && (
        <form
          className="mt-4 space-y-3 rounded-xl border border-line p-4"
          onSubmit={handlePasswordReset}
        >
          <div>
            <h3 className="font-semibold text-ink">Reset password</h3>
            <p className="mt-1 text-sm text-ink-3">
              Account: {resetUser.name} ({resetUser.email})
            </p>
            <p className="mt-1 text-xs text-ink-3">
              Resetting the password will invalidate all existing sessions for this account.
            </p>
          </div>

          <Field label="New password" htmlFor="reset-new-password">
            <input
              id="reset-new-password"
              className={inputCls}
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </Field>

          <Field label="Confirm new password" htmlFor="reset-confirm-password">
            <input
              id="reset-confirm-password"
              className={inputCls}
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={resetting}>
              {resetting ? 'Resetting...' : 'Confirm password reset'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={resetting}
              onClick={() => {
                setResetUser(null);
                setNewPassword('');
                setConfirmPassword('');
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <form
        id="user-form"
        className="mt-5 grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-[1fr_1fr_8rem_auto]"
        onSubmit={handleSubmit}
      >
        <div className="sm:col-span-full">
          <h3 className="font-semibold text-ink">
            {editingId ? 'Update User' : 'Add New User'}
          </h3>
          <p className="mt-1 text-sm text-ink-3">
            {editingId
              ? 'Edit the selected user details and save your changes.'
              : 'Enter details to create a new user.'}
          </p>
        </div>

        <input
          id="u-name"
          className={inputCls}
          placeholder="Name"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          required
          aria-label="Name"
        />

        <input
          id="u-email"
          type="email"
          className={inputCls}
          placeholder="Email"
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
          required
          aria-label="Email"
        />

        <select
          id="u-role"
          className={inputCls}
          value={f.role}
          onChange={(e) => setF({ ...f, role: e.target.value as typeof f.role })}
          aria-label="Role"
        >
          <option value="SALES">SALES</option>
          <option value="ADMIN">ADMIN</option>
          <option value="VIEWER">VIEWER</option>
        </select>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Update User' : 'Add User'}
          </Button>

          {editingId && (
            <Button
              type="button"
              variant="secondary"
              onClick={cancelEdit}
              disabled={saving}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}


