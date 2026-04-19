import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

for (const envPath of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (fs.existsSync(envPath)) {
    config({ path: envPath });
  }
}
