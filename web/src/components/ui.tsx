import { useEffect, type ReactNode } from 'react';
import { LuLoaderCircle, LuX } from 'react-icons/lu';
import { cn } from '../lib/format';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
export function Button({
  children, onClick, variant = 'secondary', size = 'md', disabled, loading, type = 'button', className, title, icon,
}: {
  children?: ReactNode; onClick?: () => void; variant?: BtnVariant; size?: 'sm' | 'md'; disabled?: boolean; loading?: boolean;
  type?: 'button' | 'submit'; className?: string; title?: string; icon?: ReactNode;
}) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-brand text-white hover:bg-brand-strong border border-brand',
    secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken',
    ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-sunken',
    danger: 'bg-surface text-hot-ink border border-line-strong hover:bg-hot-soft',
    quiet: 'bg-sunken text-ink-2 border border-line hover:bg-line',
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        v[variant],
        className,
      )}
    >
      {loading ? <LuLoaderCircle className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ children, className, pad = true, accent }: { children: ReactNode; className?: string; pad?: boolean; accent?: 'brand' | 'warm' | 'strong' }) {
  const border = accent === 'brand' ? 'border-brand' : accent === 'warm' ? 'border-warm' : accent === 'strong' ? 'border-line-strong' : 'border-line';
  return <section className={cn('bg-surface border rounded-lg', border, pad && 'p-4', className)}>{children}</section>;
}

export function CardHeader({ title, eyebrow, right, className }: { title: ReactNode; eyebrow?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-3', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
        <h2 className="font-display text-base font-semibold text-ink leading-tight">{title}</h2>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}

export function Pill({ children, tone = 'muted', className, title, size = 'sm' }: { children: ReactNode; tone?: Tone; className?: string; title?: string; size?: 'sm' | 'md' }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded font-semibold leading-4 whitespace-nowrap', size === 'md' ? 'px-2 py-1 text-xs' : 'px-1.5 py-0.5 text-[11px]', TONES[tone], className)}>
      {children}
    </span>
  );
}
export type Tone = 'hot' | 'warm' | 'low' | 'muted' | 'brand' | 'demo' | 'verified' | 'inferred' | 'outline';
export const TONES: Record<Tone, string> = {
  hot: 'bg-hot-soft text-hot-ink',
  warm: 'bg-warm-soft text-warm-ink',
  low: 'bg-low-soft text-low-ink',
  muted: 'bg-muted-soft text-ink-2',
  brand: 'bg-brand-soft text-brand-strong',
  demo: 'bg-demo-soft text-demo-ink',
  verified: 'bg-verified-soft text-verified',
  inferred: 'bg-inferred-soft text-inferred',
  outline: 'border border-line-strong text-ink-2',
};

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-3 text-sm py-8 justify-center">
      <LuLoaderCircle className="animate-spin" /> {label ?? 'Loading…'}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-hot bg-hot-soft text-hot-ink p-4 text-sm flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="font-display font-semibold text-ink">{title}</div>
      {children && <div className="text-sm text-ink-3 mt-1 max-w-md mx-auto">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label className="flex flex-col gap-1 min-w-0" htmlFor={htmlFor}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

const INPUT_BASE = 'rounded-md border border-line-strong bg-surface text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none';
export const inputCls = `${INPUT_BASE} h-9 w-full px-2.5 text-sm`;
/** input classes without conflicting utilities (size / width / padding chosen once) */
export function inp({ size = 'md', w = 'w-full', px, extra }: { size?: 'sm' | 'md'; w?: string; px?: string; extra?: string } = {}) {
  return cn(INPUT_BASE, size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm', w, px ?? (size === 'sm' ? 'px-2' : 'px-2.5'), extra);
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={cn('mt-12 w-full rounded-lg border border-line bg-surface shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-display font-semibold text-ink">{title}</h2>
          <button className="rounded p-1 text-ink-3 hover:bg-sunken cursor-pointer" onClick={onClose} aria-label="Close">
            <LuX />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line scroll-thin" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px cursor-pointer',
            value === t.key ? 'border-brand text-ink' : 'border-transparent text-ink-3 hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer', checked ? 'bg-brand' : 'bg-line-strong')}
    >
      <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-nav px-4 py-2.5 text-sm text-nav-ink shadow-lg" role="status">
      {message}
    </div>
  );
}

export function ChipToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium cursor-pointer transition-colors',
        active ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
      )}
    >
      {children}
    </button>
  );
}
