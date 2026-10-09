import { Router } from "express";
import { requireTrustedOrigin } from "../middlewares/originCheck.js";
import { createApiLimiter } from "../middlewares/rateLimit.js";
import { createAdminRouter } from "./admin.routes.js";
import { createAuthRouter } from "./auth.routes.js";
import { createRestaurantRouter } from "./restaurant.routes.js";

/** Everything under /api/v1. A future v2 gets its own router beside it. */
export function createApiRouter(): Router {
  const router = Router();

  // First, so a flood is turned away before any other work is done.
  // Health probes live outside /api/v1 and are never limited.
  router.use(createApiLimiter());
  router.use(requireTrustedOrigin);

  router.use("/auth", createAuthRouter());
  router.use("/admin", createAdminRouter());
  router.use("/restaurants", createRestaurantRouter());

  return router;
}
