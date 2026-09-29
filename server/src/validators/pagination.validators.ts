import { z } from "zod";
import { PAGINATION } from "../constants/http.js";

export const cursorPageQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int("limit must be a whole number")
    .min(1, "limit must be at least 1")
    .max(PAGINATION.MAX_LIMIT, `limit must be at most ${PAGINATION.MAX_LIMIT}`)
    .default(PAGINATION.DEFAULT_LIMIT),
  cursor: z.string().min(1).max(512).optional(),
});

export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;
