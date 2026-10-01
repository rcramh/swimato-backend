import request from "supertest";
import { describe, expect, it } from "vitest";
import seed from "../src/database/seed/restaurantMenus.json" with { type: "json" };
import { menuSeedSchema } from "../src/database/seed/restaurantMenus.schema.js";
import { SAMPLE_MENU_RESTAURANT_ID } from "../src/services/restaurant.service.js";
import { API, newClient } from "./helpers.js";

const menuUrl = (id: string) => `${API}/restaurants/${id}/menu`;

describe("GET /restaurants/:restaurantId/menu", () => {
  it("serves a restaurant's own menu, publicly", async () => {
    const res = await request(newClient().app)
      .get(menuUrl(SAMPLE_MENU_RESTAURANT_ID))
      .expect(200);

    const data = res.body.data;
    expect(res.body.success).toBe(true);
    expect(data.restaurantId).toBe(SAMPLE_MENU_RESTAURANT_ID);
    expect(data.isSample).toBe(false);
    expect(data.menuOf).toMatchObject({
      id: SAMPLE_MENU_RESTAURANT_ID,
      name: "Istah - The Mediterranean Way",
    });
    expect(data.categories.length).toBeGreaterThan(0);
    expect(data.categories[0].items[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      description: expect.toBeOneOf([expect.any(String), null]),
      imageId: expect.toBeOneOf([expect.any(String), null]),
      isVeg: expect.any(Boolean),
      pricePaise: expect.any(Number),
      rating: expect.toBeOneOf([expect.any(Number), null]),
      ratingCount: expect.toBeOneOf([expect.any(Number), null]),
    });
  });

  it("includes every dish in the capture, nested categories too", async () => {
    const res = await request(newClient().app)
      .get(menuUrl(SAMPLE_MENU_RESTAURANT_ID))
      .expect(200);

    const categories = res.body.data.categories as {
      title: string;
      items: unknown[];
    }[];
    const dishes = categories.reduce((sum, c) => sum + c.items.length, 0);

    expect(dishes).toBe(58);
    expect(categories.map((c) => c.title)).toContain(
      "Platters · Meal Platters",
    );
  });

  it("falls back to the sample menu, flagged, for a restaurant without one", async () => {
    const res = await request(newClient().app)
      .get(menuUrl("12345"))
      .expect(200);

    expect(res.body.data.restaurantId).toBe("12345");
    expect(res.body.data.isSample).toBe(true);
    expect(res.body.data.menuOf.id).toBe(SAMPLE_MENU_RESTAURANT_ID);
  });

  it.each(["abc", "12a", "1234567890123", "%20", "-1"])(
    "rejects the malformed id %s with 400",
    async (id) => {
      const res = await request(newClient().app).get(menuUrl(id)).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.error.details[0].field).toBe("restaurantId");
    },
  );

  it("is cacheable and supports conditional requests", async () => {
    const app = newClient().app;
    const first = await request(app)
      .get(menuUrl(SAMPLE_MENU_RESTAURANT_ID))
      .expect(200);

    expect(first.headers["cache-control"]).toBe("public, max-age=300");
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();

    await request(app)
      .get(menuUrl(SAMPLE_MENU_RESTAURANT_ID))
      .set("If-None-Match", etag)
      .expect(304);
  });

  it("does not let one response's edits leak into the next", async () => {
    const app = newClient().app;
    const first = await request(app).get(menuUrl(SAMPLE_MENU_RESTAURANT_ID));
    const second = await request(app).get(menuUrl(SAMPLE_MENU_RESTAURANT_ID));
    expect(second.body.data.categories).toEqual(first.body.data.categories);
  });
});

describe("menu seed file", () => {
  it("matches the seed schema", () => {
    expect(menuSeedSchema.safeParse(seed).success).toBe(true);
  });

  it("has unique item ids within each menu", () => {
    for (const menu of seed.menus) {
      const ids = menu.categories.flatMap((c) => c.items.map((i) => i.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("rejects a malformed entry, naming the bad field", () => {
    const broken = structuredClone(seed);
    const item = broken.menus[0]?.categories[0]?.items[0];
    if (!item) throw new Error("seed has no items");
    (item as { pricePaise: unknown }).pricePaise = "189.00";

    const result = menuSeedSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      "menus",
      0,
      "categories",
      0,
      "items",
      0,
      "pricePaise",
    ]);
  });
});
