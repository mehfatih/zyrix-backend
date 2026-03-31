// ─────────────────────────────────────────────────────────────
// Zyrix Backend — JWT Token Service
// ─────────────────────────────────────────────────────────────

import jwt from "jsonwebtoken";
import { Merchant } from "@prisma/client";
import { env } from "../config/env";
import { MerchantPayload, RefreshTokenPayload } from "../types";

// Generate access token (7 days)
export function generateAccessToken(merchant: Merchant): string {
  const payload: MerchantPayload = {
    id: merchant.id,
    phone: merchant.phone,
    merchantId: merchant.merchantId,
    email: merchant.email,
    name: merchant.name,
  };

  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as jwt.SignOptions["expiresIn"],
  });
}

// Generate refresh token (30 days)
export function generateRefreshToken(merchantId: string): string {
  const payload: RefreshTokenPayload = {
    id: merchantId,
    type: "refresh",
  };

  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

// Verify access token
export function verifyAccessToken(token: string): MerchantPayload {
  return jwt.verify(token, env.jwt.secret) as MerchantPayload;
}

// Verify refresh token
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;

  if (payload.type !== "refresh") {
    throw new Error("Invalid token type");
  }

  return payload;
}
