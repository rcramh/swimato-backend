import type { Database, DatabaseHandle } from "../../database/postgres.js";
import { DatabaseError } from "../../errors/AppError.js";
import type { MenuRepository, RestaurantMenu } from "../types.js";

/* ---------------------------------------------------------------
   Menu repository — PostgreSQL

   One query returns restaurant → categories → items: Drizzle builds a
   single SQL statement with json aggregation, so there is no N+1
   (one query per category) however large the menu.

   Only what a customer may see is returned: an active restaurant,
   available items, and categories that still have items. A restaurant
   with nothing to show is "no menu" (null), same as the in-memory one.
----------------------------------------------------------------*/

type MenuRow = NonNullable<Awaited<ReturnType<typeof loadMenu>>>;

function loadMenu(db: Database, restaurantId: number) {
  return db.query.restaurants.findFirst({
    columns: {
      id: true,
      name: true,
      city: true,
      areaName: true,
      cuisines: true,
    },
    where: (restaurant, { and, eq }) =>
      and(eq(restaurant.id, restaurantId), eq(restaurant.isActive, true)),
    with: {
      categories: {
        columns: { slug: true, title: true },
        orderBy: (category, { asc }) => [
          asc(category.position),
          asc(category.id),
        ],
        with: {
          items: {
            columns: {
              id: true,
              name: true,
              description: true,
              imageId: true,
              isVeg: true,
              pricePaise: true,
              rating: true,
              ratingCount: true,
            },
            where: (item, { eq }) => eq(item.isAvailable, true),
            orderBy: (item, { asc }) => [asc(item.position), asc(item.id)],
          },
        },
      },
    },
  });
}

// Database rows -> the repository contract (string ids, API slugs).
function toRestaurantMenu(row: MenuRow): RestaurantMenu {
  return {
    restaurant: {
      id: String(row.id),
      name: row.name,
      city: row.city,
      areaName: row.areaName,
      cuisines: row.cuisines,
    },
    categories: row.categories
      .filter((category) => category.items.length > 0)
      .map((category) => ({
        id: category.slug,
        title: category.title,
        items: category.items.map((item) => ({
          ...item,
          id: String(item.id),
        })),
      })),
  };
}

export function createPostgresMenuRepository(
  database: DatabaseHandle,
): MenuRepository {
  return {
    async findByRestaurantId(restaurantId) {
      let row: MenuRow | undefined;
      try {
        // Safe: the validator only lets through 1–12 digit ids.
        row = await loadMenu(database.db, Number(restaurantId));
      } catch (error) {
        // Driver and SQL detail stay in the logs; clients get a 503.
        throw new DatabaseError("Failed to load restaurant menu", error);
      }

      if (!row) return null;
      const menu = toRestaurantMenu(row);
      return menu.categories.length > 0 ? menu : null;
    },

    ping: () => database.ping(),
    close: () => database.close(),
  };
}
