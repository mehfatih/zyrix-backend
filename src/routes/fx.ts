// ─────────────────────────────────────────────────────────────
// Zyrix Backend — FX Exchange Rates Routes
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response } from "express";

const router = Router();

// Static rates vs USD — updated periodically
const RATES: Record<string, number> = {
  USD: 1,
  SAR: 3.75,
  AED: 3.67,
  KWD: 0.31,
  QAR: 3.64,
  IQD: 1310,
  EUR: 0.92,
  TRY: 32.5,
};

router.get("/rates", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      base: "USD",
      rates: RATES,
      updatedAt: new Date().toISOString(),
    },
  });
});

router.get("/convert", (req: Request, res: Response) => {
  const { from, to, amount } = req.query as { from: string; to: string; amount: string };

  if (!from || !to || !amount) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "from, to, amount required" } });
    return;
  }

  const fromRate = RATES[from.toUpperCase()];
  const toRate = RATES[to.toUpperCase()];

  if (!fromRate || !toRate) {
    res.status(400).json({ success: false, error: { code: "INVALID_CURRENCY", message: "Unsupported currency" } });
    return;
  }

  const amountNum = parseFloat(amount);
  const converted = (amountNum / fromRate) * toRate;

  res.json({
    success: true,
    data: {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      amount: amountNum,
      converted: parseFloat(converted.toFixed(4)),
      rate: parseFloat((toRate / fromRate).toFixed(6)),
    },
  });
});

export default router;
