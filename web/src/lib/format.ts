export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = now - new Date(iso).getTime();
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  const fmt = (n: number, u: string) => `${Math.round(n)} ${u}${Math.round(n) === 1 ? '' : 's'}`;
  let out: string;
  if (s < 45) out = 'just now';
  else if (s < 3600) out = fmt(s / 60, 'minute');
  else if (s < 86_400) out = fmt(s / 3600, 'hour');
  else if (s < 86_400 * 30) out = fmt(s / 86_400, 'day');
  else out = fmt(s / (86_400 * 30), 'month');
  if (out === 'just now') return out;
  return future ? `in ${out}` : `${out} ago`;
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function longDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function money(n: number | null | undefined, compact = false): string {
  if (n === null || n === undefined) return '—';
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  }
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toLocaleString('en-US');
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function deadlineTone(iso: string | null): 'overdue' | 'urgent' | 'soon' | 'later' | 'none' {
  const d = daysUntil(iso);
  if (d === null) return 'none';
  if (d < 0) return 'overdue';
  if (d <= 3) return 'urgent';
  if (d <= 7) return 'soon';
  return 'later';
}

export function downloadText(filename: string, text: string, type = 'text/csv') {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
