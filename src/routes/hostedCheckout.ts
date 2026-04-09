import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  createCheckout,
  listCheckouts,
  getCheckout,
  updateCheckout,
  deleteCheckout,
  createSession,
  getSession,
} from "../controllers/hostedCheckoutController";

const router = Router();

// ─── Merchant routes (authenticated) ─────────────────────────
router.get("/",    authenticate, listCheckouts);
router.post("/",   authenticate, createCheckout);
router.get("/:id", authenticate, getCheckout);
router.put("/:id", authenticate, updateCheckout);
router.delete("/:id", authenticate, deleteCheckout);

// ─── Public routes (for customer payment page) ────────────────
router.post("/:checkoutId/sessions", createSession);
router.get("/sessions/:sessionId",   getSession);

export default router;
