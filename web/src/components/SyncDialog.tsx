import type { SyncProgress } from '@etm/shared';
import { useEffect, useRef, useState } from 'react';
import { LuCircleCheck, LuCircleDot, LuLoaderCircle } from 'react-icons/lu';
import { cn } from '../lib/format';
import { useApp } from '../lib/appContext';
import { Button, Modal, Pill } from './ui';

const LABELS: [string, string][] = [
  ['connect', 'Connecting to sources…'],
  ['fetch', 'Fetching new opportunities…'],
  ['dedupe', 'Deduplicating…'],
  ['analyze', 'AI analyzing…'],
  ['match', 'Matching products…'],
  ['store', 'Storing opportunities…'],
  ['alert', 'Evaluating alerts…'],
  ['complete', 'Complete.'],
];

/**
 * Shows the REAL stages reported by the ingestion pipeline. When a stage
 * finishes faster than the eye can follow, each step is still shown for a
 * beat so the sequence is readable — the counts come from the backend.
 */
export function SyncDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api, refresh } = useApp();
  const [p, setP] = useState<SyncProgress | null>(null);
  const [shown, setShown] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!open) {
      started.current = false;
      setP(null);
      setShown(0);
      setErr(null);
      return;
    }
    if (started.current) return;
    started.current = true;
    let stop = false;
    (async () => {
      try {
        const { runId } = await api.startSync();
        while (!stop) {
          const prog = await api.syncProgress(runId).catch(() => null);
          if (prog) setP(prog);
          if (prog && prog.status !== 'RUNNING') break;
          await new Promise((r) => setTimeout(r, 400));
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      stop = true;
    };
  }, [open, api]);

  const reached = p ? Math.max(0, p.stages.findIndex((s) => s.status === 'active')) : 0;
  const target = p?.status === 'COMPLETE' ? LABELS.length - 1 : reached;
  useEffect(() => {
    if (shown >= target) return;
    const t = setTimeout(() => setShown((s) => s + 1), 420);
    return () => clearTimeout(t);
  }, [shown, target]);
  const done = p?.status === 'COMPLETE' && shown >= LABELS.length - 1;
  useEffect(() => {
    if (done) refresh();
  }, [done, refresh]);

  return (
    <Modal open={open} onClose={onClose} title="Sync now">
      <ol className="flex flex-col gap-2">
        {LABELS.map(([key, label], i) => {
          const stage = p?.stages.find((s) => s.key === key);
          const state = i < shown || done ? 'done' : i === shown ? 'active' : 'pending';
          return (
            <li key={key} className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5">
                {state === 'done' ? (
                  <LuCircleCheck className="text-low" />
                ) : state === 'active' ? (
                  <LuLoaderCircle className="animate-spin text-brand" />
                ) : (
                  <LuCircleDot className="text-line-strong" />
                )}
              </span>
              <div className="min-w-0">
                <div className={cn(state === 'pending' ? 'text-ink-3' : 'text-ink', state === 'active' && 'font-medium')}>{label}</div>
                {state === 'done' && stage?.detail && <div className="text-xs text-ink-3">{stage.detail}</div>}
              </div>
            </li>
          );
        })}
      </ol>

      {err && <div className="mt-4 rounded-md bg-hot-soft p-3 text-sm text-hot-ink">{err}</div>}

      {done && p && (
        <div className="mt-4 rounded-md border border-line bg-sunken p-3">
          <div className="font-display text-lg font-semibold text-ink">{p.message}</div>
          <div className="mt-1 text-xs text-ink-3 tnum">
            {p.updatedCount} updated · {p.duplicateCount} unchanged · {p.irrelevantCount} filtered as not a buying signal · {p.alertsTriggered} alert(s)
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {p.sources.map((s) => (
              <li key={s.key} className="flex items-start justify-between gap-2 text-xs">
                <span className="text-ink-2">
                  <span className="font-medium text-ink">{s.name}</span> — {s.message}
                </span>
                <Pill tone={s.status === 'SUCCESS' ? 'low' : s.status === 'ERROR' ? 'hot' : 'muted'}>{s.status}</Pill>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant={done ? 'primary' : 'secondary'} onClick={onClose}>
          {done ? 'View opportunities' : 'Run in background'}
        </Button>
      </div>
    </Modal>
  );
}
