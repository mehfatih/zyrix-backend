// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Prisma Client Singleton
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { env } from "./env";

// Prevent multiple instances in development (hot reload)
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const prisma =
  global.__prisma ??
  new PrismaClient({
    log: env.isDev ? ["query", "info", "warn", "error"] : ["error"],
  });

if (env.isDev) {
  global.__prisma = prisma;
}

export { prisma };
