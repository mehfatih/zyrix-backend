// ─────────────────────────────────────────────────────────────
// Zyrix Backend — TypeScript Types
// ─────────────────────────────────────────────────────────────

import { Merchant } from "@prisma/client";
import { Request } from "express";

// ─── Authenticated Request ────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  merchant: MerchantPayload;
}

// ─── JWT Payloads ─────────────────────────────────────────────

export interface MerchantPayload {
  id: string;
  phone: string;
  merchantId: string;
  email: string | null;
  name: string;
}

export interface RefreshTokenPayload {
  id: string;
  type: "refresh";
}

// ─── API Response Types ───────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Auth Types ───────────────────────────────────────────────

export interface SendOtpResponse {
  message: string;
  expiresIn: number;
  devCode?: string;
}

export interface VerifyOtpResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    merchantId: string;
    language: string;
  };
}

// ─── Merchant Safe Type (no password) ────────────────────────

export type MerchantSafe = Omit<Merchant, "passwordHash">;

// ─── Error Codes ──────────────────────────────────────────────

export const ERROR_CODES = {
  // Auth
  INVALID_OTP: "INVALID_OTP",
  OTP_EXPIRED: "OTP_EXPIRED",
  OTP_MAX_ATTEMPTS: "OTP_MAX_ATTEMPTS",
  OTP_ALREADY_VERIFIED: "OTP_ALREADY_VERIFIED",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  UNAUTHORIZED: "UNAUTHORIZED",
  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  // Server
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NOT_FOUND: "NOT_FOUND",
  // Merchant
  MERCHANT_NOT_FOUND: "MERCHANT_NOT_FOUND",
  MERCHANT_SUSPENDED: "MERCHANT_SUSPENDED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
