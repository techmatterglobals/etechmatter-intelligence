import 'dotenv/config';
import { env } from '../src/config/env';
import { isPathAllowed, parseRobots } from '../src/connectors/http';

const robotsUrl = 'https://www.txsmartbuy.gov/robots.txt';
const noticePath = '/esbd/COOP2026SOL-00008';

async function main() {
  const response = await fetch(robotsUrl, {
    headers: {
      'user-agent': env.web.userAgent,
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });

  console.log('Robots HTTP status:', response.status);

  if (!response.ok) {
    console.log('Robots rules could not be retrieved successfully.');
    return;
  }

  const text = await response.text();
  const rules = parseRobots(text, env.web.userAgent);

  console.log('User-agent:', env.web.userAgent);
  console.log('Allow rules:', rules.allow);
  console.log('Disallow rules:', rules.disallow);
  console.log(
    'Notice path allowed:',
    isPathAllowed(rules, noticePath),
  );

  console.log('READ-ONLY: No notice pages fetched.');
}

main().catch((error) => {
  console.error(
    'Robots inspection stopped:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});