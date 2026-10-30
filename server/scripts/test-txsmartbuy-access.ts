import 'dotenv/config';
import { safeDiscoveryFetch } from '../src/connectors/http';

const url =
  'https://www.txsmartbuy.gov/esbd/COOP2026SOL-00008';

async function main() {
  const response = await safeDiscoveryFetch(
    url,
    'www.txsmartbuy.gov',
  );

  console.log('HTTP status:', response.status);
  console.log('Content type:', response.headers.get('content-type'));

  if (!response.ok) {
    console.log('Notice not accessible.');
    return;
  }

  const html = await response.text();

  console.log('HTML length:', html.length);
  console.log('Contains notice ID:', html.includes('COOP2026SOL-00008'));

  console.log(
    'READ-ONLY TEST COMPLETE. No database changes.',
  );
}

main().catch((error) => {
  console.error(
    'Access test stopped:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});