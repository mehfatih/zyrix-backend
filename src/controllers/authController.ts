// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Auth Controller
// ─────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { createOtp, verifyOtp } from "../services/otpService";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../services/tokenService";
import { AuthenticatedRequest, ERROR_CODES } from "../types";

// Helper to generate unique merchantId (ZRX-XXXXX)
async function generateMerchantId(): Promise<string> {
  let id: string;
  let exists = true;

  do {
    const num = Math.floor(10000 + Math.random() * 90000);
    id = `ZRX-${num}`;
    const found = await prisma.merchant.findUnique({ where: { merchantId: id } });
    exists = found !== null;
  } while (exists);

  return id;
}

// ─── POST /api/auth/send-otp ──────────────────────────────────

export async function sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { phone } = req.body as { phone: string };

    const { code, expiresAt } = await createOtp(phone);

    // In production: send SMS via Twilio/MessageBird
    // For now, return code in development mode only
    const response: Record<string, unknown> = {
      success: true,
      data: {
        message: "OTP sent successfully",
        expiresIn: env.otp.expiresMinutes * 60, // seconds
      },
    };

    if (env.isDev) {
      response.data = {
        ...(response.data as object),
        devCode: code,
        devExpiresAt: expiresAt,
      };
    }

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/verify-otp ───────────────────────────────

export async function verifyOtpHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { phone, code } = req.body as { phone: string; code: string };

    const result = await verifyOtp(phone, code);

    if (!result.valid) {
      const codeMap: Record<string, string> = {
        OTP_EXPIRED: ERROR_CODES.OTP_EXPIRED,
        OTP_MAX_ATTEMPTS: ERROR_CODES.OTP_MAX_ATTEMPTS,
        INVALID_OTP: ERROR_CODES.INVALID_OTP,
        OTP_NOT_FOUND: ERROR_CODES.INVALID_OTP,
      };

      const errorCode = codeMap[result.reason ?? "INVALID_OTP"] ?? ERROR_CODES.INVALID_OTP;

      const messages: Record<string, string> = {
        OTP_EXPIRED: "The OTP code has expired. Please request a new one.",
        OTP_MAX_ATTEMPTS: "Maximum attempts exceeded. Please request a new OTP.",
        INVALID_OTP: "The OTP code is invalid or expired.",
        OTP_NOT_FOUND: "No OTP found for this phone number. Please request one.",
      };

      res.status(400).json({
        success: false,
        error: {
          code: errorCode,
          message: messages[result.reason ?? "INVALID_OTP"] ?? "Invalid OTP",
        },
      });
      return;
    }

    // Find or create merchant
    let merchant = await prisma.merchant.findUnique({ where: { phone } });

    if (!merchant) {
      const merchantId = await generateMerchantId();
      merchant = await prisma.merchant.create({
        data: {
          phone,
          name: "New Merchant",
          email: `${phone.replace(/\D/g, "")}@zyrix.co`,
          merchantId,
          country: "TR", // Default; can be updated in onboarding
          status: "PENDING_KYC",
          kycStatus: "PENDING",
          onboardingDone: false,
        },
      });
    }

    // Check if merchant is suspended
    if (merchant.status === "SUSPENDED") {
      res.status(403).json({
        success: false,
        error: {
          code: ERROR_CODES.MERCHANT_SUSPENDED,
          message: "Your account has been suspended. Please contact support.",
        },
      });
      return;
    }

    // Generate tokens
    const token = generateAccessToken(merchant);
    const refreshToken = generateRefreshToken(merchant.id);

    res.status(200).json({
      success: true,
      data: {
        token,
        refreshToken,
        user: {
          id: merchant.id,
          name: merchant.name,
          phone: merchant.phone,
          email: merchant.email,
          merchantId: merchant.merchantId,
          language: merchant.language.toLowerCase(),
          onboardingDone: merchant.onboardingDone,
          kycStatus: merchant.kycStatus,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/refresh-token ────────────────────────────

export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: "Refresh token missing",
        },
      });
      return;
    }

    const token = authHeader.slice(7);

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      res.status(401).json({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_TOKEN,
          message: "Invalid or expired refresh token",
        },
      });
      return;
    }

    const merchant = await prisma.merchant.findUnique({ where: { id: payload.id } });

    if (!merchant) {
      res.status(401).json({
        success: false,
        error: {
          code: ERROR_CODES.MERCHANT_NOT_FOUND,
          message: "Merchant not found",
        },
      });
      return;
    }

    const newToken = generateAccessToken(merchant);

    res.status(200).json({
      success: true,
      data: { token: newToken },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/logout ────────────────────────────────────

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // JWT is stateless — client discards the token
    // In a production system, add token to a blocklist (Redis)
    const _merchant = (req as AuthenticatedRequest).merchant;

    res.status(200).json({
      success: true,
      data: { message: "Logged out successfully" },
    });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/auth/account ─────────────────────────────────

export async function deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = (req as AuthenticatedRequest).merchant;

    // Delete merchant and all related data (Cascade handles relations)
    await prisma.merchant.delete({ where: { id } });

    res.status(200).json({
      success: true,
      data: { message: "Account deleted successfully" },
    });
  } catch (err) {
    next(err);
  }
}
