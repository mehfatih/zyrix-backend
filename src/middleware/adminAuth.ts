// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Admin JWT Middleware
// ─────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ERROR_CODES } from "../types";

export interface AdminPayload {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AdminRequest extends Request {
  admin: AdminPayload;
}

export function authenticateAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED, message: "Admin authorization required" },
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.adminJwt.secret) as AdminPayload;
    (req as AdminRequest).admin = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: "Admin token expired" },
      });
      return;
    }
    res.status(401).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_TOKEN, message: "Invalid admin token" },
    });
  }
}
