// Sales-intelligence building blocks: intent, provenance, source, match, deadline, opportunity card.
import { INTENT_META, MATCH_LABELS, PROCUREMENT_LABELS, SOURCE_TYPE_LABELS, type IntentLevel, type MatchLevel, type OpportunitySummary, type Provenance, type SourceConfidence } from '@etm/shared';
import { LuArrowUpRight, LuCalendar, LuCopy, LuFlame, LuMapPin, LuPackage, LuRadioTower } from 'react-icons/lu';
import { cn, daysUntil, deadlineTone, num, shortDate, timeAgo } from '../lib/format';
import { Link } from '../lib/router';
import { Pill, type Tone } from './ui';

export const INTENT_TONE: Record<IntentLevel, Tone> = { HOT: 'hot', WARM: 'warm', LOW: 'low', IRRELEVANT: 'muted' };
const DOT: Record<IntentLevel, string> = { HOT: 'bg-hot', WARM: 'bg-warm', LOW: 'bg-low', IRRELEVANT: 'bg-muted' };

export function IntentIcon({ level, className }: { level: IntentLevel; className?: string }) {
  if (level === 'HOT') return <LuFlame className={cn('text-hot', className)} aria-hidden />;
  return <span className={cn('inline-block h-2 w-2 rounded-full', DOT[level], className)} aria-hidden />;
}

export function IntentBadge({ level, score, size = 'md' }: { level: IntentLevel; score?: number; size?: 'sm' | 'md' }) {
  return (
    <Pill tone={INTENT_TONE[level]} size={size}>
      <IntentIcon level={level} />
      <span className="tracking-wide">{INTENT_META[level].label.toUpperCase()}</span>
      {score !== undefined && <span className="font-mono tnum">{score}</span>}
    </Pill>
  );
}

/** The big score block on the left of every opportunity card. */
export function ScoreBlock({ level, score }: { level: IntentLevel; score: number }) {
  const bg: Record<IntentLevel, string> = { HOT: 'bg-hot-soft text-hot-ink', WARM: 'bg-warm-soft text-warm-ink', LOW: 'bg-low-soft text-low-ink', IRRELEVANT: 'bg-muted-soft text-ink-3' };
  return (
    <div className={cn('flex w-14 shrink-0 flex-col items-center justify-center rounded-md py-2', bg[level])} aria-label={`${INTENT_META[level].label} intent, score ${score} of 100`}>
      <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider">
        <IntentIcon level={level} className="h-3 w-3" />
        {INTENT_META[level].label.toUpperCase()}
      </div>
      <div className="font-mono text-2xl font-semibold leading-none mt-1 tnum">{score}</div>
    </div>
  );
}

export function ProvenanceTag({ p }: { p: Provenance | undefined }) {
  if (p === 'SOURCE_VERIFIED')
    return (
      <Pill tone="verified"
  title="Value found in the source document. This does not independently verify an individual solicitation.">
  SOURCE EXTRACTED
</Pill>
    );
  if (p === 'AI_INFERENCE')
    return (
      <Pill tone="inferred" title="Inferred by the AI/rules engine — verify before relying on it">
        AI INFERENCE
      </Pill>
    );
  return (
    <Pill tone="muted" title="Not stated in the source">
      UNKNOWN
    </Pill>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Pill tone="demo" className={className} title="Fictional sample record — not a real opportunity">
      DEMO DATA
    </Pill>
  );
}

const CONF_TONE: Record<SourceConfidence, Tone> = { HIGH: 'verified', MEDIUM: 'inferred', LOW: 'muted' };
export function ConfidencePill({ c }: { c: SourceConfidence }) {
  return <Pill tone={CONF_TONE[c]}>{c} CONFIDENCE</Pill>;
}

const MATCH_TONE: Record<MatchLevel, Tone> = { EXACT: 'verified', HIGH: 'brand', ALTERNATIVE: 'inferred', NONE: 'muted' };
export function MatchPill({ level, score }: { level: MatchLevel; score?: number }) {
  return (
    <Pill tone={MATCH_TONE[level]} title={MATCH_LABELS[level]}>
      {level === 'NONE' ? 'NO MATCH' : `${level === 'ALTERNATIVE' ? 'ALT' : level} MATCH`}
      {score !== undefined && level !== 'NONE' && <span className="font-mono tnum">{score}%</span>}
    </Pill>
  );
}

export function DeadlineText({ iso, withIcon = true }: { iso: string | null; withIcon?: boolean }) {
  const tone = deadlineTone(iso);
  const d = daysUntil(iso);
  const cls = { overdue: 'text-ink-3 line-through', urgent: 'text-hot-ink font-semibold', soon: 'text-warm-ink font-semibold', later: 'text-ink-2', none: 'text-ink-3' }[tone];
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap tnum', cls)}>
      {withIcon && <LuCalendar className="shrink-0" aria-hidden />}
      {iso ? (
        <>
          {shortDate(iso)}
          <span className="font-normal">{d! < 0 ? '(passed)' : d === 0 ? '(today)' : `(${d}d)`}</span>
        </>
      ) : (
        'No deadline stated'
      )}
    </span>
  );
}

export function sourceLabel(o: Pick<OpportunitySummary, 'source' | 'sourceType'>) {
  return o.source;
}

/** Primary sales workflow unit (spec §41). */
export function OpportunityCard({ o, now, compact }: { o: OpportunitySummary; now: number; compact?: boolean }) {
  return (
    <article className="group relative flex gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-line-strong">
      <ScoreBlock level={o.intentLevel} score={o.intentScore} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="font-semibold text-ink truncate max-w-full">{o.organizationName ?? 'Organization not identified'}</h3>
              {o.isDemo && <DemoBadge />}
              {o.hasDuplicates && (
                <Pill tone="outline" title="Another source reports a very similar requirement">
                  <LuCopy aria-hidden /> Possible duplicate
                </Pill>
              )}
            </div>
            <Link to={`/opportunities/${o.id}`} className="mt-0.5 block text-sm text-ink-2 hover:text-brand line-clamp-2">
              “{o.requirementSummary}”
            </Link>
          </div>
          <Link
            to={`/opportunities/${o.id}`}
            className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-md border border-line-strong px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand hover:text-brand"
          >
            VIEW <LuArrowUpRight aria-hidden />
          </Link>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1">
            <LuMapPin aria-hidden className="text-ink-3" />
            {o.city || o.state ? [o.city, o.state].filter(Boolean).join(', ') : 'Location unknown'}
          </span>
          <span className="inline-flex items-center gap-1 tnum">
            <LuPackage aria-hidden className="text-ink-3" />
            {o.quantity ? `${num(o.quantity)} units` : 'Qty not stated'}
          </span>
          <span className="font-medium text-ink-2">{PROCUREMENT_LABELS[o.procurementType]}</span>
          <DeadlineText iso={o.deadline} />
          <MatchPill level={o.matchLevel} score={o.matchScore} />
        </div>

        {!compact && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-[11px] text-ink-3">
            <span className="inline-flex items-center gap-1">
              <LuRadioTower aria-hidden /> {o.source}
              <span className="text-ink-3">· {SOURCE_TYPE_LABELS[o.sourceType]}</span>
            </span>
            <span className="tnum">Posted {o.publishedAt ? timeAgo(o.publishedAt, now) : 'date unknown'}</span>
            <span className="tnum font-medium text-ink-2">Discovered {timeAgo(o.discoveredAt, now)}</span>
            {o.status !== 'NEW' && <Pill tone="outline">{o.status}</Pill>}
          </div>
        )}
        <Link to={`/opportunities/${o.id}`} className="sm:hidden mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand">
          VIEW OPPORTUNITY <LuArrowUpRight aria-hidden />
        </Link>
      </div>
    </article>
  );
}
