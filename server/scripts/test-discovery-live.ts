import 'dotenv/config';
import { safeDiscoveryFetch } from '../src/connectors/http';
import { extractSolicitationLinks } from '../src/connectors/genericWeb';

const url =
  'https://dir.texas.gov/it-solutions-and-services/selling-through-dir/schedule-of-solicitation-opportunities';

async function main() {
  const response = await safeDiscoveryFetch(url, 'dir.texas.gov');

  console.log('HTTP status:', response.status);
  console.log('Content type:', response.headers.get('content-type'));

  if (!response.ok) {
    console.log('Source did not return a successful response.');
    return;
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (!/text\/html/i.test(contentType)) {
    console.log('Source did not return HTML.');
    return;
  }

  const html = await response.text();
  const links = extractSolicitationLinks(html, url, 5);

  console.log('Candidate links:', links.length);
  console.log(JSON.stringify(links, null, 2));

  console.log(
    'READ-ONLY TEST COMPLETE. No detail pages fetched or database records created.',
  );
}

main().catch((error) => {
  console.error(
    'Discovery test stopped:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});