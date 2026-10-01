import { z } from "zod";

// Restaurant ids are Swiggy's numeric ids, kept as strings so a long id
// never loses precision in JavaScript.
export const restaurantIdParamsSchema = z.strictObject({
  restaurantId: z
    .string()
    .regex(/^\d{1,12}$/, "restaurantId must be a numeric id"),
});
