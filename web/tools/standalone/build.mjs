// Single-file standalone build (engine + DEMO DATA in the browser, no backend).
// Used to publish the hosted preview. Usage:  node tools/standalone/build.mjs
// Requires esbuild (ships with Vite). Set ESBUILD_PATH to point at another copy.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCss } from './tw-lite.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..', '..');
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_PATH ?? 'esbuild');

const js = await esbuild.build({
  entryPoints: [join(web, 'src/main.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  minify: true,
  target: 'es2020',
  jsx: 'automatic',
  define: { 'import.meta.env.VITE_API_MODE': JSON.stringify(process.env.API_MODE ?? 'standalone'), 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'empty' },
  logLevel: 'warning',
});
const { css, conflicts, count } = buildCss({ srcDir: join(web, 'src'), cssFile: join(web, 'src/index.css') });
if (conflicts.length) console.warn(`⚠ ${conflicts.length} same-property class conflicts:\n  ` + conflicts.join('\n  '));
const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">';
const body = `<div id="root"></div>\n<script>${script}</script>`;
const out = process.env.OUT_DIR ?? join(web, 'dist-standalone');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>ETechMatter Intelligence</title>${fonts}<style>${css}</style></head><body>${body}</body></html>`);
// artifact variant: page content only (the host adds doctype/head/body)
writeFileSync(join(out, 'artifact.html'), `<title>ETechMatter Intelligence</title>\n${fonts}\n<style>${css}</style>\n${body}\n`);
console.log(`standalone build: ${count} utilities, ${(script.length / 1024).toFixed(0)} KB JS, ${(css.length / 1024).toFixed(0)} KB CSS → ${out}`);
