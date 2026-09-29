import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { pinoHttp } from "pino-http";
import { REQUEST_ID_HEADER } from "../constants/http.js";
import { logger } from "../logger/logger.js";
import { runWithRequestContext } from "../logger/requestContext.js";

/* ---------------------------------------------------------------
   Request context, logging and correlation IDs

   Every request gets an id: the caller's X-Request-Id when it looks
   sane (so a trace can span the load balancer and this service),
   otherwise a fresh UUID. It is echoed in the response header,
   returned in error bodies, and attached to every log line written
   while the request runs — including lines from services.

   One access-log line per request on completion: method, path,
   status, duration, user id. Headers are never logged, so cookies
   and tokens do not reach the log pipeline in the first place.
----------------------------------------------------------------*/

// Long or odd ids from outside would let a caller forge log lines.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

const PROBE_PATHS = new Set(["/health", "/ready"]);

type ExpressRequest = IncomingMessage & Partial<Pick<Request, "originalUrl">>;

const pathOf = (req: ExpressRequest) => req.originalUrl ?? req.url ?? "";

/** First middleware: assigns the id and opens the async context. */
export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incoming = req.get(REQUEST_ID_HEADER);
  const requestId =
    incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();

  req.id = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  runWithRequestContext({ requestId }, next);
}

export const requestLogger = pinoHttp({
  logger,
  // Reuse the id requestContext assigned (it runs first, see app.ts).
  genReqId: (req) => req.id,
  // Load balancers poll these every few seconds; logging them is noise.
  autoLogging: { ignore: (req) => PROBE_PATHS.has(req.url ?? "") },
  // 4xx are the client's mistake (and 401 is routine before a refresh),
  // so they stay at info; only server failures are errors.
  customLogLevel: (_req, res, error) =>
    error || res.statusCode >= 500 ? "error" : "info",
  customSuccessMessage: (req: ExpressRequest, res, responseTime) =>
    `${req.method ?? ""} ${pathOf(req)} ${res.statusCode} ${Math.round(responseTime)}ms`,
  customErrorMessage: (req: ExpressRequest, res) =>
    `${req.method ?? ""} ${pathOf(req)} ${res.statusCode} failed`,
  customAttributeKeys: { responseTime: "durationMs" },
  // requestId and userId come from the logger's mixin (the request's
  // async context), so the access line carries them exactly once.
  serializers: {
    req: (req: { method: string; url: string }) => ({
      method: req.method,
      url: req.url,
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});
