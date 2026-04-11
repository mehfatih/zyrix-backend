// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Payout Scheduling Controller (Elite)
// جدولة + Smart Cashflow + History
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../config/database";

// ─── Types ───────────────────────────────────────────────────

interface ScheduleRow {
  id: string;
  name: string;
  frequency: string;
  day_of_week: number | null;
  day_of_month: number | null;
  amount: number | null;
  currency: string;
  bank_name: string | null;
  bank_iban: string | null;
  is_active: boolean;
  next_payout_at: string | null;
  last_payout_at: string | null;
  total_paid: number;
  payout_count: number;
  created_at: string;
}

interface HistoryRow {
  id: string;
  schedule_id: string;
  amount: number;
  currency: string;
  status: string;
  bank_name: string | null;
  bank_iban: string | null;
  reference: string | null;
  note: string | null;
  scheduled_at: string;
  executed_at: string | null;
  created_at: string;
}

interface RevDayRow {
  day_num: number;
  total: number;
}

interface InsightRow {
  best_day_of_week: number | null;
  best_day_of_month: number | null;
  avg_daily_revenue: number;
  avg_weekly_revenue: number;
  recommended_frequency: string;
  recommendation: string | null;
  calculated_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────

const DAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function calcNextPayoutDate(frequency: string, dayOfWeek?: number, dayOfMonth?: number): Date {
  const now = new Date();
  const next = new Date(now);

  if (frequency === 'DAILY') {
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
  } else if (frequency === 'WEEKLY') {
    const target = dayOfWeek ?? 0;
    const current = now.getDay();
    const daysUntil = (target - current + 7) % 7 || 7;
    next.setDate(next.getDate() + daysUntil);
    next.setHours(9, 0, 0, 0);
  } else if (frequency === 'MONTHLY') {
    const target = dayOfMonth ?? 1;
    next.setDate(target);
    if (next <= now) next.setMonth(next.getMonth() + 1);
    next.setHours(9, 0, 0, 0);
  }

  return next;
}

async function calcCashflowInsights(merchantId: string): Promise<{
  bestDayOfWeek: number;
  bestDayOfMonth: number;
  avgDailyRevenue: number;
  avgWeeklyRevenue: number;
  recommendedFrequency: string;
  recommendation: string;
}> {
  // أفضل يوم في الأسبوع (أعلى إيراد)
  const weekRows = await prisma.$queryRawUnsafe<RevDayRow[]>(
    `SELECT EXTRACT(DOW FROM created_at)::int AS day_num,
            COALESCE(SUM(amount::numeric), 0)::float AS total
     FROM transactions
     WHERE merchant_id = $1 AND status = 'SUCCESS' AND is_credit = TRUE
       AND created_at >= NOW() - INTERVAL '90 days'
     GROUP BY day_num ORDER BY total DESC`,
    merchantId
  );

  const monthRows = await prisma.$queryRawUnsafe<RevDayRow[]>(
    `SELECT EXTRACT(DAY FROM created_at)::int AS day_num,
            COALESCE(SUM(amount::numeric), 0)::float AS total
     FROM transactions
     WHERE merchant_id = $1 AND status = 'SUCCESS' AND is_credit = TRUE
       AND created_at >= NOW() - INTERVAL '90 days'
     GROUP BY day_num ORDER BY total DESC`,
    merchantId
  );

  const avgRow = await prisma.$queryRawUnsafe<{ daily: number; weekly: number }[]>(
    `SELECT
       COALESCE(SUM(amount::numeric) / 90, 0)::float AS daily,
       COALESCE(SUM(amount::numeric) / 13, 0)::float AS weekly
     FROM transactions
     WHERE merchant_id = $1 AND status = 'SUCCESS' AND is_credit = TRUE
       AND created_at >= NOW() - INTERVAL '90 days'`,
    merchantId
  );

  const bestDayOfWeek  = weekRows[0]?.day_num  ?? 0;
  const bestDayOfMonth = monthRows[0]?.day_num ?? 1;
  const avgDaily       = Number(avgRow[0]?.daily  ?? 0);
  const avgWeekly      = Number(avgRow[0]?.weekly ?? 0);

  let recommendedFrequency = 'WEEKLY';
  let recommendation = '';

  if (avgDaily > 5000) {
    recommendedFrequency = 'DAILY';
    recommendation = `إيراداتك اليومية مرتفعة (${avgDaily.toFixed(0)} ر.س) — نوصي بالسحب اليومي للحفاظ على السيولة`;
  } else if (avgWeekly > 10000) {
    recommendedFrequency = 'WEEKLY';
    recommendation = `أفضل يوم للسحب الأسبوعي هو ${DAY_AR[bestDayOfWeek]} حيث يكون الإيراد في أعلاه`;
  } else {
    recommendedFrequency = 'MONTHLY';
    recommendation = `إيراداتك تناسب السحب الشهري في اليوم ${bestDayOfMonth} من كل شهر`;
  }

  return { bestDayOfWeek, bestDayOfMonth, avgDailyRevenue: avgDaily, avgWeeklyRevenue: avgWeekly, recommendedFrequency, recommendation };
}

// ─── Controller ──────────────────────────────────────────────

export const payoutSchedulingController = {
  // ─── List Schedules ──────────────────────────────
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;

      const schedules = await prisma.$queryRawUnsafe<ScheduleRow[]>(
        `SELECT id, name, frequency, day_of_week, day_of_month, amount, currency,
                bank_name, bank_iban, is_active, next_payout_at, last_payout_at,
                total_paid, payout_count, created_at
         FROM payout_schedules
         WHERE merchant_id = $1
         ORDER BY created_at DESC`,
        merchantId
      );

      res.json({
        success: true,
        data: schedules.map((s: ScheduleRow) => ({
          id: s.id,
          name: s.name,
          frequency: s.frequency,
          dayOfWeek: s.day_of_week,
          dayOfMonth: s.day_of_month,
          amount: s.amount ? Number(s.amount) : null,
          currency: s.currency,
          bankName: s.bank_name,
          bankIban: s.bank_iban,
          isActive: s.is_active,
          nextPayoutAt: s.next_payout_at,
          lastPayoutAt: s.last_payout_at,
          totalPaid: Number(s.total_paid),
          payoutCount: Number(s.payout_count),
          createdAt: s.created_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Create Schedule ─────────────────────────────
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        name, frequency, dayOfWeek, dayOfMonth,
        amount, currency = 'SAR', bankName, bankIban,
      } = req.body as {
        name: string; frequency: string; dayOfWeek?: number; dayOfMonth?: number;
        amount?: number; currency?: string; bankName?: string; bankIban?: string;
      };

      if (!name || !frequency) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'name and frequency are required' },
        });
        return;
      }

      if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(frequency.toUpperCase())) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'frequency must be DAILY, WEEKLY, or MONTHLY' },
        });
        return;
      }

      const nextPayoutAt = calcNextPayoutDate(frequency.toUpperCase(), dayOfWeek, dayOfMonth);

      await prisma.$executeRawUnsafe(
        `INSERT INTO payout_schedules
           (merchant_id, name, frequency, day_of_week, day_of_month, amount, currency,
            bank_name, bank_iban, next_payout_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        req.merchant.id, name, frequency.toUpperCase(),
        dayOfWeek ?? null, dayOfMonth ?? null,
        amount ?? null, currency.toUpperCase(),
        bankName ?? null, bankIban ?? null,
        nextPayoutAt.toISOString()
      );

      const created = await prisma.$queryRawUnsafe<ScheduleRow[]>(
        `SELECT * FROM payout_schedules WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 1`,
        req.merchant.id
      );

      res.status(201).json({
        success: true,
        data: created[0]
          ? {
              id: created[0].id,
              name: created[0].name,
              frequency: created[0].frequency,
              nextPayoutAt: created[0].next_payout_at,
              isActive: created[0].is_active,
            }
          : null,
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Update Schedule ─────────────────────────────
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const merchantId = req.merchant.id;

      const existing = await prisma.$queryRawUnsafe<ScheduleRow[]>(
        `SELECT id FROM payout_schedules WHERE id = $1 AND merchant_id = $2`,
        id, merchantId
      );
      if (existing.length === 0) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } });
        return;
      }

      const { name, frequency, dayOfWeek, dayOfMonth, amount, bankName, bankIban, isActive } = req.body as {
        name?: string; frequency?: string; dayOfWeek?: number; dayOfMonth?: number;
        amount?: number; bankName?: string; bankIban?: string; isActive?: boolean;
      };

      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (name !== undefined)        { fields.push(`name = $${idx++}`);          values.push(name); }
      if (frequency !== undefined)   { fields.push(`frequency = $${idx++}`);     values.push(frequency.toUpperCase()); }
      if (dayOfWeek !== undefined)   { fields.push(`day_of_week = $${idx++}`);   values.push(dayOfWeek); }
      if (dayOfMonth !== undefined)  { fields.push(`day_of_month = $${idx++}`);  values.push(dayOfMonth); }
      if (amount !== undefined)      { fields.push(`amount = $${idx++}`);        values.push(amount); }
      if (bankName !== undefined)    { fields.push(`bank_name = $${idx++}`);     values.push(bankName); }
      if (bankIban !== undefined)    { fields.push(`bank_iban = $${idx++}`);     values.push(bankIban); }
      if (isActive !== undefined)    { fields.push(`is_active = $${idx++}`);     values.push(isActive); }

      if (fields.length === 0) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
        return;
      }

      fields.push(`updated_at = NOW()`);
      values.push(id, merchantId);

      await prisma.$executeRawUnsafe(
        `UPDATE payout_schedules SET ${fields.join(', ')} WHERE id = $${idx} AND merchant_id = $${idx + 1}`,
        ...values
      );

      res.json({ success: true, data: { updated: true } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Delete Schedule ─────────────────────────────
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const merchantId = req.merchant.id;

      const existing = await prisma.$queryRawUnsafe<ScheduleRow[]>(
        `SELECT id FROM payout_schedules WHERE id = $1 AND merchant_id = $2`,
        id, merchantId
      );
      if (existing.length === 0) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } });
        return;
      }

      await prisma.$executeRawUnsafe(
        `DELETE FROM payout_schedules WHERE id = $1 AND merchant_id = $2`,
        id, merchantId
      );

      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Execute Payout (Elite) ──────────────────────
  async executePayout(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const merchantId = req.merchant.id;

      const schedules = await prisma.$queryRawUnsafe<ScheduleRow[]>(
        `SELECT * FROM payout_schedules WHERE id = $1 AND merchant_id = $2`,
        id, merchantId
      );
      if (schedules.length === 0) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } });
        return;
      }
      const schedule = schedules[0];

      // جلب الرصيد المتاح
      const wallet = await prisma.wallet.findFirst({
        where: { merchantId, currency: schedule.currency },
      });
      const available = wallet ? Number(wallet.balance) - Number(wallet.lockedBalance) : 0;

      const payoutAmount = schedule.amount ? Math.min(Number(schedule.amount), available) : available;

      if (payoutAmount <= 0) {
        res.status(400).json({
          success: false,
          error: { code: 'INSUFFICIENT_BALANCE', message: 'رصيد غير كافٍ للتنفيذ' },
        });
        return;
      }

      const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
      const nextPayout = calcNextPayoutDate(
        schedule.frequency,
        schedule.day_of_week ?? undefined,
        schedule.day_of_month ?? undefined
      );

      // تسجيل في الـ history
      await prisma.$executeRawUnsafe(
        `INSERT INTO payout_history
           (schedule_id, merchant_id, amount, currency, status, bank_name, bank_iban, reference, scheduled_at, executed_at)
         VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6, $7, NOW(), NOW())`,
        id, merchantId, payoutAmount, schedule.currency,
        schedule.bank_name, schedule.bank_iban, reference
      );

      // تحديث الـ schedule
      await prisma.$executeRawUnsafe(
        `UPDATE payout_schedules
         SET last_payout_at = NOW(), next_payout_at = $1,
             total_paid = total_paid + $2, payout_count = payout_count + 1, updated_at = NOW()
         WHERE id = $3`,
        nextPayout.toISOString(), payoutAmount, id
      );

      // خصم من الـ wallet
      if (wallet) {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: payoutAmount } },
        });
      }

      res.json({
        success: true,
        data: {
          reference,
          amount: payoutAmount,
          currency: schedule.currency,
          bankName: schedule.bank_name,
          bankIban: schedule.bank_iban,
          nextPayoutAt: nextPayout.toISOString(),
          executedAt: new Date().toISOString(),
        },
        message: `تم تنفيذ الدفع: ${payoutAmount} ${schedule.currency}`,
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Get History ─────────────────────────────────
  async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const limit = parseInt(req.query.limit as string) || 20;

      const history = await prisma.$queryRawUnsafe<HistoryRow[]>(
        `SELECT h.id, h.schedule_id, h.amount, h.currency, h.status,
                h.bank_name, h.bank_iban, h.reference, h.note,
                h.scheduled_at, h.executed_at, h.created_at,
                s.name AS schedule_name, s.frequency
         FROM payout_history h
         JOIN payout_schedules s ON s.id = h.schedule_id
         WHERE h.merchant_id = $1
         ORDER BY h.created_at DESC
         LIMIT $2`,
        merchantId, limit
      );

      res.json({
        success: true,
        data: history.map((h: HistoryRow & { schedule_name?: string; frequency?: string }) => ({
          id: h.id,
          scheduleId: h.schedule_id,
          scheduleName: (h as any).schedule_name,
          frequency: (h as any).frequency,
          amount: Number(h.amount),
          currency: h.currency,
          status: h.status,
          bankName: h.bank_name,
          bankIban: h.bank_iban,
          reference: h.reference,
          note: h.note,
          scheduledAt: h.scheduled_at,
          executedAt: h.executed_at,
          createdAt: h.created_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Smart Cashflow Insights (Elite) ─────────────
  async getCashflowInsights(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;

      // تحقق من وجود insights محفوظة
      const existing = await prisma.$queryRawUnsafe<InsightRow[]>(
        `SELECT * FROM payout_cashflow_insights WHERE merchant_id = $1`,
        merchantId
      );

      // احسب من جديد لو أقدم من 24 ساعة
      const needsRecalc = existing.length === 0 ||
        (Date.now() - new Date(existing[0].calculated_at).getTime()) > 86400000;

      if (needsRecalc) {
        const insights = await calcCashflowInsights(merchantId);

        await prisma.$executeRawUnsafe(
          `INSERT INTO payout_cashflow_insights
             (merchant_id, best_day_of_week, best_day_of_month, avg_daily_revenue,
              avg_weekly_revenue, recommended_frequency, recommendation)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (merchant_id) DO UPDATE
             SET best_day_of_week = $2, best_day_of_month = $3, avg_daily_revenue = $4,
                 avg_weekly_revenue = $5, recommended_frequency = $6,
                 recommendation = $7, calculated_at = NOW()`,
          merchantId,
          insights.bestDayOfWeek, insights.bestDayOfMonth,
          insights.avgDailyRevenue, insights.avgWeeklyRevenue,
          insights.recommendedFrequency, insights.recommendation
        );

        res.json({
          success: true,
          data: {
            bestDayOfWeek: insights.bestDayOfWeek,
            bestDayOfWeekAr: DAY_AR[insights.bestDayOfWeek],
            bestDayOfMonth: insights.bestDayOfMonth,
            avgDailyRevenue: Math.round(insights.avgDailyRevenue),
            avgWeeklyRevenue: Math.round(insights.avgWeeklyRevenue),
            recommendedFrequency: insights.recommendedFrequency,
            recommendation: insights.recommendation,
            calculatedAt: new Date().toISOString(),
          },
        });
        return;
      }

      const r: InsightRow = existing[0];
      res.json({
        success: true,
        data: {
          bestDayOfWeek: r.best_day_of_week,
          bestDayOfWeekAr: r.best_day_of_week !== null ? DAY_AR[r.best_day_of_week] : null,
          bestDayOfMonth: r.best_day_of_month,
          avgDailyRevenue: Math.round(Number(r.avg_daily_revenue)),
          avgWeeklyRevenue: Math.round(Number(r.avg_weekly_revenue)),
          recommendedFrequency: r.recommended_frequency,
          recommendation: r.recommendation,
          calculatedAt: r.calculated_at,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
