import type { Opportunity, OpportunitySummary, Product } from '../types';

const esc = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const EXPORT_COLUMNS: [string, (o: OpportunitySummary | Opportunity) => unknown][] = [
  ['Company', (o) => o.organizationName],
  ['Website', (o) => o.organizationWebsite],
  ['Contact', (o) => o.buyerName],
  ['Title', (o) => o.buyerTitle],
  ['Email', (o) => o.buyerEmail],
  ['Phone', (o) => o.buyerPhone],
  ['State', (o) => o.state],
  ['City', (o) => o.city],
  ['Product', (o) => o.requirementSummary],
  ['Quantity', (o) => o.quantity],
  ['Intent', (o) => o.intentLevel],
  ['Score', (o) => o.intentScore],
  ['Deadline', (o) => o.deadline?.slice(0, 10)],
  ['Source', (o) => o.source],
  ['Source URL', (o) => o.sourceUrl],
  ['Published Date', (o) => o.publishedAt?.slice(0, 10)],
  ['Discovered Date', (o) => o.discoveredAt],
  ['Status', (o) => o.status],
  ['Data Type', (o) => (o.isDemo ? 'DEMO DATA' : 'LIVE')],
];

export function opportunitiesToCsv(rows: (OpportunitySummary | Opportunity)[]): string {
  const head = EXPORT_COLUMNS.map(([h]) => h).join(',');
  const body = rows.map((r) => EXPORT_COLUMNS.map(([, f]) => esc(f(r))).join(','));
  return [head, ...body].join('\r\n');
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim()));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export const PRODUCT_CSV_TEMPLATE =
  'sku,manufacturer,model,part_number,category,description,specifications,price,availability,moq,warranty,url\n' +
  'ETM-DL-5550,Dell,Latitude 5550,,Laptops,15.6" business laptop,"Core Ultra 5, 16GB, 512GB SSD",1049,In stock,1,3-year ProSupport,https://etechmatter.com\n';

export function csvRowToProduct(r: Record<string, string>): Omit<Product, 'id' | 'createdAt' | 'isDemo'> | { error: string } {
  const get = (...keys: string[]) => keys.map((k) => r[k]).find((v) => v !== undefined && v !== '') ?? '';
  const sku = get('sku');
  const manufacturer = get('manufacturer', 'brand', 'mfr');
  const model = get('model');
  const category = get('category');
  if (!sku || !manufacturer || !model || !category) return { error: `Row missing required sku/manufacturer/model/category (sku="${sku}")` };
  const num = (v: string) => (v ? Number(v.replace(/[$,]/g, '')) : null);
  const price = num(get('price'));
  const moq = num(get('moq'));
  return {
    sku,
    manufacturer,
    model,
    partNumber: get('part_number', 'partnumber', 'mpn') || null,
    category,
    description: get('description') || `${manufacturer} ${model}`,
    specifications: get('specifications', 'specs') || null,
    price: price !== null && isFinite(price) ? price : null,
    availability: get('availability') || null,
    moq: moq !== null && isFinite(moq) ? moq : null,
    warranty: get('warranty') || null,
    url: get('url') || null,
  };
}
