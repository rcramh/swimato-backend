import { env } from "../src/config/env.js";
import { createDatabase } from "../src/database/postgres.js";
import seed from "../src/database/seed/restaurantMenus.json" with { type: "json" };
import { menuSeedSchema } from "../src/database/seed/restaurantMenus.schema.js";
import { seedMenus } from "../src/database/seed/seedMenus.js";
import { logger } from "../src/logger/logger.js";

/* Loads src/database/seed/restaurantMenus.json into PostgreSQL. Safe to
   re-run: see seedMenus.ts. Run `npm run db:migrate` first. */

if (!env.DATABASE_URL) {
  logger.fatal("DATABASE_URL is not set; nothing to seed");
  process.exit(1);
}

const parsed = menuSeedSchema.safeParse(seed);
if (!parsed.success) {
  logger.fatal({ issues: parsed.error.issues }, "seed file is invalid");
  process.exit(1);
}

const database = createDatabase({
  url: env.DATABASE_URL,
  poolMax: 1,
  statementTimeoutMs: 60_000,
});

try {
  const summary = await seedMenus(database.db, parsed.data);
  logger.info(summary, "menus seeded");
} catch (error) {
  logger.fatal({ err: error }, "seeding failed");
  process.exitCode = 1;
} finally {
  await database.close();
}
