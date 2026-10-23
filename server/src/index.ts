// ETechMatter Intelligence — API server entry point.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { env } from './config/env';
import { createAIProvider } from './ai/providers';
import { createConnectors } from './connectors/registry';
import { send } from './http/router';
import { createRepository, ensureSeeded } from './repo';
import { buildApi } from './routes/api';
import { SyncService } from './services/syncService';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
};

export async function createApp() {
  const repo = await createRepository();
  const { provider: ai, status: aiStatus } = createAIProvider();
  const connectors = createConnectors();
  await ensureSeeded(repo, ai);
  const sync = new SyncService(repo, connectors, ai);
  const api = buildApi({ repo, sync, connectors, ai, aiStatus });
  const webDist = resolve(process.cwd(), env.serveWebDist);

  const server = createServer(async (req, res) => {
    // CORS (the Vite dev server proxies /api, so this mainly matters for custom deployments)
    res.setHeader('access-control-allow-origin', env.corsOrigin);
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('x-content-type-options', 'nosniff');
    if (req.method === 'OPTIONS') return send(res, 204, undefined);

    if (env.basicAuth) {
      const hdr = req.headers.authorization ?? '';
      const ok = hdr.startsWith('Basic ') && Buffer.from(hdr.slice(6), 'base64').toString() === env.basicAuth;
      if (!ok) return send(res, 401, { error: 'Authentication required' }, { 'www-authenticate': 'Basic realm="ETechMatter Intelligence"' });
    }

    if (await api.handle(req, res)) return;
    if ((req.url ?? '').startsWith('/api/')) return send(res, 404, { error: 'Not found' });

    // production: serve the built React app
    if (existsSync(webDist)) {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
      let file = join(webDist, urlPath);
      if (!file.startsWith(webDist) || !existsSync(file) || statSync(file).isDirectory()) file = join(webDist, 'index.html');
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      return void createReadStream(file).pipe(res);
    }
    send(res, 200, { name: 'ETechMatter Intelligence API', docs: '/api/health', note: 'Run the web app with `npm run dev` (web) or build it to web/dist.' });
  });

  return { server, repo, sync, connectors, aiStatus };
}

const isMain = process.argv[1] && resolve(process.argv[1]).replace(/\.ts$/, '') === resolve(import.meta.filename ?? '').replace(/\.ts$/, '');
if (isMain) {
  const app = await createApp();
  app.server.listen(env.port, () => {
    console.log(`\n  ETechMatter Intelligence API → http://localhost:${env.port}`);
    console.log(`  store: ${app.repo.kind} · AI: ${app.aiStatus.message}`);
    for (const c of app.connectors) console.log(`  source ${c.key.padEnd(12)} ${c.status({}).status} — ${c.status({}).message}`);
    app.sync.startScheduler();
  });
  const stop = () => {
    app.sync.stopScheduler();
    app.server.close(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
