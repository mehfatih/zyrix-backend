// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Invoices Routes (Elite)
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { invoicesController } from "../controllers/invoicesController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

// ─── Core ────────────────────────────────────────────────────
router.get("/", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.list(req as AuthenticatedRequest, res, next));

router.post("/", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.create(req as AuthenticatedRequest, res, next));

router.get("/overdue-summary", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.getOverdueSummary(req as AuthenticatedRequest, res, next));

router.get("/:id", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.getById(req as AuthenticatedRequest, res, next));

router.put("/:id", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.update(req as AuthenticatedRequest, res, next));

router.delete("/:id", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.delete(req as AuthenticatedRequest, res, next));

router.post("/:id/send", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.send(req as AuthenticatedRequest, res, next));

router.post("/:id/mark-paid", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.markPaid(req as AuthenticatedRequest, res, next));

// ─── Elite: e-Invoicing ZATCA ────────────────────────────────
router.post("/:id/einvoice/generate", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.generateEInvoice(req as AuthenticatedRequest, res, next));

router.get("/:id/einvoice", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.getEInvoice(req as AuthenticatedRequest, res, next));

// ─── Elite: Reminders ────────────────────────────────────────
router.post("/:id/reminders/send", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.sendReminder(req as AuthenticatedRequest, res, next));

router.get("/:id/reminders", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.getReminders(req as AuthenticatedRequest, res, next));

export default router;
