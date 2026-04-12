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
  loginEmail,
  forgotPassword,
  resetPassword,
  changePassword,
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

const loginEmailSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

// ─── OTP Routes (موجودة) ──────────────────────────────────────
router.post("/send-otp",      authRateLimiter, validate(sendOtpSchema),   sendOtp);
router.post("/verify-otp",    authRateLimiter, validate(verifyOtpSchema), verifyOtpHandler);
router.post("/refresh-token", refreshToken);
router.post("/logout",        authenticateToken, logout);
router.delete("/account",     authenticateToken, deleteAccount);

// ─── Email/Password Routes (جديدة) ───────────────────────────
router.post("/login-email",     authRateLimiter, validate(loginEmailSchema),     loginEmail);
router.post("/forgot-password", authRateLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password",  validate(resetPasswordSchema),                   resetPassword);
router.post("/change-password", authenticateToken, validate(changePasswordSchema), changePassword);

export default router;
