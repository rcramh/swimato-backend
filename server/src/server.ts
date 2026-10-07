import type { Server } from "node:http";
import { createApp } from "./app.js";
import { env, isProduction } from "./config/env.js";
import { connectMongo, disconnectMongo } from "./database/mongo.js";
import { logger } from "./logger/logger.js";
import { closeRepositories, storage } from "./repositories/index.js";
import { seedAdmin } from "./services/auth.service.js";

/* ---------------------------------------------------------------
   Entry point

   Connect dependencies before listening, so the process never
   accepts a request it has nothing to answer with. On SIGTERM/SIGINT:
   stop accepting, let in-flight requests finish, close every
   connection, exit — with a hard deadline in case something hangs.
----------------------------------------------------------------*/

const SHUTDOWN_DEADLINE_MS = 10_000;

// Must outlast the load balancer's idle timeout (60s on AWS ALB), or
// the balancer reuses a socket Node already closed and the user gets
// a sporadic 502.
const KEEP_ALIVE_TIMEOUT_MS = 65_000;

let server: Server | undefined;
let shuttingDown = false;

async function start(): Promise<void> {
  await connectMongo();

  logger.info({ storage }, "storage backends");
  if (isProduction && storage.users === "memory") {
    logger.warn(
      "in-memory users and sessions in production: lost on restart and not shared between instances",
    );
  }

  if (env.SEED_ADMIN_EMAIL && env.SEED_ADMIN_PASSWORD) {
    await seedAdmin(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
  }

  server = createApp().listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "api listening");
  });
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = KEEP_ALIVE_TIMEOUT_MS + 1_000;
}

async function closeResources(): Promise<void> {
  const results = await Promise.allSettled([
    closeRepositories(),
    disconnectMongo(),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      logger.error({ err: result.reason }, "error while closing a resource");
    }
  }
}

function shutdown(reason: string, exitCode = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, "shutting down");

  setTimeout(() => {
    logger.fatal("forced exit: shutdown deadline exceeded");
    process.exit(1);
  }, SHUTDOWN_DEADLINE_MS).unref();

  const finish = () => {
    void closeResources().finally(() => {
      logger.info("shutdown complete");
      logger.flush();
      process.exit(exitCode);
    });
  };

  if (!server) {
    finish();
    return;
  }

  // Stop accepting; idle keep-alive sockets would otherwise hold
  // close() open until they time out.
  server.close(finish);
  server.closeIdleConnections();
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled promise rejection");
  shutdown("unhandledRejection", 1);
});

// After an uncaught exception the process state is unknown; log, try
// to drain, and exit non-zero so the orchestrator restarts us.
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  shutdown("uncaughtException", 1);
});

try {
  await start();
} catch (error) {
  logger.fatal({ err: error }, "failed to start");
  await closeResources();
  logger.flush();
  process.exit(1);
}
