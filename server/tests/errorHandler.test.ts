import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { DatabaseError } from "../src/errors/AppError.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";
import {
  requestContext,
  requestLogger,
} from "../src/middlewares/requestLogger.js";

// A bare app with routes that fail the ways real code can.
function failingApp() {
  const app = express();
  app.use(requestContext, requestLogger);
  app.get("/bug", () => {
    throw new Error("connect ECONNREFUSED postgres://admin:hunter2@db:5432");
  });
  app.get("/async-bug", async () => {
    await Promise.resolve();
    throw new TypeError("Cannot read properties of undefined (reading 'id')");
  });
  app.get("/db", () => {
    throw new DatabaseError(
      "users query failed: relation users does not exist",
      new Error("driver detail"),
    );
  });
  app.get("/thrown-string", () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw "not an Error object";
  });
  app.use(errorHandler);
  return app;
}

describe("unexpected errors", () => {
  it.each(["/bug", "/async-bug", "/thrown-string"])(
    "%s answers a generic 500 that leaks nothing",
    async (path) => {
      const res = await request(failingApp()).get(path).expect(500);

      expect(res.body).toEqual({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
        requestId: res.headers["x-request-id"],
      });
      expect(res.text).not.toMatch(/hunter2|ECONNREFUSED|Cannot read|stack/);
    },
  );

  it("database errors keep their code but hide their message", async () => {
    const res = await request(failingApp()).get("/db").expect(503);

    expect(res.body.error).toEqual({
      code: "DATABASE_ERROR",
      message: "Something went wrong",
    });
    expect(res.text).not.toMatch(/relation|driver/);
  });
});
