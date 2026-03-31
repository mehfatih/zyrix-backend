import { Response, NextFunction } from "express";
import { AdminRequest } from "../../middleware/adminAuth";
import { adminStatsService } from "../../services/admin/adminStatsService";

export const adminStatsController = {
  async getStats(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const data = await adminStatsService.getSystemStats();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },
};
