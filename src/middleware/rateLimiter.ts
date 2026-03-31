// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Rate Limiter Middleware
// ─────────────────────────────────────────────────────────────

import rateLimit from "express-rate-limit";
import { ERROR_CODES } from "../types";

// Global rate limiter: 100 requests per 15 minutes
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: ERROR_CODES.UNAUTHORIZED,
      message: "Too many requests. Please try again in 15 minutes.",
    },
  },
});

// Auth rate limiter: 5 requests per 15 minutes (prevent brute force)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by IP + phone combination if phone is in body
    const phone = req.body?.phone as string | undefined;
    return phone ? `${req.ip}-${phone}` : req.ip ?? "unknown";
  },
  message: {
    success: false,
    error: {
      code: ERROR_CODES.UNAUTHORIZED,
      message: "Too many authentication attempts. Please try again in 15 minutes.",
    },
  },
});
