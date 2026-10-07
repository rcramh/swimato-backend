import { and, eq, notInArray, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "../postgres.js";
import { menuCategories, menuItems, restaurants } from "../schema.js";
import type { menuSeedSchema } from "./restaurantMenus.schema.js";

/* ---------------------------------------------------------------
   Load menus from the seed file into PostgreSQL

   Idempotent: run it any number of times and the database ends up
   matching the file. Rows are upserted (INSERT … ON CONFLICT DO
   UPDATE), never deleted — orders will reference menu items, so a
   dish that left the file is marked unavailable instead.

   Everything happens in one transaction: either the whole seed lands,
   or nothing does.
----------------------------------------------------------------*/

type MenuSeed = z.infer<typeof menuSeedSchema>;

// Gaps leave room to insert a category or dish without renumbering.
const POSITION_STEP = 10;

export interface SeedSummary {
  restaurants: number;
  categories: number;
  items: number;
  itemsMarkedUnavailable: number;
}

export async function seedMenus(
  db: Database,
  seed: MenuSeed,
): Promise<SeedSummary> {
  return db.transaction(async (tx) => {
    const summary: SeedSummary = {
      restaurants: 0,
      categories: 0,
      items: 0,
      itemsMarkedUnavailable: 0,
    };

    for (const { restaurant, categories } of seed.menus) {
      const restaurantId = Number(restaurant.id);

      await tx
        .insert(restaurants)
        .values({
          id: restaurantId,
          name: restaurant.name,
          city: restaurant.city,
          areaName: restaurant.areaName,
          cuisines: restaurant.cuisines,
        })
        .onConflictDoUpdate({
          target: restaurants.id,
          set: {
            name: restaurant.name,
            city: restaurant.city,
            areaName: restaurant.areaName,
            cuisines: restaurant.cuisines,
            isActive: true,
            updatedAt: new Date(),
          },
        });
      summary.restaurants += 1;

      const seededItemIds: number[] = [];

      for (const [categoryIndex, category] of categories.entries()) {
        const [savedCategory] = await tx
          .insert(menuCategories)
          .values({
            restaurantId,
            slug: category.id,
            title: category.title,
            position: categoryIndex * POSITION_STEP,
          })
          .onConflictDoUpdate({
            target: [menuCategories.restaurantId, menuCategories.slug],
            set: {
              title: category.title,
              position: categoryIndex * POSITION_STEP,
              updatedAt: new Date(),
            },
          })
          .returning({ id: menuCategories.id });

        if (!savedCategory)
          throw new Error(`category ${category.id} not saved`);
        summary.categories += 1;

        const rows = category.items.map((item, itemIndex) => ({
          id: Number(item.id),
          restaurantId,
          categoryId: savedCategory.id,
          name: item.name,
          description: item.description,
          imageId: item.imageId,
          isVeg: item.isVeg,
          pricePaise: item.pricePaise,
          rating: item.rating,
          ratingCount: item.ratingCount,
          isAvailable: true,
          position: itemIndex * POSITION_STEP,
        }));

        await tx
          .insert(menuItems)
          .values(rows)
          .onConflictDoUpdate({
            target: menuItems.id,
            // `excluded` is the row that failed to insert: take its values.
            set: {
              categoryId: sql`excluded.category_id`,
              name: sql`excluded.name`,
              description: sql`excluded.description`,
              imageId: sql`excluded.image_id`,
              isVeg: sql`excluded.is_veg`,
              pricePaise: sql`excluded.price_paise`,
              rating: sql`excluded.rating`,
              ratingCount: sql`excluded.rating_count`,
              isAvailable: true,
              position: sql`excluded.position`,
              updatedAt: new Date(),
            },
          });

        seededItemIds.push(...rows.map((row) => row.id));
        summary.items += rows.length;
      }

      const retired = await tx
        .update(menuItems)
        .set({ isAvailable: false, updatedAt: new Date() })
        .where(
          and(
            eq(menuItems.restaurantId, restaurantId),
            eq(menuItems.isAvailable, true),
            notInArray(menuItems.id, seededItemIds),
          ),
        )
        .returning({ id: menuItems.id });
      summary.itemsMarkedUnavailable += retired.length;
    }

    // Rows were inserted with explicit ids, which does not advance the
    // identity sequences. Without this, the next generated id could be
    // one that already exists and the insert would fail.
    await tx.execute(sql`
      SELECT setval(pg_get_serial_sequence('restaurants', 'id'),
                    GREATEST((SELECT max(id) FROM restaurants), 1))`);
    await tx.execute(sql`
      SELECT setval(pg_get_serial_sequence('menu_items', 'id'),
                    GREATEST((SELECT max(id) FROM menu_items), 1))`);

    return summary;
  });
}
