import { randomUUID } from "node:crypto";
import { DuplicateKeyError } from "../errors.js";
import type {
  NewUser,
  User,
  UserListCursor,
  UserRepository,
} from "../types.js";

/* ---------------------------------------------------------------
   User repository — in-memory

   Development stand-in for PostgreSQL. Every method is async and
   returns copies, so callers already behave as they will against a
   real database: nothing can mutate a stored row through a reference.

   Single-process only: state is lost on restart and not shared
   between instances. The Postgres version implements the same
   contract against:

     CREATE EXTENSION IF NOT EXISTS citext;
     CREATE TABLE users (
       id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       name          text        NOT NULL,
       email         citext      NOT NULL UNIQUE,
       password_hash text        NOT NULL,
       role          text        NOT NULL DEFAULT 'user'
                                 CHECK (role IN ('user', 'admin')),
       created_at    timestamptz NOT NULL DEFAULT now(),
       updated_at    timestamptz NOT NULL DEFAULT now()
     );
     CREATE INDEX users_created_at_id_idx ON users (created_at, id);
----------------------------------------------------------------*/

const isAfter = (user: User, cursor: UserListCursor) =>
  user.createdAt > cursor.createdAt ||
  (user.createdAt.getTime() === cursor.createdAt.getTime() &&
    user.id > cursor.id);

const byCreatedThenId = (a: User, b: User) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

export function createMemoryUserRepository(): UserRepository {
  const byId = new Map<string, User>();
  const idByEmail = new Map<string, string>();

  const copy = (user: User | undefined) =>
    user ? structuredClone(user) : null;

  return {
    findById(id) {
      return Promise.resolve(copy(byId.get(id)));
    },

    findByEmail(email) {
      const id = idByEmail.get(email);
      return Promise.resolve(id ? copy(byId.get(id)) : null);
    },

    create(input: NewUser) {
      if (idByEmail.has(input.email)) {
        return Promise.reject(new DuplicateKeyError("email"));
      }

      const now = new Date();
      const user: User = {
        id: randomUUID(),
        ...input,
        createdAt: now,
        updatedAt: now,
      };

      byId.set(user.id, user);
      idByEmail.set(user.email, user.id);
      return Promise.resolve(structuredClone(user));
    },

    updatePasswordHash(id, passwordHash) {
      const user = byId.get(id);
      if (!user) return Promise.resolve(false);

      user.passwordHash = passwordHash;
      user.updatedAt = new Date();
      return Promise.resolve(true);
    },

    list({ limit, after }) {
      const page = [...byId.values()]
        .filter((user) => !after || isAfter(user, after))
        .sort(byCreatedThenId)
        .slice(0, limit)
        .map((user) => structuredClone(user));

      return Promise.resolve(page);
    },

    ping: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
}
