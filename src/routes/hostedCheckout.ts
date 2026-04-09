// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Hosted Checkout Routes
// ─────────────────────────────────────────────────────────────
import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
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
router.get("/",       authenticateToken, listCheckouts);
router.post("/",      authenticateToken, createCheckout);
router.get("/:id",    authenticateToken, getCheckout);
router.put("/:id",    authenticateToken, updateCheckout);
router.delete("/:id", authenticateToken, deleteCheckout);

// ─── Public routes (for customer payment page) ────────────────
router.post("/:checkoutId/sessions", createSession);
router.get("/sessions/:sessionId",   getSession);

export default router;
