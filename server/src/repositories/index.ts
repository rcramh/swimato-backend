import { createMemoryUserRepository } from "./memory/memoryUserRepository.js";
import { createMemorySessionRepository } from "./memory/memorySessionRepository.js";
import { createMemoryMenuRepository } from "./memory/memoryMenuRepository.js";

/* ---------------------------------------------------------------
   Repository wiring

   The only file that knows which storage is in use. To move to real
   databases, add PostgreSQL and Redis implementations of the
   contracts in types.ts and swap the factories below — services,
   controllers and middleware never import an implementation.
----------------------------------------------------------------*/

export const userRepository = createMemoryUserRepository();
export const sessionRepository = createMemorySessionRepository();
export const menuRepository = createMemoryMenuRepository();

export type RepositoryBackend = "memory" | "postgres-redis";

// Widened on purpose: callers must not assume which backend is live.
export const repositoryBackend = "memory" as RepositoryBackend;

export async function closeRepositories(): Promise<void> {
  await Promise.all([
    userRepository.close(),
    sessionRepository.close(),
    menuRepository.close(),
  ]);
}
