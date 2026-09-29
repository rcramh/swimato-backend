import { Router } from "express";
import { requireTrustedOrigin } from "../middlewares/originCheck.js";
import { createAdminRouter } from "./admin.routes.js";
import { createAuthRouter } from "./auth.routes.js";

/** Everything under /api/v1. A future v2 gets its own router beside it. */
export function createApiRouter(): Router {
  const router = Router();

  router.use(requireTrustedOrigin);

  router.use("/auth", createAuthRouter());
  router.use("/admin", createAdminRouter());

  return router;
}
