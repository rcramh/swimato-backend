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
const boolish = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((value) => value === "true");

// An empty variable must reach the code as undefined, not "".
const optionalString = z
  .string()
  .default("")
  .transform((value) => value.trim() || undefined);

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(5050),

    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    // Human-readable logs for local work; production keeps JSON lines
    // for the log shipper.
    LOG_PRETTY: boolish("false"),

    API_DOCS_ENABLED: boolish("true"),

    // Optional while auth runs on in-memory repositories; when set,
    // boot still fails fast if the cluster is unreachable.
    MONGO_URI: optionalString,

    // Browser origins allowed to call the API with credentials. The
    // same list drives CORS and the CSRF origin check.
    CLIENT_ORIGIN: z.string().default("http://localhost:3000"),

    // Separate keys, so a leaked access key cannot mint refresh tokens.
    ACCESS_TOKEN_SECRET: z
      .string()
      .min(32, "ACCESS_TOKEN_SECRET must be at least 32 characters"),
    REFRESH_TOKEN_SECRET: z
      .string()
      .min(32, "REFRESH_TOKEN_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

    // 12 rounds is ~250ms per hash on current hardware: slow enough to
    // hurt offline cracking, fast enough not to stall a login.
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    // Optional first admin, created at boot if the email is not taken.
    // Signup only ever creates plain users, so this is the way in.
    SEED_ADMIN_EMAIL: optionalString,
    SEED_ADMIN_PASSWORD: optionalString,

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

    if (value.ACCESS_TOKEN_SECRET === value.REFRESH_TOKEN_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["REFRESH_TOKEN_SECRET"],
        message: "REFRESH_TOKEN_SECRET must differ from ACCESS_TOKEN_SECRET",
      });
    }

    if (
      Boolean(value.SEED_ADMIN_EMAIL) !== Boolean(value.SEED_ADMIN_PASSWORD)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["SEED_ADMIN_PASSWORD"],
        message:
          "Set both SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD, or neither",
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

  // The logger reads its level from this very config, so it cannot
  // exist yet; stderr is the only honest channel left.
  // eslint-disable-next-line no-console
  console.error(
    `\nInvalid environment configuration:\n${details}\n\n` +
      "Copy server/.env.example to server/.env and fill it in.\n",
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

export const allowedOrigins: readonly string[] = env.CLIENT_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
