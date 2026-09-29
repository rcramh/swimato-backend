import { Router } from "express";
import * as admin from "../controllers/admin.controller.js";
import { requireAuth, requireRole } from "../middlewares/authenticate.js";

export function createAdminRouter(): Router {
  const router = Router();

  // Everything under /admin is admin-only.
  router.use(requireAuth, requireRole("admin"));

  router.get("/users", admin.getUsers);

  return router;
}
