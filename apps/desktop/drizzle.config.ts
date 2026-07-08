import { defineConfig } from "drizzle-kit";
import { ensureDatabaseDirectory, resolveDatabasePath } from "./src/main/store/path";

try {
  process.loadEnvFile("../../.env");
} catch {
  // No repo-root .env yet; fall back to ambient env / user-data default.
}

export default defineConfig({
  schema: "./src/main/store/schema.ts",
  out: "./src/main/store/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: ensureDatabaseDirectory(resolveDatabasePath()),
  },
});
