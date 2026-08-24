import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Built lazily rather than at module load: Next evaluates this module during
 * build-time page-data collection, when DATABASE_URL is not populated. Same
 * reason src/lib/config.ts reads its keys through getters.
 *
 * No "file:./dev.db" fallback any more — a missing URL must fail loudly instead
 * of silently writing to a local file nobody reads.
 */
function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.");
  }
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

// Cached on globalThis unconditionally, not just in dev: Next can evaluate this
// module in more than one server bundle, and a second client means a second pool.
export const prisma = globalForPrisma.prisma ?? createClient();
globalForPrisma.prisma = prisma;
