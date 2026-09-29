import type { AccessClaims } from "../services/token.service.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth once the access token and session check out. */
      auth?: AccessClaims;
    }
  }
}

export {};
