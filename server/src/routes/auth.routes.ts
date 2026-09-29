import { Router } from "express";
import * as auth from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/authenticate.js";
import { createAuthLimiters } from "../middlewares/rateLimit.js";

export function createAuthRouter(): Router {
  const router = Router();
  const limit = createAuthLimiters();

  // Auth responses carry Set-Cookie and user data; no cache may keep them.
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.post("/signup", limit.signup, auth.signup);
  router.post("/login", limit.login, auth.login);
  router.post("/refresh", limit.refresh, auth.refresh);
  router.post("/logout", auth.logout);
  router.post("/logout-all", requireAuth, auth.logoutEverywhere);
  router.patch(
    "/password",
    limit.passwordChange,
    requireAuth,
    auth.changePassword,
  );
  router.get("/me", requireAuth, auth.me);

  return router;
}
