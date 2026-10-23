// Minimal, dependency-free HTTP router (node:http). Keeps the API layer thin
// and fully testable; swap for Express/Fastify later without touching handlers.
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Req {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  raw: IncomingMessage;
}
export interface Res {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  /** raw text/CSV body (skips JSON encoding) */
  text?: string;
}
export type Handler = (req: Req) => Promise<Partial<Res> | unknown> | Partial<Res> | unknown;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];
  add(method: string, path: string, handler: Handler) {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/\/:([A-Za-z_]+)/g, (_, k) => {
          keys.push(k);
          return '/([^/]+)';
        }) +
        '/?$',
    );
    this.routes.push({ method, pattern, keys, handler });
    return this;
  }
  get(p: string, h: Handler) {
    return this.add('GET', p, h);
  }
  post(p: string, h: Handler) {
    return this.add('POST', p, h);
  }
  put(p: string, h: Handler) {
    return this.add('PUT', p, h);
  }
  patch(p: string, h: Handler) {
    return this.add('PATCH', p, h);
  }
  delete(p: string, h: Handler) {
    return this.add('DELETE', p, h);
  }

  match(method: string, path: string) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = path.match(r.pattern);
      if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const found = this.match(req.method ?? 'GET', url.pathname);
    if (!found) return false;
    let body: unknown = undefined;
    try {
      body = await readBody(req);
      const out = await found.route.handler({ method: req.method ?? 'GET', path: url.pathname, params: found.params, query: url.searchParams, body, raw: req });
      const r = isRes(out) ? out : { status: 200, body: out };
      send(res, r.status ?? 200, r.body, r.headers, r.text);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(`[api] ${req.method} ${url.pathname}`, e);
      send(res, status, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }
}

function isRes(x: unknown): x is Partial<Res> {
  return !!x && typeof x === 'object' && ('status' in x || 'text' in x) && ('body' in x || 'text' in x);
}

export function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}, text?: string) {
  if (text !== undefined) {
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
    res.end(text);
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

const MAX_BODY = 5 * 1024 * 1024;
async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request body too large');
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  const ct = req.headers['content-type'] ?? '';
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }
  }
  return raw; // text/csv etc.
}
