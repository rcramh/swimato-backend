import type { NextFunction, Request, Response } from "express";
import { allowedOrigins } from "../config/env.js";
import { ERROR_CODES } from "../constants/errorCodes.js";
import { AuthorizationError } from "../errors/AppError.js";

/* ---------------------------------------------------------------
   CSRF defence: origin check

   Auth rides on cookies, which the browser attaches no matter which
   site started the request. SameSite=Lax already stops cross-site
   POSTs from carrying them; this is the second layer, and the one
   that still holds if cookies ever have to be SameSite=None (web app
   and API on unrelated domains).

   Browsers always send Origin on cross-origin state-changing
   requests, so a state-changing request whose Origin is not ours is
   refused. Requests with no Origin are non-browser clients (curl,
   server-to-server), which cannot ride a user's cookies anyway.
----------------------------------------------------------------*/

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Same-origin requests are trusted by definition: no other site can
// make a browser claim to be us. This is also what the CRA dev proxy
// sends — it rewrites Origin to its target (this API) on the way in.
const ownOrigin = (req: Request) =>
  `${req.protocol}://${req.get("host") ?? ""}`;

export function requireTrustedOrigin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const origin = req.get("origin");
  const isTrusted =
    SAFE_METHODS.has(req.method) ||
    origin === undefined ||
    origin === ownOrigin(req) ||
    allowedOrigins.includes(origin);

  if (!isTrusted) {
    throw new AuthorizationError(
      "Request origin is not allowed",
      ERROR_CODES.ORIGIN_NOT_ALLOWED,
    );
  }

  next();
}
