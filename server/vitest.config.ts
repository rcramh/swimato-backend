import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Flows hash several bcrypt passwords; on a loaded CI runner the 5s
    // default is too tight and fails tests that are not actually broken.
    testTimeout: 20_000,
    // Set before src/config/env.ts is imported; dotenv never overrides
    // variables that already exist, so a developer's .env cannot leak in.
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      LOG_PRETTY: "false",
      MONGO_URI: "",
      CLIENT_ORIGIN: "http://localhost:3000",
      ACCESS_TOKEN_SECRET: "test-access-secret-0123456789-abcdefghijklmnop",
      REFRESH_TOKEN_SECRET: "test-refresh-secret-0123456789-abcdefghijklmno",
      ACCESS_TOKEN_TTL_MIN: "15",
      REFRESH_TOKEN_TTL_DAYS: "7",
      // Lowest allowed cost: tests exercise the flow, not the hash strength.
      BCRYPT_ROUNDS: "10",
      COOKIE_SECURE: "false",
      COOKIE_SAMESITE: "lax",
      COOKIE_DOMAIN: "",
      SEED_ADMIN_EMAIL: "",
      SEED_ADMIN_PASSWORD: "",
      API_DOCS_ENABLED: "true",
    },
  },
});
