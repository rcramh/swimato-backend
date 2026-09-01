import { env } from "./env.js";

/* ---------------------------------------------------------------
   Cookie policy

   Single source of truth for how auth cookies are written, so the
   same code runs against a local dev proxy (same-origin, Lax, not
   Secure) and a deployed subdomain split (Secure, shared Domain)
   with nothing but environment changes.

   Nothing consumes this yet — the auth routes land in phase 2.
----------------------------------------------------------------*/

export const ACCESS_COOKIE = "swimato_access";
export const REFRESH_COOKIE = "swimato_refresh";

// Scoped to the one endpoint that needs it, so the long-lived refresh
// token is not attached to every ordinary API request.
export const REFRESH_COOKIE_PATH = "/api/auth/refresh";

const baseOptions = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  domain: env.COOKIE_DOMAIN,
});

export const accessCookieOptions = () => ({
  ...baseOptions(),
  path: "/",
  maxAge: env.ACCESS_TOKEN_TTL_MIN * 60 * 1000,
});

export const refreshCookieOptions = () => ({
  ...baseOptions(),
  path: REFRESH_COOKIE_PATH,
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
});

// Clearing only works when path/domain/sameSite match the Set-Cookie
// that created it, so both halves are derived from the same base.
export const clearAccessCookieOptions = () => {
  const { maxAge, ...rest } = accessCookieOptions();
  return rest;
};

export const clearRefreshCookieOptions = () => {
  const { maxAge, ...rest } = refreshCookieOptions();
  return rest;
};
