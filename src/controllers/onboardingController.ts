import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

// GET /api/onboarding — جلب حالة الـ onboarding
export const getOnboardingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;

    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM onboarding_progress WHERE merchant_id = $1 LIMIT 1`,
      merchantId
    ) as any[];

    if (rows.length === 0) {
      // أنشئ record جديد تلقائياً
      const newRows = await prisma.$queryRawUnsafe(
        `INSERT INTO onboarding_progress (merchant_id)
         VALUES ($1)
         RETURNING *`,
        merchantId
      ) as any[];
      res.json({ success: true, data: newRows[0] });
      return;
    }

    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get onboarding status" });
    return;
  }
};

// POST /api/onboarding/step — تحديث خطوة
export const updateOnboardingStep = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { step, data } = req.body;

    const rows = await prisma.$queryRawUnsafe(
      `UPDATE onboarding_progress
       SET current_step = GREATEST(current_step, $2 + 1),
           completed_steps = completed_steps || $3::jsonb,
           kyc_data = COALESCE(kyc_data, '{}'::jsonb) || $4::jsonb,
           updated_at = NOW()
       WHERE merchant_id = $1
       RETURNING *`,
      merchantId,
      Number(step),
      JSON.stringify([step]),
      JSON.stringify(data || {})
    ) as any[];

    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update step" });
    return;
  }
};

// POST /api/onboarding/complete — إنهاء الـ onboarding
export const completeOnboarding = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;

    const rows = await prisma.$queryRawUnsafe(
      `UPDATE onboarding_progress
       SET kyc_status = 'approved',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE merchant_id = $1
       RETURNING *`,
      merchantId
    ) as any[];

    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to complete onboarding" });
    return;
  }
};

// POST /api/onboarding/auto-fill — Elite: auto-fill من بيانات موجودة
export const autoFillKYC = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;

    // جلب بيانات الـ merchant من الجدول الأساسي
    const merchantRows = await prisma.$queryRawUnsafe(
      `SELECT name, email, phone FROM merchants WHERE id = $1 LIMIT 1`,
      merchantId
    ) as any[];

    const merchant = merchantRows[0];
    const autoData = {
      full_name: merchant?.name || "",
      email: merchant?.email || "",
      phone: merchant?.phone || "",
      auto_filled: true,
    };

    const rows = await prisma.$queryRawUnsafe(
      `UPDATE onboarding_progress
       SET kyc_data = $2::jsonb,
           auto_filled = true,
           updated_at = NOW()
       WHERE merchant_id = $1
       RETURNING *`,
      merchantId,
      JSON.stringify(autoData)
    ) as any[];

    res.json({ success: true, data: rows[0], autoData });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to auto-fill" });
    return;
  }
};
