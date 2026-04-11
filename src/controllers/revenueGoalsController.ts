// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Revenue Goals Controller (Elite)
// Forecast + Recommendations + Progress Sync
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../config/database";
import { parsePagination, buildMeta } from "../utils/pagination";

// ─── Types ───────────────────────────────────────────────────

interface ForecastRow {
  goal_id: string;
  daily_rate: number;
  projected_total: number;
  will_achieve: boolean;
  gap_amount: number;
  confidence: number;
  calculated_at: string;
}

interface RecommendationRow {
  goal_id: string;
  type: string;
  title: string;
  description: string;
  priority: string;
}

interface TxSumRow {
  total: number;
}

interface GoalRow {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  period: string;
  start_date: string;
  end_date: string;
}

// ─── Helpers ─────────────────────────────────────────────────

const VALID_PERIODS = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"];

function calcForecast(params: {
  currentAmount: number;
  targetAmount: number;
  startDate: Date;
  endDate: Date;
}): { dailyRate: number; projectedTotal: number; willAchieve: boolean; gapAmount: number; confidence: number } {
  const now = Date.now();
  const start = new Date(params.startDate).getTime();
  const end = new Date(params.endDate).getTime();

  const totalDays = Math.max(1, Math.floor((end - start) / 86400000));
  const daysElapsed = Math.max(1, Math.floor((now - start) / 86400000));
  const daysLeft = Math.max(0, Math.floor((end - now) / 86400000));

  const dailyRate = params.currentAmount / daysElapsed;
  const projectedTotal = params.currentAmount + dailyRate * daysLeft;
  const willAchieve = projectedTotal >= params.targetAmount;
  const gapAmount = Math.max(0, params.targetAmount - projectedTotal);

  // confidence: نسبة مئوية بناءً على مدى اتساق المعدل اليومي
  const progressRate = params.currentAmount / params.targetAmount;
  const timeRate = daysElapsed / totalDays;
  const ratio = timeRate > 0 ? progressRate / timeRate : 0;
  const confidence = Math.min(100, Math.round(ratio * 70 + (willAchieve ? 30 : 0)));

  return { dailyRate, projectedTotal, willAchieve, gapAmount, confidence };
}

function buildRecommendation(params: {
  name: string;
  currentAmount: number;
  targetAmount: number;
  progress: number;
  daysLeft: number;
  willAchieve: boolean;
  gapAmount: number;
  dailyRate: number;
}): { type: string; title: string; description: string; priority: string } {
  const { progress, daysLeft, willAchieve, gapAmount, dailyRate, name } = params;

  if (progress >= 100) {
    return {
      type: "celebrate",
      title: `🎉 تم تحقيق الهدف "${name}"`,
      description: "أحسنت! حقّقت هدفك بالكامل. حان وقت رفع السقف وتحديد هدف أكبر.",
      priority: "low",
    };
  }

  if (!willAchieve && daysLeft <= 7 && daysLeft > 0) {
    const neededDaily = gapAmount / Math.max(1, daysLeft);
    return {
      type: "warning",
      title: `⚠️ "${name}" في خطر`,
      description: `متبقي ${daysLeft} أيام والفجوة ${gapAmount.toLocaleString()} — تحتاج ${neededDaily.toFixed(0)} يومياً للتعويض.`,
      priority: "high",
    };
  }

  if (!willAchieve && gapAmount > 0) {
    return {
      type: "boost",
      title: `📈 عزّز مبيعاتك لتحقيق "${name}"`,
      description: `معدلك الحالي ${dailyRate.toFixed(0)}/يوم — تحتاج تزيده لسد فجوة ${gapAmount.toLocaleString()}.`,
      priority: "medium",
    };
  }

  if (willAchieve && progress < 50) {
    return {
      type: "adjust",
      title: `🎯 مسارك صحيح نحو "${name}"`,
      description: `بمعدلك الحالي ستحقق الهدف قبل نهاية الفترة. استمر واضبط جهودك.`,
      priority: "low",
    };
  }

  return {
    type: "boost",
    title: `💡 فرصة لتجاوز "${name}"`,
    description: `أنت على مسار جيد — قليل من الجهد الإضافي يمكن أن يتجاوز هدفك.`,
    priority: "medium",
  };
}

// ─── Controller ──────────────────────────────────────────────

export const revenueGoalsController = {
  // ─── List ────────────────────────────────────────
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const pagination = parsePagination(
        req.query.page as string,
        req.query.limit as string
      );

      const [rows, total] = await Promise.all([
        prisma.revenueGoal.findMany({
          where: { merchantId },
          orderBy: { createdAt: "desc" },
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
        }),
        prisma.revenueGoal.count({ where: { merchantId } }),
      ]);

      // جلب forecasts + recommendations
      const goalIds = rows.map((r) => r.id);

      const [forecastRows, recRows]: [ForecastRow[], RecommendationRow[]] =
        goalIds.length > 0
          ? await Promise.all([
              prisma.$queryRawUnsafe<ForecastRow[]>(
                `SELECT goal_id, daily_rate, projected_total, will_achieve, gap_amount, confidence, calculated_at
                 FROM revenue_goal_forecasts
                 WHERE goal_id = ANY($1::text[])`,
                goalIds
              ),
              prisma.$queryRawUnsafe<RecommendationRow[]>(
                `SELECT goal_id, type, title, description, priority
                 FROM revenue_goal_recommendations
                 WHERE goal_id = ANY($1::text[])`,
                goalIds
              ),
            ])
          : [[], []];

      const forecastMap = new Map(forecastRows.map((f: ForecastRow) => [f.goal_id, f]));
      const recMap = new Map(recRows.map((r: RecommendationRow) => [r.goal_id, r]));

      const data = rows.map((g) => {
        const target = Number(g.targetAmount);
        const current = Number(g.currentAmount);
        const progress = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
        const daysLeft = Math.max(0, Math.floor((new Date(g.endDate).getTime() - Date.now()) / 86400000));
        const fc = forecastMap.get(g.id);
        const rec = recMap.get(g.id);

        return {
          ...g,
          targetAmount: target,
          currentAmount: current,
          progress,
          daysLeft,
          status: current >= target ? "achieved" : daysLeft === 0 ? "expired" : "in_progress",
          forecast: fc
            ? {
                dailyRate: Number(fc.daily_rate),
                projectedTotal: Number(fc.projected_total),
                willAchieve: fc.will_achieve,
                gapAmount: Number(fc.gap_amount),
                confidence: Number(fc.confidence),
                calculatedAt: fc.calculated_at,
              }
            : null,
          recommendation: rec
            ? { type: rec.type, title: rec.title, description: rec.description, priority: rec.priority }
            : null,
        };
      });

      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) {
      next(err);
    }
  },

  // ─── Create ──────────────────────────────────────
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, targetAmount, currency, period, startDate, endDate } = req.body as {
        name: string; targetAmount: number; currency: string;
        period: string; startDate: string; endDate: string;
      };

      if (!name || targetAmount === undefined || !currency || !period || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "name, targetAmount, currency, period, startDate, endDate are required" },
        });
        return;
      }

      if (!VALID_PERIODS.includes(period.toUpperCase())) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: `period must be one of: ${VALID_PERIODS.join(", ")}` },
        });
        return;
      }

      const goal = await prisma.revenueGoal.create({
        data: {
          merchantId: req.merchant.id,
          name,
          targetAmount,
          currentAmount: 0,
          currency,
          period: period.toUpperCase() as never,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
        },
      });

      // حساب forecast + recommendation أولية
      const fc = calcForecast({
        currentAmount: 0,
        targetAmount: Number(targetAmount),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });

      const rec = buildRecommendation({
        name,
        currentAmount: 0,
        targetAmount: Number(targetAmount),
        progress: 0,
        daysLeft: Math.max(0, Math.floor((new Date(endDate).getTime() - Date.now()) / 86400000)),
        willAchieve: fc.willAchieve,
        gapAmount: fc.gapAmount,
        dailyRate: fc.dailyRate,
      });

      await Promise.all([
        prisma.$executeRawUnsafe(
          `INSERT INTO revenue_goal_forecasts
             (goal_id, merchant_id, daily_rate, projected_total, will_achieve, gap_amount, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (goal_id) DO UPDATE
             SET daily_rate = $3, projected_total = $4, will_achieve = $5, gap_amount = $6, confidence = $7, calculated_at = NOW()`,
          goal.id, req.merchant.id, fc.dailyRate, fc.projectedTotal, fc.willAchieve, fc.gapAmount, fc.confidence
        ),
        prisma.$executeRawUnsafe(
          `INSERT INTO revenue_goal_recommendations
             (goal_id, merchant_id, type, title, description, priority)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (goal_id) DO UPDATE
             SET type = $3, title = $4, description = $5, priority = $6, created_at = NOW()`,
          goal.id, req.merchant.id, rec.type, rec.title, rec.description, rec.priority
        ),
      ]);

      res.status(201).json({
        success: true,
        data: {
          ...goal,
          targetAmount: Number(goal.targetAmount),
          currentAmount: Number(goal.currentAmount),
          progress: 0,
          forecast: fc,
          recommendation: rec,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Update ──────────────────────────────────────
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.revenueGoal.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!existing) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Revenue goal not found" } });
        return;
      }

      const updated = await prisma.revenueGoal.update({
        where: { id: req.params.id },
        data: req.body,
      });

      res.json({ success: true, data: { ...updated, targetAmount: Number(updated.targetAmount), currentAmount: Number(updated.currentAmount) } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Delete ──────────────────────────────────────
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.revenueGoal.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!existing) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Revenue goal not found" } });
        return;
      }

      await prisma.revenueGoal.delete({ where: { id: req.params.id } });
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Sync Progress (Elite) ───────────────────────
  // يحسب currentAmount من المعاملات الفعلية ويحدّث الـ forecast + recommendation
  async syncProgress(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const goal = await prisma.revenueGoal.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!goal) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Revenue goal not found" } });
        return;
      }

      // جمع المعاملات الناجحة في فترة الهدف
      const txRows = await prisma.$queryRawUnsafe<TxSumRow[]>(
        `SELECT COALESCE(SUM(amount::numeric), 0)::float AS total
         FROM transactions
         WHERE merchant_id = $1
           AND status = 'SUCCESS'
           AND is_credit = TRUE
           AND created_at BETWEEN $2 AND $3`,
        req.merchant.id,
        new Date(goal.startDate).toISOString(),
        new Date(goal.endDate).toISOString()
      );

      const currentAmount = Number(txRows[0]?.total ?? 0);
      const targetAmount = Number(goal.targetAmount);

      await prisma.revenueGoal.update({
        where: { id: goal.id },
        data: { currentAmount },
      });

      const daysLeft = Math.max(0, Math.floor((new Date(goal.endDate).getTime() - Date.now()) / 86400000));
      const progress = targetAmount > 0 ? Math.min(100, Math.round((currentAmount / targetAmount) * 100)) : 0;

      const fc = calcForecast({
        currentAmount,
        targetAmount,
        startDate: new Date(goal.startDate),
        endDate: new Date(goal.endDate),
      });

      const rec = buildRecommendation({
        name: goal.name,
        currentAmount,
        targetAmount,
        progress,
        daysLeft,
        willAchieve: fc.willAchieve,
        gapAmount: fc.gapAmount,
        dailyRate: fc.dailyRate,
      });

      await Promise.all([
        prisma.$executeRawUnsafe(
          `INSERT INTO revenue_goal_forecasts
             (goal_id, merchant_id, daily_rate, projected_total, will_achieve, gap_amount, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (goal_id) DO UPDATE
             SET daily_rate = $3, projected_total = $4, will_achieve = $5, gap_amount = $6, confidence = $7, calculated_at = NOW()`,
          goal.id, req.merchant.id, fc.dailyRate, fc.projectedTotal, fc.willAchieve, fc.gapAmount, fc.confidence
        ),
        prisma.$executeRawUnsafe(
          `INSERT INTO revenue_goal_recommendations
             (goal_id, merchant_id, type, title, description, priority)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (goal_id) DO UPDATE
             SET type = $3, title = $4, description = $5, priority = $6, created_at = NOW()`,
          goal.id, req.merchant.id, rec.type, rec.title, rec.description, rec.priority
        ),
      ]);

      res.json({
        success: true,
        data: {
          goalId: goal.id,
          currentAmount,
          targetAmount,
          progress,
          daysLeft,
          forecast: fc,
          recommendation: rec,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Get Forecast (Elite) ────────────────────────
  async getForecast(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const goal = await prisma.revenueGoal.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!goal) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Revenue goal not found" } });
        return;
      }

      const rows = await prisma.$queryRawUnsafe<ForecastRow[]>(
        `SELECT daily_rate, projected_total, will_achieve, gap_amount, confidence, calculated_at
         FROM revenue_goal_forecasts WHERE goal_id = $1`,
        goal.id
      );

      if (rows.length === 0) {
        // احسب لحظياً
        const fc = calcForecast({
          currentAmount: Number(goal.currentAmount),
          targetAmount: Number(goal.targetAmount),
          startDate: new Date(goal.startDate),
          endDate: new Date(goal.endDate),
        });
        return res.json({ success: true, data: fc });
      }

      const r: ForecastRow = rows[0];
      res.json({
        success: true,
        data: {
          dailyRate: Number(r.daily_rate),
          projectedTotal: Number(r.projected_total),
          willAchieve: r.will_achieve,
          gapAmount: Number(r.gap_amount),
          confidence: Number(r.confidence),
          calculatedAt: r.calculated_at,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── All Goals Sync (Elite) ──────────────────────
  // يحدّث كل الأهداف النشطة دفعة واحدة
  async syncAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;

      const goals = await prisma.revenueGoal.findMany({
        where: {
          merchantId,
          endDate: { gte: new Date() },
        },
      });

      const results = [];

      for (const goal of goals) {
        const txRows = await prisma.$queryRawUnsafe<TxSumRow[]>(
          `SELECT COALESCE(SUM(amount::numeric), 0)::float AS total
           FROM transactions
           WHERE merchant_id = $1 AND status = 'SUCCESS' AND is_credit = TRUE
             AND created_at BETWEEN $2 AND $3`,
          merchantId,
          new Date(goal.startDate).toISOString(),
          new Date(goal.endDate).toISOString()
        );

        const currentAmount = Number(txRows[0]?.total ?? 0);
        const targetAmount = Number(goal.targetAmount);
        const daysLeft = Math.max(0, Math.floor((new Date(goal.endDate).getTime() - Date.now()) / 86400000));
        const progress = targetAmount > 0 ? Math.min(100, Math.round((currentAmount / targetAmount) * 100)) : 0;

        await prisma.revenueGoal.update({ where: { id: goal.id }, data: { currentAmount } });

        const fc = calcForecast({
          currentAmount,
          targetAmount,
          startDate: new Date(goal.startDate),
          endDate: new Date(goal.endDate),
        });

        const rec = buildRecommendation({
          name: goal.name,
          currentAmount,
          targetAmount,
          progress,
          daysLeft,
          willAchieve: fc.willAchieve,
          gapAmount: fc.gapAmount,
          dailyRate: fc.dailyRate,
        });

        await Promise.all([
          prisma.$executeRawUnsafe(
            `INSERT INTO revenue_goal_forecasts
               (goal_id, merchant_id, daily_rate, projected_total, will_achieve, gap_amount, confidence)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (goal_id) DO UPDATE
               SET daily_rate = $3, projected_total = $4, will_achieve = $5, gap_amount = $6, confidence = $7, calculated_at = NOW()`,
            goal.id, merchantId, fc.dailyRate, fc.projectedTotal, fc.willAchieve, fc.gapAmount, fc.confidence
          ),
          prisma.$executeRawUnsafe(
            `INSERT INTO revenue_goal_recommendations
               (goal_id, merchant_id, type, title, description, priority)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (goal_id) DO UPDATE
               SET type = $3, title = $4, description = $5, priority = $6, created_at = NOW()`,
            goal.id, merchantId, rec.type, rec.title, rec.description, rec.priority
          ),
        ]);

        results.push({ goalId: goal.id, name: goal.name, currentAmount, progress, willAchieve: fc.willAchieve });
      }

      res.json({ success: true, data: { synced: results.length, goals: results } });
    } catch (err) {
      next(err);
    }
  },
};
