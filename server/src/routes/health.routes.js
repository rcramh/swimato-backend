import { Router } from "express";
import { dbStatus } from "../config/db.js";
import { env } from "../config/env.js";

const router = Router();

/* Liveness plus a database probe. Hosting platforms poll this to decide
   whether an instance is healthy, so it answers 503 when Mongo is gone
   even though the process itself is fine. */
router.get("/health", (_req, res) => {
  const db = dbStatus();
  const ok = db === "connected";

  res.status(ok ? 200 : 503).json({
    ok,
    env: env.NODE_ENV,
    db,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
