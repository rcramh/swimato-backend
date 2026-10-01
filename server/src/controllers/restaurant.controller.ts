import type { Request, Response } from "express";
import { getRestaurantMenu } from "../services/restaurant.service.js";
import { sendSuccess } from "../utils/response.js";
import { parseInput } from "../utils/validation.js";
import { restaurantIdParamsSchema } from "../validators/restaurant.validators.js";

// Menus change rarely and are the same for every visitor, so browsers
// and CDNs may reuse them briefly. Express adds an ETag as well, so a
// revalidation after expiry is a cheap 304 rather than a full body.
const MENU_CACHE_CONTROL = "public, max-age=300";

export async function getMenu(req: Request, res: Response) {
  const { restaurantId } = parseInput(restaurantIdParamsSchema, req.params);
  const menu = await getRestaurantMenu(restaurantId);

  res.set("Cache-Control", MENU_CACHE_CONTROL);
  sendSuccess(res, menu);
}
