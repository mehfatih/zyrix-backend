import { Response, NextFunction } from "express";
import { AdminRequest } from "../../middleware/adminAuth";
import { adminDisputesService } from "../../services/admin/adminDisputesService";
import { parsePagination, buildMeta } from "../../utils/pagination";

export const adminDisputesController = {
  async list(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query.page as string, req.query.limit as string);
      const { data, total } = await adminDisputesService.list(pagination, req.query.status as string);
      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) { next(err); }
  },

  async update(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const dispute = await adminDisputesService.update(req.params.id, req.body);
      res.json({ success: true, data: dispute });
    } catch (err) { next(err); }
  },
};
