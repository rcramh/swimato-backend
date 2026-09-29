import type { Role } from "../constants/roles.js";
import { userRepository } from "../repositories/index.js";
import type { User } from "../repositories/types.js";
import { decodeUserCursor, encodeUserCursor } from "../utils/cursor.js";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

// The only shape of a user that ever leaves the server: an explicit
// allowlist, so a new column (say, a reset token) is private by default.
export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt.toISOString(),
});

export interface UserPage {
  users: PublicUser[];
  nextCursor: string | null;
}

export async function listUsers({
  limit,
  cursor,
}: {
  limit: number;
  cursor?: string | undefined;
}): Promise<UserPage> {
  const after = cursor ? decodeUserCursor(cursor) : undefined;

  // One extra row tells us whether another page exists without a
  // separate COUNT query.
  const rows = await userRepository.list({
    limit: limit + 1,
    ...(after ? { after } : {}),
  });

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const hasMore = rows.length > limit;

  return {
    users: page.map(toPublicUser),
    nextCursor: hasMore && last ? encodeUserCursor(last) : null,
  };
}
