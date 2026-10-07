import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { moduleLogger } from "../logger/logger.js";
import * as schema from "./schema.js";

/* ---------------------------------------------------------------
   PostgreSQL connection pool

   One pool per process. Opening a connection costs a TCP + TLS +
   auth round trip, so connections are reused across requests; `max`
   bounds how many this instance may hold.

   Timeouts make failures fast instead of silent:
   - connectionTimeoutMillis: give up acquiring a connection (DB down
     or pool exhausted) rather than queueing the request forever;
   - statement_timeout: Postgres itself cancels a runaway query;
   - idleTimeoutMillis: return unused connections to the server.
----------------------------------------------------------------*/

const log = moduleLogger("postgres");

const CONNECT_TIMEOUT_MS = 5_000;
const IDLE_TIMEOUT_MS = 30_000;

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  url: string;
  poolMax: number;
  statementTimeoutMs: number;
}

export function createDatabase({
  url,
  poolMax,
  statementTimeoutMs,
}: DatabaseOptions): DatabaseHandle {
  const pool = new pg.Pool({
    connectionString: url,
    max: poolMax,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    statement_timeout: statementTimeoutMs,
    // Shows up in pg_stat_activity, so a DBA can see who holds a lock.
    application_name: "swimato-api",
  });

  // An idle connection can die (DB restart, network blip). Without a
  // listener, that error is unhandled and crashes the process; with it,
  // the pool drops the connection and opens a fresh one next time.
  pool.on("error", (error) => {
    log.error({ err: error }, "idle client error");
  });

  return {
    db: drizzle(pool, { schema }),

    async ping() {
      await pool.query("SELECT 1");
    },

    async close() {
      await pool.end();
    },
  };
}
