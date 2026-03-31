// ─────────────────────────────────────────────────────────────
// Zyrix Backend — JWT Authentication Middleware
// ─────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { MerchantPayload, AuthenticatedRequest, ERROR_CODES } from "../types";

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: {
        code: ERROR_CODES.UNAUTHORIZED,
        message: "Authorization header missing or malformed",
      },
    });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  try {
    const payload = jwt.verify(token, env.jwt.secret) as MerchantPayload;
    (req as AuthenticatedRequest).merchant = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: {
          code: ERROR_CODES.TOKEN_EXPIRED,
          message: "Access token has expired",
        },
      });
      return;
    }

    res.status(401).json({
      success: false,
      error: {
        code: ERROR_CODES.INVALID_TOKEN,
        message: "Invalid access token",
      },
    });
  }
}
