import { INTENT_META, MATCH_LABELS, PIPELINE_STAGES, PROCUREMENT_LABELS, SOURCE_TYPE_LABELS, type Field, type Opportunity, type PipelineStatus, type User } from '@etm/shared';
import { useEffect, useState, type ReactNode } from 'react';
import {
  LuArrowLeft, LuBookmark, LuBookmarkCheck, LuCheck, LuCopy, LuExternalLink, LuFileText, LuGitMerge, LuGlobe, LuMail, LuPhone, LuQuote,
  LuShieldCheck, LuSparkles, LuTarget, LuTrophy, LuCircleX, LuUserPlus, LuSend,
} from 'react-icons/lu';
import { ConfidencePill, DeadlineText, DemoBadge, IntentBadge, MatchPill, ProvenanceTag } from '../components/intel';
import { Button, Card, CardHeader, ErrorBox, Field as FormField, Modal, Pill, Spinner, inp } from '../components/ui';
import { useApp } from '../lib/appContext';
import { cn, copyText, dateTime, daysUntil, longDate, money, num, timeAgo } from '../lib/format';
import { useAsync, useNow } from '../lib/hooks';
import { Link, navigate } from '../lib/router';

function Fact({ label, children, prov }: { label: string; children: ReactNode; prov?: Opportunity['fieldProvenance'][string] }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
      {prov && prov !== 'UNKNOWN' && (
        <dd className="mt-1">
          <ProvenanceTag p={prov} />
        </dd>
      )}
    </div>
  );
}

function DetailRow({ label, f }: { label: string; f: Field<string> }) {
  return (
    <div className="grid gap-1 border-t border-line py-2 first:border-0 sm:grid-cols-[10rem_1fr]">
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="flex min-w-0 flex-wrap items-start gap-2 text-sm">
        {f.value ? (
          <>
            <span className="min-w-0 break-words text-ink">{f.value}</span>
            <ProvenanceTag p={f.provenance} />
          </>
        ) : (
          <span className="text-ink-3">Not stated in source</span>
        )}
      </div>
    </div>
  );
}

export function OpportunityDetail({ id }: { id: string }) {
  const { api, version, toast, refresh } = useApp();
  const now = useNow();
  const { data: o, error, reload, setData } = useAsync(() => api.getOpportunity(id), [id, version]);
  const { data: users } = useAsync(() => api.users(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [showDoc, setShowDoc] = useState(false);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!o) return <Spinner />;

  const run = async (key: string, fn: () => Promise<Opportunity>, msg: string) => {
    setBusy(key);
    try {
      setData(await fn());
      toast(msg);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const status = (s: PipelineStatus, msg: string) => run(s, () => api.setStatus(o.id, s), msg);
  const d = daysUntil(o.deadline);
  const hasContact = !!(o.buyerEmail || o.buyerPhone);
  const matchCount = o.productMatches.filter((m) => m.level !== 'NONE').length;
  const scorePos = o.scoreReasons.filter((r) => r.points > 0);
  const scoreNeg = o.scoreReasons.filter((r) => r.points < 0);
  const maxPts = Math.max(1, ...o.scoreReasons.map((r) => Math.abs(r.points)));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <button onClick={() => (history.length > 1 ? history.back() : navigate('/opportunities'))} className="inline-flex w-fit items-center gap-1 text-sm text-ink-3 hover:text-ink cursor-pointer">
        <LuArrowLeft /> Back
      </button>

      {o.status === 'MERGED' && (
        <div className="rounded-lg border border-line-strong bg-sunken p-3 text-sm text-ink-2">
          This record was merged as a duplicate.{' '}
          {o.mergedIntoId && (
            <Link to={`/opportunities/${o.mergedIntoId}`} className="font-semibold text-brand">
              Open the primary opportunity →
            </Link>
          )}
        </div>
      )}

      {/* ------------------------------------------------ header */}
      <Card pad={false} className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center gap-2 rounded-md px-2.5 py-1 font-display text-lg font-semibold tnum', { HOT: 'bg-hot-soft text-hot-ink', WARM: 'bg-warm-soft text-warm-ink', LOW: 'bg-low-soft text-low-ink', IRRELEVANT: 'bg-muted-soft text-ink-2' }[o.intentLevel])}>
            {INTENT_META[o.intentLevel].emoji} {INTENT_META[o.intentLevel].label.toUpperCase()} — {o.intentScore}/100
          </span>
          <Pill tone="outline">{PROCUREMENT_LABELS[o.procurementType]}</Pill>
          <MatchPill level={o.matchLevel} score={o.matchScore} />
          {o.isDemo && <DemoBadge />}
          {o.saved && <Pill tone="brand">SAVED</Pill>}
          <Pill tone="muted">{o.status}</Pill>
        </div>
        <h1 className="mt-3 font-display text-xl font-semibold leading-snug text-ink sm:text-2xl">{o.title}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
          <Fact label="Need" prov={o.fieldProvenance.quantity}>
            {o.requirementSummary}
          </Fact>
          <Fact label="Organization" prov={o.fieldProvenance.organizationName}>
            {o.organizationName ?? <span className="text-ink-3">Not identified</span>}
          </Fact>
          <Fact label="Location" prov={o.fieldProvenance.state}>
            {[o.city, o.state].filter(Boolean).join(', ') || <span className="text-ink-3">Unknown</span>}
          </Fact>
          <Fact label="Posted">{o.publishedAt ? longDate(o.publishedAt) : <span className="text-ink-3">Date not published</span>}</Fact>
          <Fact label="Discovered">
            <span className="tnum" title={dateTime(o.discoveredAt)}>
              {timeAgo(o.discoveredAt, now)}
            </span>
          </Fact>
          <Fact label="Deadline" prov={o.fieldProvenance.deadline}>
            {o.deadline ? (
              <span className={cn('tnum', d !== null && d <= 3 && d >= 0 && 'font-semibold text-hot-ink')}>
                {longDate(o.deadline)} <span className="text-ink-3">({d! < 0 ? 'passed' : `${d}d`})</span>
              </span>
            ) : (
              <span className="text-ink-3">Not stated</span>
            )}
          </Fact>
        </dl>

        {/* actions */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="primary" icon={<LuMail />} onClick={() => setContactOpen(true)}>
            CONTACT BUYER
          </Button>
          <Button icon={<LuFileText />} onClick={() => setQuoteOpen(true)}>
            CREATE QUOTE
          </Button>
          <Button icon={o.saved ? <LuBookmarkCheck /> : <LuBookmark />} loading={busy === 'save'} onClick={() => run('save', () => api.save(o.id, !o.saved), o.saved ? 'Removed from saved leads' : 'Lead saved')}>
            {o.saved ? 'SAVED' : 'SAVE LEAD'}
          </Button>
          <label className="inline-flex items-center gap-1.5">
            <LuUserPlus className="text-ink-3" aria-hidden />
            <select
              id="assign-owner"
              className={inp({ w: 'w-auto' })}
              value={o.owner ?? ''}
              onChange={(e) => run('assign', () => api.assign(o.id, e.target.value || null), e.target.value ? `Assigned to ${e.target.value}` : 'Unassigned')}
              aria-label="Assign owner"
            >
              <option value="">ASSIGN…</option>
              {(users ?? []).map((u: User) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button size="sm" variant="quiet" icon={<LuSend />} loading={busy === 'CONTACTED'} onClick={() => status('CONTACTED', 'Marked contacted')}>
              MARK CONTACTED
            </Button>
            <Button size="sm" variant="quiet" icon={<LuFileText />} loading={busy === 'QUOTED'} onClick={() => status('QUOTED', 'Marked quoted')}>
              MARK QUOTED
            </Button>
            <Button size="sm" variant="quiet" icon={<LuTrophy />} loading={busy === 'WON'} onClick={() => status('WON', 'Marked won')}>
              WON
            </Button>
            <Button size="sm" variant="quiet" icon={<LuCircleX />} loading={busy === 'LOST'} onClick={() => status('LOST', 'Marked lost')}>
              LOST
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------------------------ main */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card accent="brand">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="eyebrow mb-2">Why this opportunity matters</div>
                <ul className="flex flex-col gap-1.5">
                  {o.whyItMatters.map((w) => (
                    <li key={w} className="flex items-start gap-2 text-sm text-ink">
                      <LuCheck className="mt-0.5 shrink-0 text-low" /> {w}
                    </li>
                  ))}
                  {o.whyItMatters.length === 0 && <li className="text-sm text-ink-3">No commercial signals found.</li>}
                </ul>
              </div>
              <div className="rounded-md bg-brand-soft p-3">
                <div className="eyebrow mb-1 flex items-center gap-1 text-brand-strong">
                  <LuTarget /> Next best action
                </div>
                <p className="text-sm font-medium text-ink">{o.nextAction}</p>
                {o.estimatedOpportunityValue != null && (
                  <div className="mt-3 border-t border-line pt-2 text-xs text-ink-2">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg font-semibold text-ink tnum">{money(o.estimatedOpportunityValue)}</span>
                      <ProvenanceTag p={o.fieldProvenance.estimatedOpportunityValue} />
                    </div>
                    <div className="text-ink-3">{o.estimatedValueBasis}</div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Requirement" eyebrow={`Buying signal: ${PROCUREMENT_LABELS[o.procurementType]}`} />
            {o.items.length === 0 ? (
              <div className="text-sm text-ink-3">No hardware line items were identified in the source.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
                    <tr>
                      <th className="py-1.5 pr-3 text-right font-semibold">Qty</th>
                      <th className="py-1.5 pr-3 font-semibold">Item</th>
                      <th className="py-1.5 pr-3 font-semibold">Category</th>
                      <th className="py-1.5 pr-3 font-semibold">Brand / model</th>
                      <th className="py-1.5 pr-3 font-semibold">Part #</th>
                      <th className="py-1.5 font-semibold">Provenance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.items.map((it, i) => (
                      <tr key={i} className="border-t border-line align-top">
                        <td className="py-2 pr-3 text-right font-mono tnum">{it.quantity != null ? num(it.quantity) : <span className="text-ink-3">—</span>}</td>
                        <td className="py-2 pr-3 text-ink">
                          {it.description}
                          {it.specs && <div className="text-xs text-ink-3">{it.specs}</div>}
                        </td>
                        <td className="py-2 pr-3 text-ink-2">{it.category ?? '—'}</td>
                        <td className="py-2 pr-3 text-ink-2">{[it.brand, it.model].filter(Boolean).join(' ') || <span className="text-ink-3">Not specified</span>}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-ink-2">{it.partNumber ?? '—'}</td>
                        <td className="py-2">
                          <ProvenanceTag p={it.provenance} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4">
              <DetailRow label="Specifications" f={o.requirementDetails.specifications} />
              <DetailRow label="Delivery location" f={o.requirementDetails.deliveryLocation} />
              <DetailRow label="Warranty" f={o.requirementDetails.warranty} />
              <DetailRow label="Installation" f={o.requirementDetails.installation} />
              <DetailRow label="Support" f={o.requirementDetails.support} />
              <DetailRow label="Vendor requirements" f={o.requirementDetails.vendorRequirements} />
              <DetailRow label="Certifications" f={o.requirementDetails.certifications} />
              <DetailRow label="Budget" f={{ value: o.budget != null ? money(o.budget) : null, provenance: o.fieldProvenance.budget ?? 'UNKNOWN' }} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="AI summary"
              eyebrow={`Analyzed by ${o.aiProvider}`}
              right={<ProvenanceTag p="AI_INFERENCE" />}
            />
            <p className="text-[15px] leading-relaxed text-ink">“{o.aiSummary}”</p>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-ink-3 hover:text-ink">Reasoning & grounding checks ({o.aiReasoning.length})</summary>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs text-ink-2">
                {o.aiReasoning.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </details>
          </Card>

          <Card>
            <CardHeader title="Intent score" eyebrow="Explainable scoring" right={<IntentBadge level={o.intentLevel} score={o.intentScore} />} />
            <div className="grid gap-4 md:grid-cols-2">
              <ul className="flex flex-col gap-1.5">
                {[...scorePos, ...scoreNeg].map((r) => (
                  <li key={r.code + r.label} className="grid grid-cols-[1fr_5rem_2.5rem] items-center gap-2 text-sm">
                    <span className={cn('flex items-start gap-1.5', r.points < 0 ? 'text-hot-ink' : 'text-ink')}>
                      {r.points > 0 ? <LuCheck className="mt-0.5 shrink-0 text-low" /> : <LuCircleX className="mt-0.5 shrink-0" />}
                      {r.label}
                    </span>
                    <span className="h-2 rounded-sm bg-sunken">
                      <span className="block h-2 rounded-sm" style={{ width: `${(Math.abs(r.points) / maxPts) * 100}%`, background: r.points > 0 ? 'var(--color-low)' : 'var(--color-hot)' }} />
                    </span>
                    <span className={cn('text-right font-mono text-xs tnum', r.points > 0 ? 'text-low-ink' : 'text-hot-ink')}>
                      {r.points > 0 ? '+' : ''}
                      {r.points}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2 rounded-md bg-sunken p-3 text-xs text-ink-2">
                <div className="flex justify-between">
                  <span>Intent score (capped 0–100)</span>
                  <b className="font-mono text-ink tnum">{o.intentScore}</b>
                </div>
                <div className="flex justify-between">
                  <span>Urgency — {o.urgencyLabel}</span>
                  <b className="font-mono text-ink tnum">{o.urgencyScore}</b>
                </div>
                <div className="flex justify-between">
                  <span>Catalog match</span>
                  <b className="font-mono text-ink tnum">{o.matchScore}%</b>
                </div>
                <div className="flex justify-between border-t border-line pt-2">
                  <span>Overall opportunity score</span>
                  <b className="font-mono text-ink tnum">{o.overallOpportunityScore}</b>
                </div>
                <div className="text-ink-3">Overall = 55% intent + 15% urgency + 30% match. Levels are also gated by document type: news, ads and job posts can never be HOT.</div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={matchCount ? `${matchCount} ETechMatter product${matchCount === 1 ? '' : 's'} match` : 'No catalog match'}
              eyebrow="Product match"
              right={<span className="font-display text-lg font-semibold text-ink tnum">Match: {o.matchScore}%</span>}
            />
            {o.productMatches.length === 0 ? (
              <p className="text-sm text-ink-3">
                Nothing in the catalog serves this requirement yet. <Link to="/products" className="text-brand">Add products</Link> and re-run matching.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
                    <tr>
                      <th className="py-1.5 pr-3 font-semibold">ETechMatter product</th>
                      <th className="py-1.5 pr-3 font-semibold">Match</th>
                      <th className="py-1.5 pr-3 font-semibold">Why</th>
                      <th className="py-1.5 text-right font-semibold">Catalog price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.productMatches.map((m) => (
                      <tr key={m.productId} className="border-t border-line align-top">
                        <td className="py-2 pr-3">
                          <div className="font-medium text-ink">
                            {m.manufacturer} {m.model}
                          </div>
                          <div className="font-mono text-[11px] text-ink-3">
                            {m.sku}
                            {m.partNumber ? ` · ${m.partNumber}` : ''}
                          </div>
                        </td>
                        <td className="py-2 pr-3" title={MATCH_LABELS[m.level]}>
                          <MatchPill level={m.level} score={m.score} />
                        </td>
                        <td className="py-2 pr-3 text-xs text-ink-2">{m.reason}</td>
                        <td className="py-2 text-right font-mono text-xs tnum">{money(m.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Source evidence" eyebrow="Verify before you quote" right={<Pill tone="verified"><LuShieldCheck /> {o.evidence.length} snippet{o.evidence.length === 1 ? '' : 's'}</Pill>} />
            <ul className="flex flex-col gap-3">
              {o.evidence.map((e) => (
                <li key={e.id} className="rounded-md border border-line bg-sunken p-3">
                  <div className="flex items-start gap-2">
                    <LuQuote className="mt-0.5 shrink-0 text-ink-3" />
                    <p className="text-sm text-ink">{e.snippet}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-6 text-[11px] text-ink-3 tnum">
                    {e.field && <span className="font-mono">{e.field}</span>}
                    <span>{e.sourceName}</span>
                    <span>Published {e.publishedAt ? longDate(e.publishedAt) : 'unknown'}</span>
                    <span>Retrieved {dateTime(e.retrievedAt)}</span>
                    {e.sourceUrl && (
                      <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="text-brand">
                        Open source ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <button className="mt-3 text-xs font-medium text-brand cursor-pointer" onClick={() => setShowDoc(!showDoc)}>
              {showDoc ? 'Hide' : 'Show'} full retrieved document
            </button>
            {showDoc && <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-sunken p-3 font-mono text-xs text-ink-2">{o.description}</pre>}
          </Card>
        </div>

        {/* ------------------------------------------------ rail */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Source" eyebrow="Where this came from" />
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Source</dt>
                <dd className="text-right font-medium text-ink">{o.source}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Source type</dt>
                <dd className="text-right text-ink">{SOURCE_TYPE_LABELS[o.sourceType]}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Confidence</dt>
                <dd>
                  <ConfidencePill c={o.sourceConfidence} />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Source ID</dt>
                <dd className="truncate font-mono text-xs text-ink-2">{o.sourceId}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Last checked</dt>
                <dd className="text-xs text-ink-2 tnum">{timeAgo(o.lastCheckedAt, now)}</dd>
              </div>
            </dl>
            {o.sourceUrl ? (
              <a href={o.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-line-strong px-3 py-2 text-sm font-semibold text-ink hover:border-brand hover:text-brand">
                <LuExternalLink /> OPEN ORIGINAL
              </a>
            ) : (
              <div className="mt-3 rounded-md bg-demo-soft p-2.5 text-xs text-demo-ink">
                DEMO record — a fictional sample document. There is no live original to open.
              </div>
            )}
            {o.mergedSources.length > 0 && (
              <div className="mt-3 border-t border-line pt-2">
                <div className="eyebrow mb-1">Also reported by</div>
                <ul className="flex flex-col gap-1 text-xs">
                  {o.mergedSources.map((m) => (
                    <li key={m.sourceId} className="text-ink-2">
                      {m.sourceUrl ? (
                        <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="text-brand">
                          {m.source} ↗
                        </a>
                      ) : (
                        m.source
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Buyer" eyebrow="Only publicly stated contacts" />
            <div className="text-sm">
              <div className="font-medium text-ink">{o.organizationName ?? 'Organization not identified'}</div>
              <div className="text-xs text-ink-3">{o.organizationType}</div>
              {o.organizationWebsite && (
                <a href={o.organizationWebsite} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-brand">
                  <LuGlobe /> {o.organizationWebsite.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
            {o.contacts.length === 0 ? (
              <p className="mt-3 rounded-md bg-sunken p-2.5 text-xs text-ink-2">Organization identified — contact not publicly available.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {o.contacts.map((c, i) => (
                  <li key={i} className="rounded-md border border-line p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{c.name ?? c.role ?? 'Listed contact'}</span>
                      <ProvenanceTag p={c.provenance} />
                    </div>
                    {(c.title || (c.name && c.role)) && <div className="text-xs text-ink-3">{[c.title, c.name ? c.role : null].filter(Boolean).join(' · ')}</div>}
                    {c.email && <CopyLine icon={<LuMail />} text={c.email} />}
                    {c.phone && <CopyLine icon={<LuPhone />} text={c.phone} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <PipelineCard o={o} onSaved={(n) => { setData(n); toast('Pipeline updated'); refresh(); }} />

          {o.duplicateCandidates.length > 0 && (
            <Card accent="warm">
              <CardHeader title="Possible duplicate" eyebrow="Same requirement, another source" />
              <ul className="flex flex-col gap-3">
                {o.duplicateCandidates.map((d) => (
                  <li key={d.opportunityId} className="text-sm">
                    <Link to={`/opportunities/${d.opportunityId}`} className="font-medium text-ink hover:text-brand">
                      {d.title}
                    </Link>
                    <div className="text-xs text-ink-3">
                      {d.sourceName} · similarity <span className="font-mono tnum">{Math.round(d.score * 100)}%</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.reasons.map((r) => (
                        <Pill key={r} tone="muted">
                          {r}
                        </Pill>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="primary" icon={<LuGitMerge />} loading={busy === 'merge'} onClick={() => run('merge', () => api.merge(o.id, d.opportunityId), 'Merged — evidence from both sources kept').then(refresh)}>
                        MERGE
                      </Button>
                      <Button size="sm" onClick={() => run('dismiss', () => api.dismissDuplicate(o.id, d.opportunityId), 'Marked as not a duplicate')}>
                        Not a duplicate
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <NotesCard o={o} onChange={setData} />
        </div>
      </div>

      <Modal open={contactOpen} onClose={() => setContactOpen(false)} title="Contact buyer">
        {hasContact ? (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-ink-2">
              Contact published in the source for <b className="text-ink">{o.organizationName}</b>:
            </p>
            {o.buyerName && (
              <div className="font-medium text-ink">
                {o.buyerName}
                {o.buyerTitle ? `, ${o.buyerTitle}` : ''}
              </div>
            )}
            {o.buyerEmail && <CopyLine icon={<LuMail />} text={o.buyerEmail} />}
            {o.buyerPhone && <CopyLine icon={<LuPhone />} text={o.buyerPhone} />}
            <FormField label="Suggested opening line">
              <textarea
                id="contact-draft"
                readOnly
                className="h-28 w-full rounded-md border border-line bg-sunken p-2 text-xs text-ink-2"
                value={`Hello${o.buyerName ? ` ${o.buyerName.split(' ')[0]}` : ''},\n\nETechMatter is an authorized IT hardware supplier. Regarding "${o.title}", we can supply ${o.requirementSummary.replace(/^Seeking /, '')}${o.deadline ? ` and respond before ${longDate(o.deadline)}` : ''}. Could you confirm the final specifications and preferred quote format?\n\nBest regards,\nETechMatter Sales · etechmatter.com`}
              />
            </FormField>
            {o.isDemo && <div className="rounded-md bg-demo-soft p-2 text-xs text-demo-ink">This is DEMO DATA — the contact is fictional (*.example addresses do not exist).</div>}
            <div className="flex justify-end gap-2">
              {o.buyerEmail && (
                <a className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3.5 text-sm font-medium text-white" href={`mailto:${o.buyerEmail}?subject=${encodeURIComponent(`RE: ${o.title}`)}`}>
                  <LuMail /> Open email app
                </a>
              )}
              <Button onClick={() => status('CONTACTED', 'Marked contacted').then(() => setContactOpen(false))}>Mark contacted</Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-ink-2">
            <p>
              <b className="text-ink">Organization identified — contact not publicly available.</b> ETechMatter Intelligence never guesses personal contact details.
            </p>
            <p className="mt-2">Next step: open the original notice and respond through the issuing portal, or reach the organization's general procurement office.</p>
            {o.sourceUrl && (
              <a href={o.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-semibold text-brand">
                Open original <LuExternalLink />
              </a>
            )}
          </div>
        )}
      </Modal>
      <QuoteModal o={o} open={quoteOpen} onClose={() => setQuoteOpen(false)} onSaved={(n) => { setData(n); toast('Quote recorded and marked QUOTED'); refresh(); }} />
    </div>
  );
}

function CopyLine({ icon, text }: { icon: ReactNode; text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="mt-1 flex items-center gap-2 text-sm">
      <span className="text-ink-3">{icon}</span>
      <span className="min-w-0 select-all break-all font-mono text-xs text-ink">{text}</span>
      <button
        className="ml-auto rounded p-1 text-ink-3 hover:bg-sunken hover:text-ink cursor-pointer"
        aria-label={`Copy ${text}`}
        onClick={async () => {
          setOk(await copyText(text));
          setTimeout(() => setOk(false), 1500);
        }}
      >
        {ok ? <LuCheck className="text-low" /> : <LuCopy />}
      </button>
    </div>
  );
}

function PipelineCard({ o, onSaved }: { o: Opportunity; onSaved: (o: Opportunity) => void }) {
  const { api } = useApp();
  const [form, setForm] = useState({ nextFollowUp: '', expectedCloseDate: '', quoteValue: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setForm({ nextFollowUp: o.nextFollowUp?.slice(0, 10) ?? '', expectedCloseDate: o.expectedCloseDate?.slice(0, 10) ?? '', quoteValue: o.quoteValue?.toString() ?? '' });
  }, [o.id, o.nextFollowUp, o.expectedCloseDate, o.quoteValue]);
  const stageIdx = PIPELINE_STAGES.findIndex((s) => s.key === o.status);
  return (
    <Card>
      <CardHeader title="Sales pipeline" eyebrow={o.owner ? `Owner: ${o.owner}` : 'Unassigned'} />
      <ol className="mb-3 flex flex-wrap gap-1">
        {PIPELINE_STAGES.map((s, i) => (
          <li key={s.key}>
            <button
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide cursor-pointer',
                s.key === o.status ? (s.key === 'LOST' ? 'bg-hot text-white' : 'bg-brand text-white') : i < stageIdx && o.status !== 'LOST' ? 'bg-brand-soft text-brand-strong' : 'bg-sunken text-ink-3',
              )}
              onClick={() => api.setStatus(o.id, s.key).then(onSaved)}
              aria-current={s.key === o.status}
            >
              {s.label.toUpperCase()}
            </button>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Next follow-up" htmlFor="pl-follow">
          <input id="pl-follow" type="date" className={inp({ size: 'sm' })} value={form.nextFollowUp} onChange={(e) => setForm({ ...form, nextFollowUp: e.target.value })} />
        </FormField>
        <FormField label="Expected close" htmlFor="pl-close">
          <input id="pl-close" type="date" className={inp({ size: 'sm' })} value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} />
        </FormField>
        <FormField label="Quote value (USD)" htmlFor="pl-quote">
          <input id="pl-quote" inputMode="decimal" className={inp({ size: 'sm' })} value={form.quoteValue} onChange={(e) => setForm({ ...form, quoteValue: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="0" />
        </FormField>
        <FormField label="Last contacted">
          <div className="flex h-9 items-center text-xs text-ink-2 tnum">{o.lastContactedAt ? dateTime(o.lastContactedAt) : 'Not yet'}</div>
        </FormField>
      </div>
      <Button
        className="mt-3 w-full"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            onSaved(
              await api.updatePipeline(o.id, {
                nextFollowUp: form.nextFollowUp ? new Date(form.nextFollowUp + 'T15:00:00').toISOString() : null,
                expectedCloseDate: form.expectedCloseDate ? new Date(form.expectedCloseDate + 'T15:00:00').toISOString() : null,
                quoteValue: form.quoteValue ? Number(form.quoteValue) : null,
              }),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Save pipeline details
      </Button>
    </Card>
  );
}

function NotesCard({ o, onChange }: { o: Opportunity; onChange: (o: Opportunity) => void }) {
  const { api } = useApp();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title="Notes & activity" />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          setBusy(true);
          try {
            onChange(await api.addNote(o.id, body));
            setBody('');
          } finally {
            setBusy(false);
          }
        }}
      >
        <textarea id="note-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note — call outcome, spec clarifications, competitor intel…" className="h-20 w-full rounded-md border border-line-strong bg-surface p-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none" />
        <div className="mt-2 flex justify-end">
          <Button size="sm" type="submit" variant="primary" loading={busy} disabled={!body.trim()}>
            Add note
          </Button>
        </div>
      </form>
      <ul className="mt-3 flex flex-col gap-2">
        {o.notes.map((n) => (
          <li key={n.id} className="rounded-md bg-sunken p-2 text-sm">
            <div className="text-ink">{n.body}</div>
            <div className="mt-0.5 text-[11px] text-ink-3">
              {n.author} · {timeAgo(n.createdAt)}
            </div>
          </li>
        ))}
      </ul>
      <ol className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
        {o.activities.slice(0, 12).map((a) => (
          <li key={a.id} className="flex gap-2 text-xs">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
            <span className="text-ink-2">
              <b className="font-medium text-ink">{a.detail}</b> · {a.actor} · {timeAgo(a.createdAt)}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function QuoteModal({ o, open, onClose, onSaved }: { o: Opportunity; open: boolean; onClose: () => void; onSaved: (o: Opportunity) => void }) {
  const { api } = useApp();
  const lines = o.items.map((it) => {
    const m = o.productMatches.find((pm) => pm.requestedItem === it.description) ?? o.productMatches.find((pm) => pm.category === it.category);
    return { it, m, qty: it.quantity ?? 0, price: m?.price ?? 0 };
  });
  const [prices, setPrices] = useState<number[]>([]);
  useEffect(() => setPrices(lines.map((l) => l.price)), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = lines.reduce((s, l, i) => s + l.qty * (prices[i] ?? 0), 0);
  const text = [
    `QUOTATION — ETechMatter (etechmatter.com)`,
    `Re: ${o.title}${o.deadline ? ` · due ${longDate(o.deadline)}` : ''}`,
    `To: ${o.organizationName ?? 'Buyer'}`,
    '',
    ...lines.map((l, i) => `${l.qty || 'TBD'} × ${l.m ? `${l.m.manufacturer} ${l.m.model} (${l.m.sku})` : l.it.description} @ ${money(prices[i] ?? 0)} = ${money(l.qty * (prices[i] ?? 0))}`),
    '',
    `TOTAL: ${money(total)} (draft — confirm pricing, freight and tax before sending)`,
  ].join('\n');
  return (
    <Modal open={open} onClose={onClose} title="Create quote draft" wide>
      {o.items.length === 0 ? (
        <p className="text-sm text-ink-3">No line items were identified, so a quote draft can't be pre-filled.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="py-1 pr-2 font-semibold">Requested</th>
                <th className="py-1 pr-2 font-semibold">Proposed product</th>
                <th className="py-1 pr-2 text-right font-semibold">Qty</th>
                <th className="py-1 pr-2 text-right font-semibold">Unit price</th>
                <th className="py-1 text-right font-semibold">Line total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-2 pr-2 text-ink-2">{l.it.description}</td>
                  <td className="py-2 pr-2 text-ink">{l.m ? `${l.m.manufacturer} ${l.m.model}` : <span className="text-ink-3">No catalog match</span>}</td>
                  <td className="py-2 pr-2 text-right font-mono tnum">{l.qty ? num(l.qty) : 'TBD'}</td>
                  <td className="py-2 pr-2 text-right">
                    <input
                      id={`qp-${i}`}
                      aria-label={`Unit price for ${l.it.description}`}
                      inputMode="decimal"
                      className={inp({ size: 'sm', w: 'w-24', extra: 'text-right' })}
                      value={prices[i] ?? 0}
                      onChange={(e) => setPrices(prices.map((p, j) => (j === i ? Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 : p)))}
                    />
                  </td>
                  <td className="py-2 text-right font-mono tnum">{money(l.qty * (prices[i] ?? 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong">
                <td colSpan={4} className="py-2 text-right font-semibold">
                  Total
                </td>
                <td className="py-2 text-right font-mono font-semibold tnum">{money(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-3">Unit prices start from the catalog (demo prices are placeholders). Quantities come from the source; “TBD” means the buyer didn't state one.</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button icon={<LuCopy />} onClick={() => copyText(text)}>
          Copy quote text
        </Button>
        <Button
          variant="primary"
          icon={<LuSparkles />}
          onClick={async () => {
            await api.updatePipeline(o.id, { quoteValue: Math.round(total) });
            onSaved(await api.setStatus(o.id, 'QUOTED'));
            onClose();
          }}
        >
          Save quote ({money(total)}) & mark QUOTED
        </Button>
      </div>
    </Modal>
  );
}
