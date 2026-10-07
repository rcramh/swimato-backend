import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabase,
  type DatabaseHandle,
} from "../src/database/postgres.js";
import { menuItems, restaurants } from "../src/database/schema.js";
import seed from "../src/database/seed/restaurantMenus.json" with { type: "json" };
import { menuSeedSchema } from "../src/database/seed/restaurantMenus.schema.js";
import { seedMenus } from "../src/database/seed/seedMenus.js";
import { createMemoryMenuRepository } from "../src/repositories/memory/memoryMenuRepository.js";
import { createPostgresMenuRepository } from "../src/repositories/postgres/postgresMenuRepository.js";
import type { MenuRepository } from "../src/repositories/types.js";

/* Integration tests against a real PostgreSQL. They run only when
   TEST_DATABASE_URL is set (server/.env locally, a service container in
   CI) and use their own database: every run wipes it. */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));
const SAMPLE_ID = "47120";
const seedData = menuSeedSchema.parse(seed);

describe.skipIf(!TEST_DATABASE_URL)("PostgreSQL menu repository", () => {
  let database: DatabaseHandle;
  let repository: MenuRepository;

  beforeAll(async () => {
    database = createDatabase({
      url: TEST_DATABASE_URL ?? "",
      poolMax: 2,
      statementTimeoutMs: 10_000,
    });
    await migrate(database.db, { migrationsFolder: MIGRATIONS });
    await database.db.execute(
      sql`TRUNCATE restaurants, menu_categories, menu_items RESTART IDENTITY CASCADE`,
    );
    await seedMenus(database.db, seedData);
    repository = createPostgresMenuRepository(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it("returns exactly what the in-memory repository returns", async () => {
    const fromPostgres = await repository.findByRestaurantId(SAMPLE_ID);
    const fromMemory =
      await createMemoryMenuRepository().findByRestaurantId(SAMPLE_ID);

    expect(fromPostgres).toEqual(fromMemory);
  });

  it("keeps categories and dishes in the seed's order", async () => {
    const menu = await repository.findByRestaurantId(SAMPLE_ID);
    const expected = seedData.menus[0]?.categories ?? [];

    expect(menu?.categories.map((c) => c.id)).toEqual(
      expected.map((c) => c.id),
    );
    expect(menu?.categories[1]?.items.map((i) => i.id)).toEqual(
      expected[1]?.items.map((i) => i.id),
    );
  });

  it("returns null for a restaurant it does not have", async () => {
    expect(await repository.findByRestaurantId("999999")).toBeNull();
  });

  it("hides unavailable dishes and empty categories", async () => {
    const before = await repository.findByRestaurantId(SAMPLE_ID);
    const dessert = before?.categories.find((c) => c.title === "Desserts");
    const dessertIds = (dessert?.items ?? []).map((i) => Number(i.id));
    expect(dessertIds.length).toBeGreaterThan(0);

    const [firstId] = dessertIds;
    await database.db
      .update(menuItems)
      .set({ isAvailable: false })
      .where(eq(menuItems.id, firstId ?? 0));
    const oneHidden = await repository.findByRestaurantId(SAMPLE_ID);
    expect(
      oneHidden?.categories.find((c) => c.title === "Desserts")?.items,
    ).toHaveLength(dessertIds.length - 1);

    for (const id of dessertIds) {
      await database.db
        .update(menuItems)
        .set({ isAvailable: false })
        .where(eq(menuItems.id, id));
    }
    const allHidden = await repository.findByRestaurantId(SAMPLE_ID);
    expect(allHidden?.categories.map((c) => c.title)).not.toContain("Desserts");

    await seedMenus(database.db, seedData); // restore
  });

  it("treats an inactive restaurant as having no menu", async () => {
    await database.db
      .update(restaurants)
      .set({ isActive: false })
      .where(eq(restaurants.id, Number(SAMPLE_ID)));

    expect(await repository.findByRestaurantId(SAMPLE_ID)).toBeNull();

    await seedMenus(database.db, seedData); // reactivates
    expect(await repository.findByRestaurantId(SAMPLE_ID)).not.toBeNull();
  });

  it("reports an unreachable database as a 503 DatabaseError", async () => {
    const broken = createDatabase({
      url: "postgresql://nobody:wrong@127.0.0.1:1/none",
      poolMax: 1,
      statementTimeoutMs: 1_000,
    });
    const brokenRepository = createPostgresMenuRepository(broken);

    await expect(
      brokenRepository.findByRestaurantId(SAMPLE_ID),
    ).rejects.toMatchObject({ statusCode: 503, code: "DATABASE_ERROR" });
    await broken.close();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("seedMenus", () => {
  let database: DatabaseHandle;

  beforeAll(async () => {
    database = createDatabase({
      url: TEST_DATABASE_URL ?? "",
      poolMax: 2,
      statementTimeoutMs: 10_000,
    });
    await migrate(database.db, { migrationsFolder: MIGRATIONS });
  });

  afterAll(async () => {
    await database.close();
  });

  const count = async () => {
    const [row] = await database.db
      .select({ n: sql<number>`count(*)::int` })
      .from(menuItems);
    return row?.n ?? 0;
  };

  it("is idempotent", async () => {
    await seedMenus(database.db, seedData);
    const once = await count();
    await seedMenus(database.db, seedData);

    expect(await count()).toBe(once);
  });

  it("marks a dish that left the file unavailable instead of deleting it", async () => {
    const trimmed = structuredClone(seedData);
    const removed = trimmed.menus[0]?.categories[0]?.items.pop();
    if (!removed) throw new Error("seed has no items");

    const summary = await seedMenus(database.db, trimmed);
    expect(summary.itemsMarkedUnavailable).toBe(1);

    const [row] = await database.db
      .select({ isAvailable: menuItems.isAvailable })
      .from(menuItems)
      .where(eq(menuItems.id, Number(removed.id)));
    expect(row?.isAvailable).toBe(false);

    await seedMenus(database.db, seedData); // restore
  });

  it("leaves identity sequences ahead of imported ids", async () => {
    await seedMenus(database.db, seedData);
    const [inserted] = await database.db
      .insert(menuItems)
      .values({
        restaurantId: Number(SAMPLE_ID),
        categoryId: sql`(SELECT id FROM menu_categories WHERE restaurant_id = ${Number(SAMPLE_ID)} LIMIT 1)`,
        name: "Generated id dish",
        isVeg: true,
        pricePaise: 100,
        position: 999,
      })
      .returning({ id: menuItems.id });

    expect(inserted?.id).toBeGreaterThan(0);
    await database.db
      .delete(menuItems)
      .where(eq(menuItems.id, inserted?.id ?? 0));
  });
});
