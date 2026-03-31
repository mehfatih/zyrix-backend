// ─────────────────────────────────────────────────────────────
// Zyrix Backend — OTP Service
// ─────────────────────────────────────────────────────────────

import bcrypt from "bcrypt";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { OtpCode } from "@prisma/client";

const BCRYPT_ROUNDS = 10;

// Generate a random 6-digit OTP code
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create and persist a new OTP for a phone number
export async function createOtp(phone: string): Promise<{ code: string; expiresAt: Date }> {
  const code = generateCode();
  const hashedCode = await bcrypt.hash(code, BCRYPT_ROUNDS);

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + env.otp.expiresMinutes);

  // Invalidate previous unused OTPs for this phone
  await prisma.otpCode.updateMany({
    where: { phone, verified: false },
    data: { verified: true }, // Mark old codes as used
  });

  await prisma.otpCode.create({
    data: {
      phone,
      code: hashedCode,
      expiresAt,
    },
  });

  return { code, expiresAt };
}

// Verify an OTP code for a phone number
export async function verifyOtp(
  phone: string,
  inputCode: string
): Promise<{ valid: boolean; reason?: string }> {
  // Find the latest unverified OTP
  const otp = await prisma.otpCode.findFirst({
    where: { phone, verified: false },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    return { valid: false, reason: "OTP_NOT_FOUND" };
  }

  // Check if expired
  if (new Date() > otp.expiresAt) {
    return { valid: false, reason: "OTP_EXPIRED" };
  }

  // Check max attempts
  if (otp.attempts >= env.otp.maxAttempts) {
    return { valid: false, reason: "OTP_MAX_ATTEMPTS" };
  }

  // Increment attempts before verifying
  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { attempts: otp.attempts + 1 },
  });

  // Compare with bcrypt
  const isMatch = await bcrypt.compare(inputCode, otp.code);

  if (!isMatch) {
    return { valid: false, reason: "INVALID_OTP" };
  }

  // Mark as verified
  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { verified: true },
  });

  return { valid: true };
}

// Get latest OTP for debugging (development only)
export async function getLatestOtp(phone: string): Promise<OtpCode | null> {
  return prisma.otpCode.findFirst({
    where: { phone, verified: false },
    orderBy: { createdAt: "desc" },
  });
}
