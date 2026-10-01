import { z } from "zod";

/* ---------------------------------------------------------------
   Seed file schema

   restaurantMenus.json is validated against this when it loads, so a
   bad hand edit fails at boot with the exact path of the problem,
   rather than as a broken menu page in production. The same check
   will guard the script that loads this file into PostgreSQL.
----------------------------------------------------------------*/

const id = z.string().regex(/^\d{1,12}$/);

const menuItemSchema = z.strictObject({
  id,
  name: z.string().min(1),
  description: z.string().min(1).nullable(),
  imageId: z.string().min(1).nullable(),
  isVeg: z.boolean(),
  pricePaise: z.number().int().nonnegative(),
  rating: z.number().min(0).max(5).nullable(),
  ratingCount: z.number().int().nonnegative().nullable(),
});

const menuCategorySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  items: z.array(menuItemSchema).min(1),
});

const restaurantMenuSchema = z.strictObject({
  restaurant: z.strictObject({
    id,
    name: z.string().min(1),
    city: z.string().min(1),
    areaName: z.string().min(1),
    cuisines: z.array(z.string().min(1)),
  }),
  categories: z.array(menuCategorySchema).min(1),
});

export const menuSeedSchema = z.strictObject({
  source: z.string(),
  menus: z.array(restaurantMenuSchema),
});
