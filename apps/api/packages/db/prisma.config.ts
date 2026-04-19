import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

for (const envPath of [path.resolve(__dirname, "../../../../.env"), path.resolve(__dirname, ".env")]) {
  loadEnv({ path: envPath, override: false });
}

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrations: {
    path: path.join(__dirname, "prisma", "migrations"),
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
