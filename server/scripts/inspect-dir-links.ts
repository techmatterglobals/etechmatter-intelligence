import 'dotenv/config';
import { load } from 'cheerio';
import { safeDiscoveryFetch } from '../src/connectors/http';

const url =
  'https://dir.texas.gov/it-solutions-and-services/selling-through-dir/schedule-of-solicitation-opportunities';

async function main() {
  const response = await safeDiscoveryFetch(url, 'dir.texas.gov');

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const $ = load(await response.text());
  const results = new Map<string, string>();

  $('main a[href], article a[href], table a[href]').each((_, element) => {
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    const href = $(element).attr('href');

    if (!href || !title) return;

    try {
      const target = new URL(href, url);

      if (!['https:', 'http:'].includes(target.protocol)) return;

      if (
        /solicitation|procurement|bid|rfp|rfq|purchase|opportunit|contract|esbd|bonfire/i.test(
          `${title} ${target.href}`,
        )
      ) {
        results.set(target.href, title);
      }
    } catch {
      // Ignore malformed links.
    }
  });

  console.log(`Relevant links found: ${results.size}`);

  for (const [href, title] of [...results].slice(0, 30)) {
    console.log(`\n${title}\n${href}`);
  }

  console.log('\nREAD-ONLY: No linked pages fetched or database changes.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});