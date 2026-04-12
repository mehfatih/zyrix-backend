import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { createOtp, verifyOtp } from "../services/otpService";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../services/tokenService";
import { AuthenticatedRequest, ERROR_CODES } from "../types";
import bcrypt from "bcryptjs";
import crypto from "crypto";

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

// ─── OTP (موجود) ──────────────────────────────────────────────

export async function sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { phone } = req.body as { phone: string };
    const { code, expiresAt } = await createOtp(phone);
    const response: Record<string, unknown> = {
      success: true,
      data: { message: "OTP sent successfully", expiresIn: env.otp.expiresMinutes * 60 },
    };
    if (env.isDev) {
      response.data = { ...(response.data as object), devCode: code, devExpiresAt: expiresAt };
    }
    res.status(200).json(response);
  } catch (err) { next(err); }
}

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
        error: { code: errorCode, message: messages[result.reason ?? "INVALID_OTP"] ?? "Invalid OTP" },
      });
      return;
    }
    let merchant = await prisma.merchant.findUnique({ where: { phone } });
    if (!merchant) {
      const merchantId = await generateMerchantId();
      merchant = await prisma.merchant.create({
        data: {
          phone, name: "New Merchant",
          email: `${phone.replace(/\D/g, "")}@zyrix.co`,
          merchantId, country: "TR",
          status: "PENDING_KYC", kycStatus: "PENDING", onboardingDone: false,
        },
      });
    }
    if (merchant.status === "SUSPENDED") {
      res.status(403).json({
        success: false,
        error: { code: ERROR_CODES.MERCHANT_SUSPENDED, message: "Your account has been suspended. Please contact support." },
      });
      return;
    }
    const token = generateAccessToken(merchant);
    const refreshToken = generateRefreshToken(merchant.id);
    res.status(200).json({
      success: true,
      data: {
        token, refreshToken,
        user: {
          id: merchant.id, name: merchant.name, phone: merchant.phone,
          email: merchant.email, merchantId: merchant.merchantId,
          language: merchant.language.toLowerCase(),
          onboardingDone: merchant.onboardingDone, kycStatus: merchant.kycStatus,
        },
      },
    });
  } catch (err) { next(err); }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED, message: "Refresh token missing" } });
      return;
    }
    const token = authHeader.slice(7);
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      res.status(401).json({ success: false, error: { code: ERROR_CODES.INVALID_TOKEN, message: "Invalid or expired refresh token" } });
      return;
    }
    const merchant = await prisma.merchant.findUnique({ where: { id: payload.id } });
    if (!merchant) {
      res.status(401).json({ success: false, error: { code: ERROR_CODES.MERCHANT_NOT_FOUND, message: "Merchant not found" } });
      return;
    }
    const newToken = generateAccessToken(merchant);
    res.status(200).json({ success: true, data: { token: newToken } });
  } catch (err) { next(err); }
}

export async function logout(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ success: true, data: { message: "Logged out successfully" } });
  } catch (err) { next(err); }
}

export async function deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = (req as AuthenticatedRequest).merchant;
    await prisma.merchant.delete({ where: { id } });
    res.status(200).json({ success: true, data: { message: "Account deleted successfully" } });
  } catch (err) { next(err); }
}

// ─── Email / Password Auth (جديد) ─────────────────────────────

export async function loginEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Email and password required" } });
      return;
    }

    const merchant = await prisma.merchant.findUnique({ where: { email } });
    if (!merchant || !merchant.passwordHash) {
      res.status(401).json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
      return;
    }

    const valid = await bcrypt.compare(password, merchant.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
      return;
    }

    if (merchant.status === "SUSPENDED") {
      res.status(403).json({ success: false, error: { code: ERROR_CODES.MERCHANT_SUSPENDED, message: "Your account has been suspended." } });
      return;
    }

    const token = generateAccessToken(merchant);
    const refreshTokenStr = generateRefreshToken(merchant.id);

    res.status(200).json({
      success: true,
      data: {
        token, refreshToken: refreshTokenStr,
        user: {
          id: merchant.id, name: merchant.name, phone: merchant.phone,
          email: merchant.email, merchantId: merchant.merchantId,
          language: merchant.language.toLowerCase(),
          onboardingDone: merchant.onboardingDone, kycStatus: merchant.kycStatus,
        },
      },
    });
  } catch (err) { next(err); }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body as { email: string };

    if (!email) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Email required" } });
      return;
    }

    const merchant = await prisma.merchant.findUnique({ where: { email } });

    // دايماً نرجع نفس الرسالة عشان ما نكشفش الإيميلات
    if (!merchant) {
      res.status(200).json({ success: true, data: { message: "If this email exists, a reset link has been sent." } });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // ساعة

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { resetToken, resetTokenExpiry } as any,
    });

    // في الـ production هنبعت إيميل — دلوقتي نرجع التوكن في dev فقط
    const responseData: Record<string, unknown> = { message: "If this email exists, a reset link has been sent." };
    if (env.isDev) responseData.devResetToken = resetToken;

    res.status(200).json({ success: true, data: responseData });
  } catch (err) { next(err); }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password } = req.body as { token: string; password: string };

    if (!token || !password) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Token and password required" } });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" } });
      return;
    }

    const merchant = await prisma.merchant.findFirst({
      where: { resetToken: token } as any,
    });

    if (!merchant) {
      res.status(400).json({ success: false, error: { code: "INVALID_TOKEN", message: "Invalid or expired reset token" } });
      return;
    }

    const merchantAny = merchant as any;
    if (!merchantAny.resetTokenExpiry || new Date() > new Date(merchantAny.resetTokenExpiry)) {
      res.status(400).json({ success: false, error: { code: "TOKEN_EXPIRED", message: "Reset token has expired" } });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null } as any,
    });

    res.status(200).json({ success: true, data: { message: "Password reset successfully" } });
  } catch (err) { next(err); }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = (req as AuthenticatedRequest).merchant;
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Current and new password required" } });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "New password must be at least 8 characters" } });
      return;
    }

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant || !merchant.passwordHash) {
      res.status(400).json({ success: false, error: { code: "NO_PASSWORD", message: "No password set for this account" } });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, merchant.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Current password is incorrect" } });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.merchant.update({ where: { id }, data: { passwordHash } });

    res.status(200).json({ success: true, data: { message: "Password changed successfully" } });
  } catch (err) { next(err); }
}
