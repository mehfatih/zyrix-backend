import { Request, Response, NextFunction } from "express";
import { adminAuthService } from "../../services/admin/adminAuthService";

export const adminAuthController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Email and password required" } });
        return;
      }
      const result = await adminAuthService.login(email, password);
      if (!result) {
        res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },
};
