import type { Role } from "../constants/roles.js";

/* ---------------------------------------------------------------
   Repository contracts

   Services depend on these interfaces only. Today they are backed by
   in-memory implementations; PostgreSQL (users) and Redis (sessions)
   implement the same contracts next, wired in repositories/index.ts.
----------------------------------------------------------------*/

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewUser {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}

// Keyset position: the last row of the previous page. Maps directly to
// `WHERE (created_at, id) > ($1, $2) ORDER BY created_at, id` in SQL,
// which stays fast at any depth, unlike OFFSET.
export interface UserListCursor {
  createdAt: Date;
  id: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  // Emails arrive normalised (trimmed, lowercased) from the validators.
  findByEmail(email: string): Promise<User | null>;
  /** @throws DuplicateKeyError when the email is taken */
  create(input: NewUser): Promise<User>;
  /** @returns false when no user has that id */
  updatePasswordHash(id: string, passwordHash: string): Promise<boolean>;
  list(options: { limit: number; after?: UserListCursor }): Promise<User[]>;
  /** Throws when the backing store is unreachable (readiness probe). */
  ping(): Promise<void>;
  close(): Promise<void>;
}

export interface Session {
  sid: string;
  userId: string;
  // The only refresh-token id currently allowed to use this session.
  jti: string;
  // The one it replaced, and when — for the concurrent-refresh grace.
  prevJti: string | null;
  rotatedAt: number | null;
  userAgent: string;
  ip: string;
  createdAt: number;
  expiresAt: number;
}

export interface NewSession {
  sid: string;
  userId: string;
  jti: string;
  userAgent: string;
  ip: string;
}

export interface SessionRepository {
  create(input: NewSession, ttlSeconds: number): Promise<void>;
  get(sid: string): Promise<Session | null>;
  /**
   * Compare-and-set: swaps `expectedJti` for `nextJti` and renews the TTL.
   * Must be atomic (a Lua script in Redis). Returns false when the
   * session is gone or another request rotated first.
   */
  rotate(
    sid: string,
    expectedJti: string,
    nextJti: string,
    ttlSeconds: number,
  ): Promise<boolean>;
  delete(sid: string): Promise<void>;
  deleteAllForUser(
    userId: string,
    options?: { exceptSid?: string },
  ): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/* ---------------------------------- restaurant menus */

export interface RestaurantSummary {
  id: string;
  name: string;
  city: string;
  areaName: string;
  cuisines: string[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  imageId: string | null;
  isVeg: boolean;
  // Integer paise, never floating rupees, so totals cannot drift.
  pricePaise: number;
  rating: number | null;
  ratingCount: number | null;
}

export interface MenuCategory {
  id: string;
  title: string;
  items: MenuItem[];
}

export interface RestaurantMenu {
  restaurant: RestaurantSummary;
  categories: MenuCategory[];
}

export interface MenuRepository {
  /** Categories and items in display order, or null if none is stored. */
  findByRestaurantId(restaurantId: string): Promise<RestaurantMenu | null>;
  ping(): Promise<void>;
  close(): Promise<void>;
}
