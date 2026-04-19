import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

for (const envPath of [path.resolve(__dirname, "../../../../.env"), path.resolve(__dirname, ".env")]) {
  loadEnv({ path: envPath, override: false });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Prisma");
}

const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { User, AuthNonce, Session, Prisma } from "./generated/prisma/client.js";
