import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { OPENAPI_FILE, serialiseOpenApi } from "../scripts/generate-openapi.js";
import { openApiDocument } from "../src/docs/openapi.js";

describe("openapi.json", () => {
  it("is up to date with src/docs/openapi.ts (run `npm run docs:openapi`)", async () => {
    const committed = await readFile(OPENAPI_FILE, "utf8");
    expect(committed).toBe(serialiseOpenApi());
  });

  it("documents every error response with its own code", () => {
    const menu404 =
      openApiDocument.paths["/restaurants/{restaurantId}/menu"].get
        .responses[404];
    expect(menu404.content["application/json"].example.error.code).toBe(
      "MENU_NOT_FOUND",
    );
  });
});
