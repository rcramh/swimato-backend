import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/errors/AppError.js";
import { decodeUserCursor, encodeUserCursor } from "../src/utils/cursor.js";

describe("pagination cursor", () => {
  it("round-trips", () => {
    const position = {
      createdAt: new Date("2026-01-02T03:04:05.678Z"),
      id: "abc",
    };
    expect(decodeUserCursor(encodeUserCursor(position))).toEqual(position);
  });

  it.each([
    ["not base64 json", "%%%"],
    ["valid json, wrong shape", Buffer.from('{"x":1}').toString("base64url")],
    [
      "bad date",
      Buffer.from('{"t":"yesterday","id":"a"}').toString("base64url"),
    ],
    [
      "prototype pollution attempt",
      Buffer.from(
        '{"__proto__":{"admin":true},"t":"2026-01-01T00:00:00.000Z","id":"a"}',
      ).toString("base64url"),
    ],
  ])("rejects %s with a ValidationError", (_label, cursor) => {
    expect(() => decodeUserCursor(cursor)).toThrow(ValidationError);
  });
});
