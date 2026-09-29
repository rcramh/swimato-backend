import { z } from "zod";
import { ValidationError } from "../errors/AppError.js";
import type { UserListCursor } from "../repositories/types.js";

/* ---------------------------------------------------------------
   Opaque pagination cursors

   Clients get a base64url string and hand it back unchanged; they
   must not build or parse it. Decoding validates the shape, so a
   tampered cursor is a 400, never an exception deeper down.
----------------------------------------------------------------*/

const payloadSchema = z.strictObject({
  t: z.iso.datetime(),
  id: z.string().min(1).max(64),
});

export const encodeUserCursor = ({ createdAt, id }: UserListCursor): string =>
  Buffer.from(
    JSON.stringify({ t: createdAt.toISOString(), id }),
    "utf8",
  ).toString("base64url");

export function decodeUserCursor(cursor: string): UserListCursor {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    // Not JSON at all: the only meaningful handling is "bad input".
    throw new ValidationError("Invalid cursor", [
      { field: "cursor", message: "Cursor is malformed" },
    ]);
  }

  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Invalid cursor", [
      { field: "cursor", message: "Cursor is malformed" },
    ]);
  }

  return { createdAt: new Date(parsed.data.t), id: parsed.data.id };
}
