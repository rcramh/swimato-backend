/* ---------------------------------------------------------------
   Error codes

   The stable, machine-readable half of every error response. The
   frontend branches on these, never on message text, so messages
   can be reworded freely. Adding a code is fine; renaming one is a
   breaking API change.
----------------------------------------------------------------*/

export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INVALID_JSON: "INVALID_JSON",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",

  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  SESSION_REVOKED: "SESSION_REVOKED",
  FORBIDDEN: "FORBIDDEN",
  ORIGIN_NOT_ALLOWED: "ORIGIN_NOT_ALLOWED",

  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  EMAIL_TAKEN: "EMAIL_TAKEN",
  CONFLICT: "CONFLICT",

  RATE_LIMITED: "RATE_LIMITED",

  DATABASE_ERROR: "DATABASE_ERROR",
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
