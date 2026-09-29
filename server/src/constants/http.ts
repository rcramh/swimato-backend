export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

export const REQUEST_ID_HEADER = "X-Request-Id";

// A JSON auth payload is a few hundred bytes; the default 100kb limit
// is a needlessly large thing to hand an unauthenticated caller.
export const JSON_BODY_LIMIT = "10kb";

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;
