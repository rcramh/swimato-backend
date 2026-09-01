import "dotenv/config";
import { z } from "zod";

/* ---------------------------------------------------------------
   Environment

   Every setting the server reads goes through this schema, so a
   missing or malformed variable fails loudly at boot instead of
   surfacing as `undefined` somewhere deep in a request handler.
----------------------------------------------------------------*/

// z.coerce.boolean() is a trap: it follows JS truthiness, so the
// string "false" coerces to true. Parse the two literals instead.
const boolish = (fallback) =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((value) => value === "true");

// Cookie domain is only meaningful when sharing cookies across
// subdomains; an empty value must reach the cookie API as undefined.
const optionalString = z
  .string()
  .default("")
  .transform((value) => value.trim() || undefined);

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(5000),

    MONGO_URI: z.string().min(1, "MONGO_URI is required"),

    // Browser origin allowed to send credentialed requests. Ignored
    // when the frontend proxies /api, since that is same-origin.
    CLIENT_ORIGIN: z.string().default("http://localhost:3000"),

    // Signs the stateless access JWT. Refresh tokens are opaque
    // random strings verified by database lookup, so they need no key.
    ACCESS_TOKEN_SECRET: z
      .string()
      .min(32, "ACCESS_TOKEN_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(30),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    COOKIE_SECURE: boolish("false"),
    COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
    COOKIE_DOMAIN: optionalString,
  })
  .superRefine((value, ctx) => {
    // Browsers silently drop SameSite=None cookies that are not Secure,
    // which reads as "login does nothing" with no error anywhere.
    if (value.COOKIE_SAMESITE === "none" && !value.COOKIE_SECURE) {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE must be true when COOKIE_SAMESITE is none",
      });
    }

    if (value.NODE_ENV === "production" && !value.COOKIE_SECURE) {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE must be true in production",
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");

  console.error(`\nInvalid environment configuration:\n${details}\n`);
  console.error("Copy server/.env.example to server/.env and fill it in.\n");
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
