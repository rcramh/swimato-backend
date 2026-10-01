import { ERROR_CODES } from "../constants/errorCodes.js";
import { NotFoundError } from "../errors/AppError.js";
import { menuRepository } from "../repositories/index.js";
import type { MenuCategory, RestaurantSummary } from "../repositories/types.js";

/* ---------------------------------------------------------------
   Restaurant menus

   Only one real menu exists so far (restaurant 47120). Until the
   database holds a menu per restaurant, any restaurant without its
   own menu is served that one as sample data, flagged with
   `isSample: true` and `menuOf` so the UI can say so honestly.

   When real menus are loaded, delete the fallback below: a
   restaurant without a menu then becomes a 404 MENU_NOT_FOUND.
----------------------------------------------------------------*/

export const SAMPLE_MENU_RESTAURANT_ID = "47120";

export interface RestaurantMenuView {
  restaurantId: string;
  // true when `categories` belong to another restaurant (see above)
  isSample: boolean;
  menuOf: RestaurantSummary;
  categories: MenuCategory[];
}

export async function getRestaurantMenu(
  restaurantId: string,
): Promise<RestaurantMenuView> {
  const ownMenu = await menuRepository.findByRestaurantId(restaurantId);
  const menu =
    ownMenu ??
    (await menuRepository.findByRestaurantId(SAMPLE_MENU_RESTAURANT_ID));

  if (!menu) {
    throw new NotFoundError(
      "No menu is available for this restaurant",
      ERROR_CODES.MENU_NOT_FOUND,
    );
  }

  return {
    restaurantId,
    isSample: ownMenu === null,
    menuOf: menu.restaurant,
    categories: menu.categories,
  };
}
