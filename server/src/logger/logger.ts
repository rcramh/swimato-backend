import { pino, type LoggerOptions } from "pino";
import { env } from "../config/env.js";
import { getRequestContext } from "./requestContext.js";

/* ---------------------------------------------------------------
   Logger

   One pino instance for the process. Output is one JSON object per
   line (timestamp, level, service, requestId, ...), which ELK,
   CloudWatch, Datadog and Loki all ingest without a parser.

   Redaction is the last line of defence: code should not log secrets
   in the first place, but if a cookie header or a password field
   ever ends up in a log object, it is censored here.
----------------------------------------------------------------*/

const REDACTED_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "password",
  "*.password",
  "currentPassword",
  "*.currentPassword",
  "newPassword",
  "*.newPassword",
  "passwordHash",
  "*.passwordHash",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "token",
  "*.token",
];

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: "swimato-api", env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  // "level":"info" reads better in every log UI than "level":30.
  formatters: { level: (label) => ({ level: label }) },
  redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
  // Inside a request, every line gets its requestId (and userId once
  // authenticated) without callers passing them around.
  mixin: () => {
    const context = getRequestContext();
    return context ? { ...context } : {};
  },
  // A line's own fields win over the mixin, so nothing is duplicated.
  mixinMergeStrategy: (mergeObject, mixinObject) =>
    Object.assign(mixinObject, mergeObject),
  ...(env.LOG_PRETTY
    ? {
        transport: {
          target: "pino-pretty",
          options: { translateTime: "SYS:HH:MM:ss.l", ignore: "service,env" },
        },
      }
    : {}),
};

export const logger = pino(options);

// A child per module, so every line says where it came from.
export const moduleLogger = (module: string) => logger.child({ module });
