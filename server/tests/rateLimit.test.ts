import request from "supertest";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { API, newClient } from "./helpers.js";

describe("global API rate limit", () => {
  it("allows the budget, then answers 429 RATE_LIMITED", async () => {
    const { app } = newClient();
    const hit = () => request(app).get(`${API}/restaurants/47120/menu`);

    for (let i = 0; i < env.API_RATE_LIMIT_MAX; i += 1) {
      await hit().expect(200);
    }
    const limited = await hit().expect(429);

    expect(limited.body.error.code).toBe("RATE_LIMITED");
    // IETF draft-8 headers tell the client its quota and when to retry.
    expect(limited.headers.ratelimit).toMatch(/r=0/);
    expect(limited.headers["ratelimit-policy"]).toContain(
      `q=${env.API_RATE_LIMIT_MAX}`,
    );
  });

  it("counts unknown /api routes too, and never limits health probes", async () => {
    const { app } = newClient();

    for (let i = 0; i < env.API_RATE_LIMIT_MAX; i += 1) {
      await request(app).get(`${API}/does-not-exist`).expect(404);
    }
    await request(app).get(`${API}/does-not-exist`).expect(429);

    await request(app).get("/health").expect(200);
    await request(app).get("/ready").expect(200);
  });

  it("reports the remaining budget on normal responses", async () => {
    const res = await request(newClient().app)
      .get(`${API}/restaurants/47120/menu`)
      .expect(200);

    expect(res.headers.ratelimit).toMatch(
      new RegExp(`r=${env.API_RATE_LIMIT_MAX - 1}`),
    );
  });
});
