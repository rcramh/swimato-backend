import { rateLimit, type Options } from "express-rate-limit";
import { RateLimitError } from "../errors/AppError.js";

/* ---------------------------------------------------------------
   Rate limits

   Factories, not singletons: each app instance (and each test) gets
   its own counters. Counters live in process memory for now; once
   Redis is in, pass `store: new RedisStore(...)` (rate-limit-redis)
   so limits hold across restarts and multiple instances.
----------------------------------------------------------------*/

const MINUTE_MS = 60 * 1000;

interface LimiterConfig {
  windowMinutes: number;
  limit: number;
  message: string;
  skipSuccessfulRequests?: boolean;
}

const createLimiter = ({
  windowMinutes,
  limit,
  message,
  skipSuccessfulRequests = false,
}: LimiterConfig) =>
  rateLimit({
    windowMs: windowMinutes * MINUTE_MS,
    limit,
    skipSuccessfulRequests,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: ((_req, _res, next) => {
      next(new RateLimitError(message));
    }) satisfies Options["handler"],
  });

export const createAuthLimiters = () => ({
  // Password guessing: tight, and only failures count, so a user who
  // signs in and out a lot is never locked out by their own successes.
  login: createLimiter({
    windowMinutes: 15,
    limit: 10,
    skipSuccessfulRequests: true,
    message: "Too many sign-in attempts, try again in 15 minutes",
  }),

  signup: createLimiter({
    windowMinutes: 60,
    limit: 10,
    message: "Too many accounts created from here, try again later",
  }),

  // Every open tab refreshes every 15 minutes, so this stays generous.
  refresh: createLimiter({
    windowMinutes: 15,
    limit: 60,
    message: "Too many requests, try again shortly",
  }),

  // Guessing the current password through this endpoint is as bad as
  // guessing it at login.
  passwordChange: createLimiter({
    windowMinutes: 15,
    limit: 5,
    skipSuccessfulRequests: true,
    message: "Too many attempts, try again in 15 minutes",
  }),
});
