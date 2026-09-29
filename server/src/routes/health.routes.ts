import { Router } from "express";
import { liveness, readiness } from "../controllers/health.controller.js";

// Mounted at the root, outside /api/v1: probes belong to the
// infrastructure contract, not the versioned public API.
export function createHealthRouter(): Router {
  const router = Router();

  router.get("/health", liveness);
  router.get("/ready", readiness);

  return router;
}
