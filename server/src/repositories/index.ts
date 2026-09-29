import { createMemoryUserRepository } from "./memory/memoryUserRepository.js";
import { createMemorySessionRepository } from "./memory/memorySessionRepository.js";

/* ---------------------------------------------------------------
   Repository wiring

   The only file that knows which storage is in use. To move to real
   databases, add PostgreSQL and Redis implementations of the
   contracts in types.ts and swap the two factories below — services,
   controllers and middleware never import an implementation.
----------------------------------------------------------------*/

export const userRepository = createMemoryUserRepository();
export const sessionRepository = createMemorySessionRepository();

export type RepositoryBackend = "memory" | "postgres-redis";

// Widened on purpose: callers must not assume which backend is live.
export const repositoryBackend = "memory" as RepositoryBackend;

export async function closeRepositories(): Promise<void> {
  await Promise.all([userRepository.close(), sessionRepository.close()]);
}
