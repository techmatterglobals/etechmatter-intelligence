// tw-lite — a small, dependency-free generator for the subset of Tailwind v4
// utilities this app uses. It exists ONLY to produce the single-file standalone
// preview in environments without npm access. The real app builds with the
// official Tailwind v4 compiler (@tailwindcss/vite). Semantics follow v4 defaults.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SP = (n) => `calc(var(--spacing) * ${n})`;
const BP = { sm: '40rem', md: '48rem', lg: '64rem', xl: '80rem', '2xl': '96rem' };
const TEXT = { xs: ['0.75rem', '1rem'], sm: ['0.875rem', '1.25rem'], base: ['1rem', '1.5rem'], lg: ['1.125rem', '1.75rem'], xl: ['1.25rem', '1.75rem'], '2xl': ['1.5rem', '2rem'], '3xl': ['1.875rem', '2.25rem'], '4xl': ['2.25rem', '2.5rem'] };
const RADIUS = { none: '0', sm: '0.25rem', DEFAULT: '0.25rem', md: '0.375rem', lg: '0.5rem', xl: '0.75rem', '2xl': '1rem', full: '9999px' };
const MAXW = { xs: '20rem', sm: '24rem', md: '28rem', lg: '32rem', xl: '36rem', '2xl': '42rem', '3xl': '48rem', '4xl': '56rem', '5xl': '64rem', '6xl': '72rem', '7xl': '80rem', full: '100%', none: 'none' };
const WEIGHT = { normal: 400, medium: 500, semibold: 600, bold: 700 };
const LEADING = { none: 1, tight: 1.25, snug: 1.375, normal: 1.5, relaxed: 1.625 };
const TRACKING = { tight: '-0.025em', normal: '0em', wide: '0.025em', wider: '0.05em', widest: '0.1em' };
const SHADOW = {
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)', sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', none: '0 0 #0000',
};
const SHADOW_STACK = 'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow, 0 0 #0000)';

export function readTheme(css) {
  const m = css.match(/@theme\s*\{([\s\S]*?)\n\}/);
  const vars = {};
  for (const [, k, v] of (m?.[1] ?? '').matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[k] = v.trim();
  return vars;
}

function arb(v) {
  return v.slice(1, -1).replace(/_/g, ' ');
}

function len(v, { allowFraction = true } = {}) {
  if (v === undefined) return null;
  if (v.startsWith('[')) return arb(v);
  if (v === 'px') return '1px';
  if (v === 'full') return '100%';
  if (v === 'auto') return 'auto';
  if (v === 'screen') return '100vw';
  if (v === 'fit') return 'fit-content';
  if (allowFraction && /^\d+\/\d+$/.test(v)) {
    const [a, b] = v.split('/').map(Number);
    return `${(a / b) * 100}%`;
  }
  if (/^\d+(\.\d+)?$/.test(v)) return v === '0' ? '0px' : SP(v);
  return null;
}

export function makeGenerator(theme) {
  const colors = new Set(Object.keys(theme).filter((k) => k.startsWith('color-')).map((k) => k.slice(6)));
  const color = (v) => {
    if (!v) return null;
    const [name, op] = v.split('/');
    let base = null;
    if (name === 'white') base = '#fff';
    else if (name === 'black') base = '#000';
    else if (name === 'transparent') base = 'transparent';
    else if (name === 'current') base = 'currentColor';
    else if (name.startsWith('[')) base = arb(name);
    else if (colors.has(name)) base = `var(--color-${name})`;
    if (!base) return null;
    return op ? `color-mix(in oklab, ${base} ${op}%, transparent)` : base;
  };

  /** returns [declarations, childSelector?] or null */
  function util(u) {
    let neg = false;
    if (u.startsWith('-')) {
      neg = true;
      u = u.slice(1);
    }
    const n = (x) => (neg && x ? (x === '0px' ? x : `calc(${x} * -1)`) : x);
    const statics = {
      block: 'display:block', 'inline-block': 'display:inline-block', inline: 'display:inline', flex: 'display:flex', 'inline-flex': 'display:inline-flex',
      grid: 'display:grid', hidden: 'display:none', contents: 'display:contents', table: 'display:table',
      relative: 'position:relative', absolute: 'position:absolute', fixed: 'position:fixed', sticky: 'position:sticky',
      'flex-col': 'flex-direction:column', 'flex-row': 'flex-direction:row', 'flex-wrap': 'flex-wrap:wrap', 'flex-1': 'flex:1 1 0%', 'flex-none': 'flex:none',
      'shrink-0': 'flex-shrink:0', grow: 'flex-grow:1',
      'items-start': 'align-items:flex-start', 'items-center': 'align-items:center', 'items-end': 'align-items:flex-end', 'items-baseline': 'align-items:baseline', 'items-stretch': 'align-items:stretch',
      'justify-start': 'justify-content:flex-start', 'justify-center': 'justify-content:center', 'justify-end': 'justify-content:flex-end', 'justify-between': 'justify-content:space-between',
      'self-start': 'align-self:flex-start', 'self-center': 'align-self:center',
      'overflow-hidden': 'overflow:hidden', 'overflow-auto': 'overflow:auto', 'overflow-x-auto': 'overflow-x:auto', 'overflow-y-auto': 'overflow-y:auto',
      truncate: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', 'whitespace-nowrap': 'white-space:nowrap', 'whitespace-pre-wrap': 'white-space:pre-wrap',
      'break-words': 'overflow-wrap:break-word', 'break-all': 'word-break:break-all',
      'text-left': 'text-align:left', 'text-center': 'text-align:center', 'text-right': 'text-align:right',
      uppercase: 'text-transform:uppercase', italic: 'font-style:italic', underline: 'text-decoration-line:underline', 'line-through': 'text-decoration-line:line-through',
      'select-none': 'user-select:none', 'select-all': 'user-select:all', 'pointer-events-none': 'pointer-events:none',
      'cursor-pointer': 'cursor:pointer', 'cursor-default': 'cursor:default', 'cursor-not-allowed': 'cursor:not-allowed', 'cursor-grab': 'cursor:grab', 'cursor-grabbing': 'cursor:grabbing',
      'list-disc': 'list-style-type:disc', 'aspect-square': 'aspect-ratio:1 / 1', 'object-cover': 'object-fit:cover',
      'outline-none': 'outline:2px solid transparent;outline-offset:2px',
      transition: 'transition-property:color,background-color,border-color,opacity,box-shadow,transform;transition-duration:150ms',
      'transition-colors': 'transition-property:color,background-color,border-color;transition-duration:150ms',
      'transition-transform': 'transition-property:transform;transition-duration:150ms',
      'animate-spin': 'animation:spin 1s linear infinite', 'animate-pulse': 'animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite',
      'backdrop-blur': 'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)',
      'sr-only': 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0',
      border: 'border-style:solid;border-width:1px', 'border-0': 'border-width:0', 'border-2': 'border-style:solid;border-width:2px',
      'border-t': 'border-top-style:solid;border-top-width:1px', 'border-b': 'border-bottom-style:solid;border-bottom-width:1px',
      'border-l': 'border-left-style:solid;border-left-width:1px', 'border-r': 'border-right-style:solid;border-right-width:1px',
      'border-t-2': 'border-top-style:solid;border-top-width:2px', 'border-b-2': 'border-bottom-style:solid;border-bottom-width:2px',
      'tnum': null,
    };
    if (u in statics) return statics[u] ? [statics[u]] : null;

    let m;
    if ((m = u.match(/^(p|px|py|pt|pr|pb|pl)-(.+)$/))) {
      const v = len(m[2]);
      if (!v) return null;
      const map = { p: ['padding'], px: ['padding-left', 'padding-right'], py: ['padding-top', 'padding-bottom'], pt: ['padding-top'], pr: ['padding-right'], pb: ['padding-bottom'], pl: ['padding-left'] };
      return [map[m[1]].map((p) => `${p}:${v}`).join(';')];
    }
    if ((m = u.match(/^(m|mx|my|mt|mr|mb|ml)-(.+)$/))) {
      const v = n(len(m[2]));
      if (!v) return null;
      const map = { m: ['margin'], mx: ['margin-left', 'margin-right'], my: ['margin-top', 'margin-bottom'], mt: ['margin-top'], mr: ['margin-right'], mb: ['margin-bottom'], ml: ['margin-left'] };
      return [map[m[1]].map((p) => `${p}:${v}`).join(';')];
    }
    if ((m = u.match(/^gap(-x|-y)?-(.+)$/))) {
      const v = len(m[2]);
      return v ? [`${m[1] === '-x' ? 'column-gap' : m[1] === '-y' ? 'row-gap' : 'gap'}:${v}`] : null;
    }
    if ((m = u.match(/^space-(x|y)-(.+)$/))) {
      const v = len(m[2]);
      return v ? [`${m[1] === 'y' ? 'margin-top' : 'margin-left'}:${v}`, ' > :not(:first-child)'] : null;
    }
    if ((m = u.match(/^divide-(x|y)$/))) return [m[1] === 'y' ? 'border-top-style:solid;border-top-width:1px' : 'border-left-style:solid;border-left-width:1px', ' > :not(:first-child)'];
    if ((m = u.match(/^divide-(.+)$/))) {
      const c = color(m[1]);
      return c ? [`border-color:${c}`, ' > :not(:first-child)'] : null;
    }
    if ((m = u.match(/^(w|h|min-w|min-h|max-h|size)-(.+)$/))) {
      let v = m[2] === 'screen' && m[1].includes('h') ? '100vh' : len(m[2]);
      if (m[2] === 'min') v = 'min-content';
      if (m[2] === 'max') v = 'max-content';
      if (!v) return null;
      const prop = { w: ['width'], h: ['height'], 'min-w': ['min-width'], 'min-h': ['min-height'], 'max-h': ['max-height'], size: ['width', 'height'] }[m[1]];
      return [prop.map((p) => `${p}:${v}`).join(';')];
    }
    if ((m = u.match(/^max-w-(.+)$/))) {
      const v = MAXW[m[1]] ?? (m[1].startsWith('[') ? arb(m[1]) : null) ?? len(m[1]);
      return v ? [`max-width:${v}`] : null;
    }
    if ((m = u.match(/^basis-(.+)$/))) {
      const v = len(m[1]);
      return v ? [`flex-basis:${v}`] : null;
    }
    if ((m = u.match(/^(inset-x|inset-y|inset|top|right|bottom|left)-(.+)$/))) {
      const v = n(len(m[2]));
      if (!v) return null;
      const props = { inset: ['inset'], 'inset-x': ['left', 'right'], 'inset-y': ['top', 'bottom'], top: ['top'], right: ['right'], bottom: ['bottom'], left: ['left'] }[m[1]];
      return [props.map((p) => `${p}:${v}`).join(';')];
    }
    if ((m = u.match(/^translate-(x|y)-(.+)$/))) {
      const v = n(len(m[2]));
      return v ? [`--tw-translate-${m[1]}:${v};translate:var(--tw-translate-x, 0) var(--tw-translate-y, 0)`] : null;
    }
    if ((m = u.match(/^scale-(\d+)$/))) return [`scale:${m[1]}%`];
    if ((m = u.match(/^z-(\d+)$/))) return [`z-index:${m[1]}`];
    if ((m = u.match(/^opacity-(\d+)$/))) return [`opacity:${Number(m[1]) / 100}`];
    if ((m = u.match(/^duration-(\d+)$/))) return [`transition-duration:${m[1]}ms`];
    if ((m = u.match(/^line-clamp-(\d+)$/))) return [`overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${m[1]}`];
    if ((m = u.match(/^grid-cols-(\d+|\[.+\])$/))) return [`grid-template-columns:${m[1].startsWith('[') ? arb(m[1]) : `repeat(${m[1]}, minmax(0, 1fr))`}`];
    if ((m = u.match(/^col-span-(\d+)$/))) return [`grid-column:span ${m[1]} / span ${m[1]}`];
    if ((m = u.match(/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl)$/))) return [`font-size:${TEXT[m[1]][0]};line-height:var(--tw-leading, ${TEXT[m[1]][1]})`];
    if ((m = u.match(/^text-\[(.+)\]$/))) return /^\d/.test(m[1]) ? [`font-size:${m[1]}`] : [`color:${m[1]}`];
    if ((m = u.match(/^text-(.+)$/))) {
      const c = color(m[1]);
      return c ? [`color:${c}`] : null;
    }
    if ((m = u.match(/^font-(normal|medium|semibold|bold)$/))) return [`font-weight:${WEIGHT[m[1]]}`];
    if ((m = u.match(/^font-(sans|display|mono)$/))) return [`font-family:var(--font-${m[1]})`];
    if ((m = u.match(/^leading-(.+)$/))) {
      const v = LEADING[m[1]] ?? (m[1].startsWith('[') ? arb(m[1]) : /^\d+$/.test(m[1]) ? SP(m[1]) : null);
      return v !== null && v !== undefined ? [`--tw-leading:${v};line-height:${v}`] : null;
    }
    if ((m = u.match(/^tracking-(.+)$/))) {
      const v = TRACKING[m[1]] ?? (m[1].startsWith('[') ? arb(m[1]) : null);
      return v ? [`letter-spacing:${v}`] : null;
    }
    if ((m = u.match(/^bg-(.+)$/))) {
      const c = color(m[1]);
      return c ? [`background-color:${c}`] : null;
    }
    if ((m = u.match(/^border-(t|b|l|r)-(.+)$/)) && color(m[2])) return [`border-${{ t: 'top', b: 'bottom', l: 'left', r: 'right' }[m[1]]}-color:${color(m[2])}`];
    if ((m = u.match(/^border-(.+)$/))) {
      const c = color(m[1]);
      return c ? [`border-color:${c}`] : null;
    }
    if ((m = u.match(/^rounded(?:-(t|b|l|r))?(?:-(.+))?$/))) {
      const v = m[2] ? (RADIUS[m[2]] ?? (m[2].startsWith('[') ? arb(m[2]) : null)) : RADIUS.DEFAULT;
      if (!v) return null;
      const side = { t: ['top-left', 'top-right'], b: ['bottom-left', 'bottom-right'], l: ['top-left', 'bottom-left'], r: ['top-right', 'bottom-right'] }[m[1]];
      return [side ? side.map((s) => `border-${s}-radius:${v}`).join(';') : `border-radius:${v}`];
    }
    if ((m = u.match(/^shadow(?:-(.+))?$/))) {
      const v = SHADOW[m[1] ?? 'DEFAULT'];
      return v ? [`--tw-shadow:${v};box-shadow:${SHADOW_STACK}`] : null;
    }
    if ((m = u.match(/^ring(?:-(\d+))?$/))) return [`--tw-ring-shadow:0 0 0 calc(${m[1] ?? 1}px + var(--tw-ring-offset-width, 0px)) var(--tw-ring-color, currentColor);box-shadow:${SHADOW_STACK}`];
    if ((m = u.match(/^ring-offset-(\d+)$/))) return [`--tw-ring-offset-width:${m[1]}px;--tw-ring-offset-shadow:0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color, #fff)`];
    if ((m = u.match(/^ring-offset-(.+)$/)) && color(m[1])) return [`--tw-ring-offset-color:${color(m[1])}`];
    if ((m = u.match(/^ring-(.+)$/)) && color(m[1])) return [`--tw-ring-color:${color(m[1])}`];
    return null;
  }

  const esc = (s) => s.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  const STATE = {
    hover: ':hover', focus: ':focus', 'focus-visible': ':focus-visible', active: ':active', disabled: ':disabled', first: ':first-child', last: ':last-child',
    placeholder: '::placeholder',
  };

  /** returns { layer, media, css } or null */
  function compile(cls) {
    const parts = cls.split(':');
    const base = parts.pop();
    const res = util(base);
    if (!res) return null;
    const [decl, child = ''] = res;
    let sel = `.${esc(cls)}`;
    let media = null;
    let layer = 0;
    for (const v of parts) {
      if (BP[v]) {
        media = `@media (min-width: ${BP[v]})`;
        layer = Math.max(layer, 10 + Object.keys(BP).indexOf(v));
      } else if (v === 'group-hover') {
        sel = `.group:hover ${sel}`;
        layer = Math.max(layer, 2);
      } else if (STATE[v]) {
        sel = `${sel}${STATE[v]}`;
        layer = Math.max(layer, v === 'placeholder' ? 1 : 3);
      } else return null;
    }
    const body = `${sel}${child}{${decl}}`;
    return { layer, media, css: media ? `${media}{${body}}` : body, prop: decl.split(':')[0], variants: parts.join(':') };
  }
  return { compile };
}

export function scanClasses(dir) {
  const out = new Map(); // class -> Set(strings it appears in)
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(f)) {
        const src = readFileSync(p, 'utf8');
        for (const m of src.matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*?)\1/g)) {
          const str = m[2];
          for (const tok of str.split(/[\s{}$]+/)) if (tok && /^!?-?[a-z0-9][\w:\-[\]\/.%(),#+]*$/i.test(tok) && (tok.match(/\[/g) ?? []).length === (tok.match(/\]/g) ?? []).length) (out.get(tok) ?? out.set(tok, new Set()).get(tok)).add(`${p}::${str}`);
        }
      }
    }
  };
  walk(dir);
  return out;
}

export function buildCss({ srcDir, cssFile }) {
  const cssSrc = readFileSync(cssFile, 'utf8');
  const theme = readTheme(cssSrc);
  const gen = makeGenerator(theme);
  const classes = scanClasses(srcDir);
  const rules = [];
  const perString = new Map();
  for (const [cls, strs] of classes) {
    const r = gen.compile(cls);
    if (!r) continue;
    rules.push(r);
    for (const s of strs) {
      const key = `${r.variants}|${r.prop}`;
      const arr = perString.get(s) ?? [];
      arr.push({ cls, key });
      perString.set(s, arr);
    }
  }
  // conflict report: two utilities setting the same property with the same variants in one class string
  const conflicts = [];
  for (const [s, arr] of perString) {
    if (/[\n;(){}]/.test(s.split('::')[1] ?? '')) continue; // only plain class strings
    const seen = new Map();
    for (const { cls, key } of arr) {
      if (seen.has(key) && seen.get(key) !== cls && !/^(border|ring)/.test(key.split('|')[1])) conflicts.push(`${seen.get(key)} vs ${cls}  in  ${s.split('::')[1].slice(0, 90)}`);
      seen.set(key, cls);
    }
  }
  rules.sort((a, b) => a.layer - b.layer);
  const themeCss = `:root{${Object.entries(theme).map(([k, v]) => `--${k}:${v}`).join(';')};--spacing:0.25rem}`;
  const rest = cssSrc.replace(/@import\s+"tailwindcss";/, '').replace(/@theme\s*\{[\s\S]*?\n\}/, '');
  const preflight = `*,::after,::before{box-sizing:border-box;border:0 solid;margin:0;padding:0}html{line-height:1.5;-webkit-text-size-adjust:100%;tab-size:4}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;text-decoration:inherit}b,strong{font-weight:bolder}code,pre,kbd{font-family:var(--font-mono);font-size:1em}table{text-indent:0;border-color:inherit;border-collapse:collapse}button,input,select,textarea{font:inherit;color:inherit;background:transparent;letter-spacing:inherit}button{cursor:pointer}ol,ul,menu{list-style:none}img,svg,video{display:block;vertical-align:middle}svg{display:inline-block}textarea{resize:vertical}input::placeholder,textarea::placeholder{opacity:1}[hidden]{display:none!important}summary{display:list-item}fieldset{min-width:0}legend{padding:0}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{50%{opacity:.5}}`;
  return { css: `${preflight}\n${themeCss}\n${rest}\n${rules.map((r) => r.css).join('\n')}`, conflicts, count: rules.length };
}
