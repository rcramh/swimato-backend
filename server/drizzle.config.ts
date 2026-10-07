import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit reads this to generate migrations from src/database/schema.ts
// and to apply them. Generated SQL lives in drizzle/ and is committed.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
