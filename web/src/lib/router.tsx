// Tiny hash router: works on any static host, inside the Node server, and in sandboxed previews.
import { useEffect, useState, type ReactNode } from 'react';

export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

export function navigate(path: string) {
  if (currentPath() !== path) window.location.hash = path;
  window.scrollTo?.({ top: 0 });
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const on = () => setPath(currentPath());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '([^/?]+)')) + '/?(?:\\?.*)?$');
  const m = path.match(re);
  return m ? Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) : null;
}

export function queryParam(name: string): string | null {
  const q = currentPath().split('?')[1] ?? '';
  return new URLSearchParams(q).get(name);
}

export function Link({ to, className, children, title }: { to: string; className?: string; children: ReactNode; title?: string }) {
  return (
    <a href={`#${to}`} className={className} title={title}>
      {children}
    </a>
  );
}
