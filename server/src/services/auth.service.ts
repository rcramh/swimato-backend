import { randomUUID } from "node:crypto";
import { ERROR_CODES } from "../constants/errorCodes.js";
import { AuthenticationError, ConflictError } from "../errors/AppError.js";
import { moduleLogger } from "../logger/logger.js";
import { sessionRepository, userRepository } from "../repositories/index.js";
import { DuplicateKeyError } from "../repositories/errors.js";
import type { User } from "../repositories/types.js";
import {
  burnPasswordCheck,
  hashPassword,
  verifyPassword,
} from "../utils/password.js";
import type {
  ChangePasswordInput,
  LoginInput,
  SignupInput,
} from "../validators/auth.validators.js";
import {
  REFRESH_TTL_SECONDS,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type AccessClaims,
} from "./token.service.js";
import { toPublicUser, type PublicUser } from "./user.service.js";

/* ---------------------------------------------------------------
   Auth service

   Knows nothing about HTTP or cookies: it takes validated input and
   returns the user plus tokens. The controller turns tokens into
   cookies. Security events are logged here, by user id — never with
   the password, the token, or (for failed logins) the email.
----------------------------------------------------------------*/

const log = moduleLogger("auth");

// Two tabs whose access tokens expire together both call /refresh
// with the same cookie. The first rotates; the second arrives with a
// jti one step old. Inside this window that is a race, not theft, so
// it gets a fresh access token and keeps the session.
export const ROTATION_GRACE_MS = 15 * 1000;

export interface RequestMeta {
  userAgent: string;
  ip: string;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  // Absent when the browser already holds the current refresh token.
  refreshToken?: string;
}

async function startSession(
  user: User,
  meta: RequestMeta,
): Promise<AuthResult> {
  const sid = randomUUID();
  const jti = randomUUID();

  await sessionRepository.create(
    { sid, userId: user.id, jti, userAgent: meta.userAgent, ip: meta.ip },
    REFRESH_TTL_SECONDS,
  );

  return {
    user: toPublicUser(user),
    accessToken: signAccessToken({ userId: user.id, role: user.role, sid }),
    refreshToken: signRefreshToken({ userId: user.id, sid, jti }),
  };
}

export async function signup(
  input: SignupInput,
  meta: RequestMeta,
): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);

  let user: User;
  try {
    user = await userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: "user",
    });
  } catch (error) {
    if (error instanceof DuplicateKeyError) {
      throw new ConflictError(
        "An account with this email already exists",
        ERROR_CODES.EMAIL_TAKEN,
      );
    }
    throw error;
  }

  log.info({ userId: user.id }, "user signed up");
  return startSession(user, meta);
}

export async function login(
  input: LoginInput,
  meta: RequestMeta,
): Promise<AuthResult> {
  const invalid = () =>
    new AuthenticationError(
      "Invalid email or password",
      ERROR_CODES.INVALID_CREDENTIALS,
    );

  const user = await userRepository.findByEmail(input.email);

  if (!user) {
    await burnPasswordCheck(input.password);
    log.info({ reason: "unknown_email", ip: meta.ip }, "login failed");
    throw invalid();
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    log.info(
      { reason: "wrong_password", userId: user.id, ip: meta.ip },
      "login failed",
    );
    throw invalid();
  }

  log.info({ userId: user.id }, "user logged in");
  return startSession(user, meta);
}

export async function refresh(
  refreshToken: string | undefined,
): Promise<AuthResult> {
  if (!refreshToken) throw new AuthenticationError();

  const { userId, sid, jti } = verifyRefreshToken(refreshToken);

  const session = await sessionRepository.get(sid);
  if (session?.userId !== userId) throw new AuthenticationError();

  const user = await userRepository.findById(userId);
  if (!user) {
    await sessionRepository.delete(sid);
    throw new AuthenticationError();
  }

  const publicUser = toPublicUser(user);
  const accessToken = signAccessToken({ userId, role: user.role, sid });

  if (session.jti !== jti) {
    const isRecentRace =
      jti === session.prevJti &&
      session.rotatedAt !== null &&
      Date.now() - session.rotatedAt < ROTATION_GRACE_MS;

    if (isRecentRace) {
      // The browser already holds the newer refresh cookie from the
      // request that won; sending none leaves it in place.
      return { user: publicUser, accessToken };
    }

    // A rotated-out token came back after the grace window: a copy is
    // being replayed. End the session so neither holder keeps it.
    await sessionRepository.delete(sid);
    log.warn({ userId, sid }, "refresh token reuse detected, session revoked");
    throw new AuthenticationError(
      "Session expired, please sign in again",
      ERROR_CODES.SESSION_REVOKED,
    );
  }

  const nextJti = randomUUID();
  const rotated = await sessionRepository.rotate(
    sid,
    jti,
    nextJti,
    REFRESH_TTL_SECONDS,
  );

  // Lost a race with a concurrent refresh between get() and rotate():
  // the winner set the new cookie, this response only needs access.
  if (!rotated) return { user: publicUser, accessToken };

  return {
    user: publicUser,
    accessToken,
    refreshToken: signRefreshToken({ userId, sid, jti: nextJti }),
  };
}

/**
 * Verifies the access token and that its session still exists, so a
 * logout or password change takes effect immediately rather than when
 * the 15-minute token runs out. One key lookup per request in Redis.
 */
export async function authenticate(
  accessToken: string | undefined,
): Promise<AccessClaims> {
  if (!accessToken) throw new AuthenticationError();

  const claims = verifyAccessToken(accessToken);
  const session = await sessionRepository.get(claims.sid);

  if (session?.userId !== claims.userId) {
    throw new AuthenticationError(
      "Session has ended, please sign in again",
      ERROR_CODES.SESSION_REVOKED,
    );
  }

  return claims;
}

// Always succeeds from the caller's view: a missing or broken cookie
// still ends in cleared cookies, so logout can never leave a user stuck.
export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;

  let sid: string;
  try {
    ({ sid } = verifyRefreshToken(refreshToken));
  } catch (error) {
    if (error instanceof AuthenticationError) return; // nothing to revoke
    throw error;
  }

  await sessionRepository.delete(sid);
}

export async function logoutEverywhere(userId: string): Promise<void> {
  await sessionRepository.deleteAllForUser(userId);
  log.info({ userId }, "all sessions revoked");
}

/**
 * Changes the password and ends every other session: whoever might
 * know the old password is signed out. The current device stays in.
 */
export async function changePassword(
  auth: AccessClaims,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await userRepository.findById(auth.userId);
  if (!user) throw new AuthenticationError();

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AuthenticationError(
      "Current password is incorrect",
      ERROR_CODES.INVALID_CREDENTIALS,
    );
  }

  const updated = await userRepository.updatePasswordHash(
    user.id,
    await hashPassword(input.newPassword),
  );
  if (!updated) throw new AuthenticationError();

  await sessionRepository.deleteAllForUser(user.id, { exceptSid: auth.sid });
  log.info({ userId: user.id }, "password changed, other sessions revoked");
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await userRepository.findById(userId);
  if (!user) throw new AuthenticationError();
  return toPublicUser(user);
}

/** Creates the bootstrap admin if that email is free. Idempotent. */
export async function seedAdmin(
  email: string,
  password: string,
): Promise<boolean> {
  const normalised = email.trim().toLowerCase();
  if (await userRepository.findByEmail(normalised)) return false;

  try {
    await userRepository.create({
      name: "Admin",
      email: normalised,
      passwordHash: await hashPassword(password),
      role: "admin",
    });
  } catch (error) {
    // Another instance seeded it between our check and insert.
    if (error instanceof DuplicateKeyError) return false;
    throw error;
  }

  log.info({ email: normalised }, "admin account seeded");
  return true;
}
