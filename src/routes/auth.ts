// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Auth Routes
// ─────────────────────────────────────────────────────────────

import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validator";
import { authenticateToken } from "../middleware/auth";
import { authRateLimiter } from "../middleware/rateLimiter";
import {
  sendOtp,
  verifyOtpHandler,
  refreshToken,
  logout,
  deleteAccount,
} from "../controllers/authController";

const router = Router();

// ─── Zod Schemas ──────────────────────────────────────────────

const sendOtpSchema = z.object({
  phone: z
    .string()
    .min(1, "Phone is required")
    .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format (e.g. +905452210888)"),
});

const verifyOtpSchema = z.object({
  phone: z
    .string()
    .min(1, "Phone is required")
    .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format"),
  code: z
    .string()
    .length(6, "OTP code must be exactly 6 digits")
    .regex(/^\d{6}$/, "OTP code must contain only digits"),
});

// ─── Routes ───────────────────────────────────────────────────

// POST /api/auth/send-otp
router.post(
  "/send-otp",
  authRateLimiter,
  validate(sendOtpSchema),
  sendOtp
);

// POST /api/auth/verify-otp
router.post(
  "/verify-otp",
  authRateLimiter,
  validate(verifyOtpSchema),
  verifyOtpHandler
);

// POST /api/auth/refresh-token
router.post(
  "/refresh-token",
  refreshToken
);

// POST /api/auth/logout (requires valid access token)
router.post(
  "/logout",
  authenticateToken,
  logout
);

// DELETE /api/auth/account (requires valid access token)
router.delete(
  "/account",
  authenticateToken,
  deleteAccount
);

export default router;
