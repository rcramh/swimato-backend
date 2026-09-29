import type { z } from "zod";
import { ValidationError, type FieldIssue } from "../errors/AppError.js";

const toFieldIssues = (error: z.ZodError): FieldIssue[] =>
  error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    message: issue.message,
  }));

/**
 * Parses untrusted input (body, query, params) against a schema and
 * returns the typed, normalised result, or throws a 400 listing every
 * failing field. Controllers call this before touching any input.
 */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.output<Schema> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new ValidationError("Validation failed", toFieldIssues(result.error));
  }
  return result.data;
}
