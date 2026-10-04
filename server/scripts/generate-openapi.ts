import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { openApiDocument } from "../src/docs/openapi.js";

/* Writes the OpenAPI document to openapi.json at the server root, for
   importing into Postman/Insomnia, sharing with frontend developers, or
   API tooling in CI. The running server serves the same document at
   /api/v1/docs/openapi.json; tests/openapi.test.ts fails if this file
   falls behind src/docs/openapi.ts. */

export const OPENAPI_FILE = fileURLToPath(
  new URL("../openapi.json", import.meta.url),
);

export const serialiseOpenApi = () =>
  `${JSON.stringify(openApiDocument, null, 2)}\n`;

// Only write when run as a script, not when imported by the test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(OPENAPI_FILE, serialiseOpenApi());
  process.stdout.write(`Wrote ${OPENAPI_FILE}\n`);
}
