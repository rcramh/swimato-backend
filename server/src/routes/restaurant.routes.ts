import { Router } from "express";
import * as restaurant from "../controllers/restaurant.controller.js";

// Public: menus are the same for everyone and need no sign-in.
export function createRestaurantRouter(): Router {
  const router = Router();

  router.get("/:restaurantId/menu", restaurant.getMenu);

  return router;
}
