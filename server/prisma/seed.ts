// npm run db:seed — loads the DEMO catalog, users, alert rules and sample
// notices (processed through the real pipeline). Idempotent: skips a non-empty DB.
import { HeuristicProvider, seedDemo } from '@etm/shared';
import { PrismaRepository } from '../src/repo/prismaRepository';

const repo = await PrismaRepository.create();
const res = await seedDemo(repo, { ai: new HeuristicProvider(), log: (m) => console.log(m) });
console.log(res.seeded ? `Seeded DEMO DATA (${res.opportunities} documents).` : 'Database not empty — seed skipped.');
process.exit(0);
