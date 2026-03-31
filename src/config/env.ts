// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Environment Variables
// ─────────────────────────────────────────────────────────────

import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  ADMIN_JWT_SECRET: z.string().min(32, "ADMIN_JWT_SECRET must be at least 32 characters"),
  ADMIN_JWT_EXPIRES_IN: z.string().default("8h"),
  OTP_EXPIRES_MINUTES: z.string().default("5"),
  OTP_MAX_ATTEMPTS: z.string().default("5"),
  CORS_ORIGINS: z.string().default("http://localhost:8081,http://localhost:19006,http://localhost:3001"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,
  isDev: parsed.data.NODE_ENV === "development",
  databaseUrl: parsed.data.DATABASE_URL,
  jwt: {
    secret: parsed.data.JWT_SECRET,
    refreshSecret: parsed.data.JWT_REFRESH_SECRET,
    expiresIn: parsed.data.JWT_EXPIRES_IN,
    refreshExpiresIn: parsed.data.JWT_REFRESH_EXPIRES_IN,
  },
  adminJwt: {
    secret: parsed.data.ADMIN_JWT_SECRET,
    expiresIn: parsed.data.ADMIN_JWT_EXPIRES_IN,
  },
  otp: {
    expiresMinutes: parseInt(parsed.data.OTP_EXPIRES_MINUTES, 10),
    maxAttempts: parseInt(parsed.data.OTP_MAX_ATTEMPTS, 10),
  },
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((o) => o.trim()),
} as const;
