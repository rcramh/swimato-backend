import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/* ---------------------------------------------------------------
   PostgreSQL schema — restaurant menus

   restaurants 1──* menu_categories 1──* menu_items

   Conventions used throughout:
   - snake_case table and column names; TypeScript sees camelCase.
   - bigint identity keys, "BY DEFAULT" so imported rows keep their
     original ids (Swiggy's) while new rows get generated ones.
   - Money is integer paise, never float rupees: 189.00 cannot be
     represented exactly in binary floating point; 18900 can.
   - Every table has created_at / updated_at (timestamptz, UTC).
   - Rules that must always hold are CHECK constraints in the
     database, not just validation in code: any client, script or
     future service writing here gets the same guarantees.
   - Rows are switched off with is_active / is_available rather than
     deleted, because orders will reference menu items.

   Changes go through migrations: edit this file, then run
   `npm run db:generate` and commit the generated SQL in drizzle/.
----------------------------------------------------------------*/

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const restaurants = pgTable(
  "restaurants",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedByDefaultAsIdentity(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    areaName: text("area_name").notNull(),
    cuisines: text("cuisines")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check("restaurants_name_not_blank", sql`btrim(${t.name}) <> ''`),
    // Listing pages filter by city; only active restaurants are shown.
    index("restaurants_city_active_idx")
      .on(t.city)
      .where(sql`${t.isActive}`),
  ],
);

export const menuCategories = pgTable(
  "menu_categories",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    restaurantId: bigint("restaurant_id", { mode: "number" })
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    // Stable, URL-safe key used by the API ("pita-pocket-sandwiches").
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    // Display order within the menu; gaps are fine (10, 20, 30 …).
    position: integer("position").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("menu_categories_restaurant_slug_key").on(t.restaurantId, t.slug),
    // Lets menu_items prove its category belongs to the same restaurant.
    unique("menu_categories_id_restaurant_key").on(t.id, t.restaurantId),
    index("menu_categories_restaurant_position_idx").on(
      t.restaurantId,
      t.position,
    ),
    check("menu_categories_slug_format", sql`${t.slug} ~ '^[a-z0-9-]+$'`),
    check("menu_categories_position_nonnegative", sql`${t.position} >= 0`),
  ],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedByDefaultAsIdentity(),
    // Denormalised from the category on purpose: "all dishes of a
    // restaurant" is the hot query, and the composite foreign key
    // below guarantees the two can never disagree.
    restaurantId: bigint("restaurant_id", { mode: "number" }).notNull(),
    categoryId: bigint("category_id", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    imageId: text("image_id"),
    isVeg: boolean("is_veg").notNull(),
    pricePaise: integer("price_paise").notNull(),
    rating: numeric("rating", { precision: 2, scale: 1, mode: "number" }),
    ratingCount: integer("rating_count"),
    isAvailable: boolean("is_available").notNull().default(true),
    position: integer("position").notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "menu_items_category_fk",
      columns: [t.categoryId, t.restaurantId],
      foreignColumns: [menuCategories.id, menuCategories.restaurantId],
    }).onDelete("cascade"),
    foreignKey({
      name: "menu_items_restaurant_fk",
      columns: [t.restaurantId],
      foreignColumns: [restaurants.id],
    }).onDelete("cascade"),
    index("menu_items_category_position_idx").on(t.categoryId, t.position),
    index("menu_items_restaurant_idx").on(t.restaurantId),
    check("menu_items_name_not_blank", sql`btrim(${t.name}) <> ''`),
    check("menu_items_price_nonnegative", sql`${t.pricePaise} >= 0`),
    check(
      "menu_items_rating_range",
      sql`${t.rating} IS NULL OR ${t.rating} BETWEEN 0 AND 5`,
    ),
    check(
      "menu_items_rating_count_nonnegative",
      sql`${t.ratingCount} IS NULL OR ${t.ratingCount} >= 0`,
    ),
    check("menu_items_position_nonnegative", sql`${t.position} >= 0`),
  ],
);

/* Relations power Drizzle's nested queries (restaurant → categories →
   items in one round trip). They describe the schema to Drizzle; the
   foreign keys above are what Postgres enforces. */

export const restaurantsRelations = relations(restaurants, ({ many }) => ({
  categories: many(menuCategories),
}));

export const menuCategoriesRelations = relations(
  menuCategories,
  ({ one, many }) => ({
    restaurant: one(restaurants, {
      fields: [menuCategories.restaurantId],
      references: [restaurants.id],
    }),
    items: many(menuItems),
  }),
);

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  category: one(menuCategories, {
    fields: [menuItems.categoryId],
    references: [menuCategories.id],
  }),
}));
