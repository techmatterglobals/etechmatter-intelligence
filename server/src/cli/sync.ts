// `npm run sync` — run the ingestion pipeline once from the command line (e.g. from system cron).
import { createApp } from '../index';

const keys = process.argv.slice(2);
const app = await createApp();
const p = await app.sync.runAndWait('MANUAL', keys.length ? keys : undefined);
for (const s of p.sources) console.log(`${s.key.padEnd(14)} ${s.status.padEnd(8)} ${s.message}`);
console.log(`\n${p.message} (${p.updatedCount} updated, ${p.irrelevantCount} irrelevant, ${p.alertsTriggered} alerts)`);
process.exit(p.status === 'ERROR' ? 1 : 0);
