import seed from "../../database/seed/restaurantMenus.json" with { type: "json" };
import { menuSeedSchema } from "../../database/seed/restaurantMenus.schema.js";
import type { MenuRepository, RestaurantMenu } from "../types.js";

/* ---------------------------------------------------------------
   Menu repository — in-memory, read-only

   Serves the menus in database/seed/restaurantMenus.json until they
   move to PostgreSQL. The seed is validated once at startup (boot
   fails on a malformed file) and never mutated afterwards.

   The Postgres version implements the same contract against:

     restaurants     (id text PK, name, city, area_name, cuisines text[])
     menu_categories (id, restaurant_id FK, title, position)
     menu_items      (id text PK, category_id FK, name, description,
                      image_id, is_veg, price_paise int, rating numeric,
                      rating_count int, position)

   with a single JOIN ordered by category and item position.
----------------------------------------------------------------*/

function loadSeed(): Map<string, RestaurantMenu> {
  const parsed = menuSeedSchema.safeParse(seed);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `restaurantMenus.json is invalid at ${first?.path.join(".") ?? "(root)"}: ${first?.message ?? "unknown"}`,
    );
  }

  return new Map(
    parsed.data.menus.map((menu) => [menu.restaurant.id, menu] as const),
  );
}

export function createMemoryMenuRepository(): MenuRepository {
  const menusByRestaurant = loadSeed();

  return {
    findByRestaurantId(restaurantId) {
      const menu = menusByRestaurant.get(restaurantId);
      // A copy, so no caller can edit the shared seed by accident.
      return Promise.resolve(menu ? structuredClone(menu) : null);
    },

    ping: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
}
