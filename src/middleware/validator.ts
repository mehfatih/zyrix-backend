// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Zod Validation Middleware
// ─────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { ERROR_CODES } from "../types";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Validation failed",
            details: err.errors.map((e) => ({
              field: e.path.join("."),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(err);
    }
  };
}
