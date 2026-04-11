// src/routes/wallets.ts (Elite)
import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  listWallets,
  getWallet,
  convertCurrency,
  toggleWallet,
  getWalletRates,
  createSubWallet,
  allocateToSubWallet,
  deleteSubWallet,
  setCashflowAlert,
  getCashflowAlerts,
} from "../controllers/walletsController";

const router = Router();
router.use(authenticateToken as any);

// ─── Core ────────────────────────────────────────────────────
router.get("/",                        listWallets      as any);
router.get("/rates",                   getWalletRates   as any);
router.get("/:currency",               getWallet        as any);
router.post("/convert",                convertCurrency  as any);
router.patch("/:currency/toggle",      toggleWallet     as any);

// ─── Elite: Sub-wallets ──────────────────────────────────────
router.post("/:currency/sub-wallets",                      createSubWallet     as any);
router.post("/:currency/sub-wallets/:id/allocate",         allocateToSubWallet as any);
router.delete("/:currency/sub-wallets/:id",                deleteSubWallet     as any);

// ─── Elite: Cashflow Alerts ──────────────────────────────────
router.get("/cashflow-alerts",         getCashflowAlerts as any);
router.post("/cashflow-alerts",        setCashflowAlert  as any);

export default router;
