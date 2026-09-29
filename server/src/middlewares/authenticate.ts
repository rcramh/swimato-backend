import type { NextFunction, Request, Response } from "express";
import { ACCESS_COOKIE } from "../config/cookies.js";
import type { Role } from "../constants/roles.js";
import { AuthenticationError, AuthorizationError } from "../errors/AppError.js";
import { setContextUserId } from "../logger/requestContext.js";
import { authenticate } from "../services/auth.service.js";
import type { AccessClaims } from "../services/token.service.js";

/* ---------------------------------------------------------------
   Authentication and authorization

   requireAuth  — who are you? Verifies the access cookie and that
                  its session is still live, then sets req.auth.

   requireRole  — are you allowed? 403, not 401: the caller is signed
                  in, just not permitted, and refreshing the token
                  will not change that.
----------------------------------------------------------------*/

const readCookie = (req: Request, name: string): string | undefined => {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
    name
  ];
  return typeof value === "string" ? value : undefined;
};

export { readCookie };

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  req.auth = await authenticate(readCookie(req, ACCESS_COOKIE));
  setContextUserId(req.auth.userId);
  next();
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) throw new AuthenticationError();
    if (!roles.includes(req.auth.role)) throw new AuthorizationError();
    next();
  };

/** For handlers mounted behind requireAuth: the typed, non-null claims. */
export function getAuth(req: Request): AccessClaims {
  if (!req.auth) throw new AuthenticationError();
  return req.auth;
}
