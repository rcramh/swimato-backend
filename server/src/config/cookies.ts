import type { CookieOptions } from "express";
import { env } from "./env.js";
import { API_PREFIX } from "../constants/http.js";

/* ---------------------------------------------------------------
   Cookie policy

   Single source of truth for how auth cookies are written, so the
   same code runs against a local dev proxy (same-origin, Lax, not
   Secure) and a deployed subdomain split (Secure, shared Domain)
   with nothing but environment changes.
----------------------------------------------------------------*/

export const ACCESS_COOKIE = "swimato_access";
export const REFRESH_COOKIE = "swimato_refresh";

// Scoped to the auth routes (refresh and logout both need it), so the
// long-lived refresh token is not attached to every ordinary request.
export const REFRESH_COOKIE_PATH = `${API_PREFIX}/auth`;

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

// Clearing only works when path/domain/sameSite match the Set-Cookie
// that created it, so both halves are derived from the same base.
export const clearAccessCookieOptions = (): CookieOptions => ({
  ...baseOptions(),
  path: "/",
});

export const clearRefreshCookieOptions = (): CookieOptions => ({
  ...baseOptions(),
  path: REFRESH_COOKIE_PATH,
});

export const accessCookieOptions = (): CookieOptions => ({
  ...clearAccessCookieOptions(),
  maxAge: env.ACCESS_TOKEN_TTL_MIN * MS_PER_MINUTE,
});

export const refreshCookieOptions = (): CookieOptions => ({
  ...clearRefreshCookieOptions(),
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * MS_PER_DAY,
});
