import { HARDWARE_CATEGORIES, PRODUCT_CSV_TEMPLATE } from '@etm/shared';
import { useState } from 'react';
import { LuPlus, LuRefreshCw, LuTrash2, LuUpload } from 'react-icons/lu';
import { DemoBadge } from '../components/intel';
import { Button, Card, CardHeader, ErrorBox, Field, Modal, Spinner, inputCls } from '../components/ui';
import { useApp } from '../lib/appContext';
import { money } from '../lib/format';
import { useAsync } from '../lib/hooks';

const EMPTY = { sku: '', manufacturer: '', model: '', partNumber: '', category: 'Laptops', description: '', specifications: '', price: '', availability: 'In stock', moq: '1', warranty: '', url: '' };

export function Products() {
  const { api, version, toast, refresh } = useApp();
  const { data, error, reload } = useAsync(() => api.products(), [version]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [csv, setCsv] = useState(PRODUCT_CSV_TEMPLATE);
  const [replaceDemo, setReplaceDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const rows = data.filter((p) => !q || `${p.sku} ${p.manufacturer} ${p.model} ${p.partNumber ?? ''} ${p.category}`.toLowerCase().includes(q.toLowerCase()));
  const demoCount = data.filter((p) => p.isDemo).length;

  const rematch = async () => {
    setBusy(true);
    try {
      const r = await api.rematch();
      toast(`Re-matched ${r.rematched} opportunities against the catalog`);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">What ETechMatter can supply</div>
          <h1 className="font-display text-2xl font-semibold text-ink">Product catalog</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<LuRefreshCw />} loading={busy} onClick={rematch}>
            Re-run matching
          </Button>
          <Button icon={<LuUpload />} onClick={() => setImporting(true)}>
            Import CSV
          </Button>
          <Button variant="primary" icon={<LuPlus />} onClick={() => setAdding(true)}>
            Add product
          </Button>
        </div>
      </div>
      {demoCount > 0 && (
        <div className="rounded-lg border border-demo bg-demo-soft px-4 py-2.5 text-sm text-demo-ink">
          {demoCount} DEMO catalog items with placeholder prices are loaded so matching works today. Import your real catalog (CSV) and tick “replace demo items”.
        </div>
      )}
      <input id="prod-filter" className={`${inputCls} max-w-sm`} placeholder="Filter by SKU, brand, model, part number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter products" />
      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-sunken text-left text-[11px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="px-3 py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 font-semibold">Product</th>
                <th className="px-3 py-2 font-semibold">Part #</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold">Specifications</th>
                <th className="px-3 py-2 text-right font-semibold">Price</th>
                <th className="px-3 py-2 font-semibold">Availability</th>
                <th className="px-3 py-2 text-right font-semibold">MOQ</th>
                <th className="px-3 py-2 font-semibold">Warranty</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-line align-top">
                  <td className="px-3 py-2 font-mono text-xs text-ink-2">{p.sku}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">
                      {p.manufacturer} {p.model} {p.isDemo && <DemoBadge />}
                    </div>
                    <div className="text-xs text-ink-3">{p.description}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-2">{p.partNumber ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-2">{p.category}</td>
                  <td className="px-3 py-2 text-xs text-ink-2">{p.specifications ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tnum">{money(p.price)}</td>
                  <td className="px-3 py-2 text-xs text-ink-2">{p.availability ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs tnum">{p.moq ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-ink-2">{p.warranty ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {confirmDel === p.id ? (
                      <span className="inline-flex gap-1">
                        <Button size="sm" variant="danger" onClick={() => api.deleteProduct(p.id).then(() => { setConfirmDel(null); reload(); toast('Product removed'); })}>
                          Delete
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDel(null)}>
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <button className="rounded p-1 text-ink-3 hover:bg-sunken hover:text-hot cursor-pointer" aria-label={`Remove ${p.sku}`} onClick={() => setConfirmDel(p.id)}>
                        <LuTrash2 />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add product" wide>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.createProduct({ ...form, price: form.price ? Number(form.price) : null, moq: form.moq ? Number(form.moq) : null });
              toast(`Added ${form.manufacturer} ${form.model}`);
              setForm(EMPTY);
              setAdding(false);
              reload();
            } catch (err) {
              toast(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {(
            [
              ['sku', 'SKU *'], ['manufacturer', 'Manufacturer *'], ['model', 'Model *'], ['partNumber', 'Part number'], ['description', 'Description'],
              ['specifications', 'Specifications'], ['price', 'Price (USD)'], ['availability', 'Availability'], ['moq', 'MOQ'], ['warranty', 'Warranty'], ['url', 'Product URL'],
            ] as [keyof typeof EMPTY, string][]
          ).map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`p-${k}`}>
              <input id={`p-${k}`} className={inputCls} value={form[k]} required={label.endsWith('*')} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </Field>
          ))}
          <Field label="Category *" htmlFor="p-category">
            <select id="p-category" className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {HARDWARE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>
              Save product
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={importing} onClose={() => setImporting(false)} title="Import catalog CSV" wide>
        <p className="text-sm text-ink-2">
          Columns: <code className="font-mono text-xs">sku, manufacturer, model, part_number, category, description, specifications, price, availability, moq, warranty, url</code>. Existing SKUs are updated.
        </p>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          className="mt-3 block text-sm text-ink-2"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) f.text().then(setCsv);
          }}
        />
        <textarea id="csv-text" className="mt-3 h-44 w-full rounded-md border border-line-strong bg-surface p-2 font-mono text-xs text-ink" value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="CSV content" />
        <label className="mt-2 flex items-center gap-2 text-sm text-ink-2">
          <input id="replace-demo" type="checkbox" checked={replaceDemo} onChange={(e) => setReplaceDemo(e.target.checked)} /> Replace demo catalog items
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setImporting(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api.importProducts(csv, replaceDemo);
                toast(`Imported ${r.imported} of ${r.total} rows${r.errors.length ? ` · ${r.errors.length} skipped` : ''}`);
                setImporting(false);
                reload();
                await rematch();
              } catch (err) {
                toast(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Import and re-match
          </Button>
        </div>
      </Modal>
      <Card>
        <CardHeader title="How matching works" />
        <ul className="grid gap-2 text-sm text-ink-2 md:grid-cols-4">
          <li><b className="text-ink">Exact</b> — same part number, or same manufacturer + model (buyer: Dell PowerEdge R760 → you: R760).</li>
          <li><b className="text-ink">High</b> — same brand & category with no model named, same model in another configuration, or a brand-agnostic requirement.</li>
          <li><b className="text-ink">Alternative</b> — same category, different model in the family (Catalyst 9300 → 9200) or a different brand.</li>
          <li><b className="text-ink">No match</b> — nothing in the catalog serves the line item. The opportunity score is the average of each line item's best match.</li>
        </ul>
      </Card>
    </div>
  );
}
