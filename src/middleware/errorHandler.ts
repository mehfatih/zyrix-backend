// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Global Error Handler Middleware
// ─────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { ERROR_CODES } from "../types";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log in development
  if (env.isDev) {
    console.error("[ErrorHandler]", {
      message: err.message,
      stack: err.stack,
      code: err.code,
    });
  }

  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? ERROR_CODES.INTERNAL_ERROR;
  const message =
    env.isDev || statusCode < 500
      ? err.message
      : "An internal server error occurred";

  res.status(statusCode).json({
    success: false,
    error: { code, message },
  });
}

// Helper to create typed app errors
export function createError(
  message: string,
  statusCode: number,
  code: string
): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

// 404 handler
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `Route '${req.method} ${req.path}' not found`,
    },
  });
}
