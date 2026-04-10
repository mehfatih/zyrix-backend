// src/routes/wallets.ts
import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  listWallets,
  getWallet,
  convertCurrency,
  toggleWallet,
  getWalletRates,
} from "../controllers/walletsController";

const router = Router();

router.use(authenticateToken as any);

router.get("/",                        listWallets      as any);
router.get("/rates",                   getWalletRates   as any);
router.get("/:currency",               getWallet        as any);
router.post("/convert",                convertCurrency  as any);
router.patch("/:currency/toggle",      toggleWallet     as any);

export default router;
