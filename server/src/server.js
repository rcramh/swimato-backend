import app from "./app.js";
import { env } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/db.js";

/* ---------------------------------------------------------------
   Entry point

   Connect before listening, so the process never accepts a request
   it has no database to answer with.
----------------------------------------------------------------*/

let server;

try {
  await connectDb();

  server = app.listen(env.PORT, () => {
    console.log(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
} catch (error) {
  console.error("[api] failed to start:", error.message);
  process.exit(1);
}

// Finish in-flight requests, then let go of the database. Without this
// a redeploy can cut a response off mid-write.
const shutdown = async (signal) => {
  console.log(`\n[api] ${signal} received, shutting down`);

  server?.close(async () => {
    await disconnectDb();
    process.exit(0);
  });

  setTimeout(() => {
    console.error("[api] forced exit after 10s");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("[api] unhandled rejection:", reason);
  shutdown("unhandledRejection");
});
