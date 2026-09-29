import request from "supertest";
import { describe, expect, it } from "vitest";
import { API, newClient } from "./helpers.js";

describe("health probes", () => {
  it("liveness answers without touching dependencies", async () => {
    const res = await request(newClient().app).get("/health").expect(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("readiness reports each dependency without internals", async () => {
    const res = await request(newClient().app).get("/ready").expect(200);
    expect(res.body).toEqual({
      status: "ready",
      checks: { users: "up", sessions: "up", mongo: "disabled" },
    });
  });
});

describe("error envelope", () => {
  it("answers unknown routes with ROUTE_NOT_FOUND", async () => {
    const res = await request(newClient().app).get(`${API}/nope`).expect(404);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: "ROUTE_NOT_FOUND",
        message: `No route for GET ${API}/nope`,
      },
      requestId: expect.any(String),
    });
  });

  it("answers malformed JSON with INVALID_JSON", async () => {
    const res = await request(newClient().app)
      .post(`${API}/auth/login`)
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("answers oversized bodies with 413", async () => {
    const res = await request(newClient().app)
      .post(`${API}/auth/login`)
      .send({ email: "a@b.co", password: "x".repeat(20_000) })
      .expect(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("request ids", () => {
  it("echoes a sane incoming X-Request-Id", async () => {
    const res = await request(newClient().app)
      .get("/health")
      .set("X-Request-Id", "trace-abc_123")
      .expect(200);
    expect(res.headers["x-request-id"]).toBe("trace-abc_123");
  });

  it("replaces an unsafe one with a generated UUID", async () => {
    const res = await request(newClient().app)
      .get("/health")
      .set("X-Request-Id", `bad id {"level":"fatal"} ${"x".repeat(80)}`)
      .expect(200);
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("api docs", () => {
  it("serves the OpenAPI document", async () => {
    const res = await request(newClient().app)
      .get(`${API}/docs/openapi.json`)
      .expect(200);
    expect(res.body.openapi).toBe("3.1.0");
    expect(Object.keys(res.body.paths)).toContain("/auth/login");
  });
});
