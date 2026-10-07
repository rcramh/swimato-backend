import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { env } from "../src/config/env.js";
import { createDatabase } from "../src/database/postgres.js";
import { logger } from "../src/logger/logger.js";

/* Applies pending migrations from drizzle/ in order. Each migration
   runs once; applied ones are recorded in drizzle.__drizzle_migrations.

   Runs as its own step, not on server boot: with several instances
   starting at once, boot-time migrations would race each other. On
   Render this is the "pre-deploy command". */

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

if (!env.DATABASE_URL) {
  logger.fatal("DATABASE_URL is not set; nothing to migrate");
  process.exit(1);
}

const database = createDatabase({
  url: env.DATABASE_URL,
  poolMax: 1,
  // DDL such as building an index on a big table can take minutes.
  statementTimeoutMs: 10 * 60 * 1000,
});

try {
  await migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER });
  logger.info("migrations applied");
} catch (error) {
  logger.fatal({ err: error }, "migration failed");
  process.exitCode = 1;
} finally {
  await database.close();
}
