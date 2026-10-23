import { MemoryStore, seedDemo, type AIProvider, type Repository } from '@etm/shared';
import { env } from '../config/env';

export async function createRepository(): Promise<Repository> {
  if (env.dataStore === 'postgres') {
    if (!env.databaseUrl) throw new Error('DATA_STORE=postgres but DATABASE_URL is not set');
    const { PrismaRepository } = await import('./prismaRepository');
    console.log('[repo] PostgreSQL via Prisma');
    return PrismaRepository.create();
  }
  console.warn('[repo] In-memory store (DATA_STORE=memory or no DATABASE_URL). Data is lost on restart — use PostgreSQL for real use.');
  return new MemoryStore();
}

export async function ensureSeeded(repo: Repository, ai: AIProvider) {
  if (!env.seedDemoData) return;
  const r = await seedDemo(repo, { ai });
  if (r.seeded) console.log(`[seed] DEMO DATA loaded: ${r.opportunities} sample documents processed through the pipeline (clearly badged in the UI).`);
}
