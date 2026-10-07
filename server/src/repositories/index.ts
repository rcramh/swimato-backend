import { env } from "../config/env.js";
import { createDatabase } from "../database/postgres.js";
import { createMemoryMenuRepository } from "./memory/memoryMenuRepository.js";
import { createMemorySessionRepository } from "./memory/memorySessionRepository.js";
import { createMemoryUserRepository } from "./memory/memoryUserRepository.js";
import { createPostgresMenuRepository } from "./postgres/postgresMenuRepository.js";

/* ---------------------------------------------------------------
   Repository wiring

   The only file that knows which storage is in use. Services,
   controllers and middleware import these instances and the contracts
   in types.ts, never an implementation.

   menus     PostgreSQL when DATABASE_URL is set, else the in-memory
             seed (tests and quick local runs)
   users     in memory — PostgreSQL next
   sessions  in memory — Redis next
----------------------------------------------------------------*/

const database = env.DATABASE_URL
  ? createDatabase({
      url: env.DATABASE_URL,
      poolMax: env.DB_POOL_MAX,
      statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
    })
  : null;

export const userRepository = createMemoryUserRepository();
export const sessionRepository = createMemorySessionRepository();
export const menuRepository = database
  ? createPostgresMenuRepository(database)
  : createMemoryMenuRepository();

type StorageKind = "memory" | "postgres" | "redis";

// Typed as the full union on purpose: users and sessions move to
// postgres/redis next, and callers must not assume today's values.
export const storage: Record<"users" | "sessions" | "menus", StorageKind> = {
  users: "memory",
  sessions: "memory",
  menus: database ? "postgres" : "memory",
};

export async function closeRepositories(): Promise<void> {
  await Promise.all([
    userRepository.close(),
    sessionRepository.close(),
    menuRepository.close(),
  ]);
}
