// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Subscriptions Controller (Elite)
// Smart Retry + Dunning + Churn Prediction
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../lib/prisma";
import { parsePagination, buildMeta } from "../utils/pagination";

// ─── Helpers ─────────────────────────────────────────────────

function calcChurnScore(sub: {
  status: string;
  currentPeriodEnd: Date;
  createdAt: Date;
  failedRetries?: number;
  dunningStep?: number;
}): { score: number; level: string; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  // فشل الدفع الحالي
  if (sub.status === "PAST_DUE") {
    score += 40;
    factors.push("payment_failed");
  }

  // قرب انتهاء الفترة بدون تجديد
  const daysToEnd = Math.max(
    0,
    Math.floor(
      (new Date(sub.currentPeriodEnd).getTime() - Date.now()) / 86400000
    )
  );
  if (daysToEnd <= 3) {
    score += 20;
    factors.push("expiring_soon");
  }

  // محاولات retry فاشلة
  const retries = sub.failedRetries ?? 0;
  if (retries >= 2) {
    score += 25;
    factors.push("multiple_retry_failures");
  } else if (retries === 1) {
    score += 10;
    factors.push("one_retry_failure");
  }

  // dunning متقدم
  const step = sub.dunningStep ?? 0;
  if (step >= 3) {
    score += 15;
    factors.push("final_dunning_notice");
  } else if (step >= 2) {
    score += 8;
    factors.push("second_dunning_notice");
  }

  // عمر الاشتراك (جديد = أعلى خطر)
  const ageDays = Math.floor(
    (Date.now() - new Date(sub.createdAt).getTime()) / 86400000
  );
  if (ageDays < 30) {
    score += 10;
    factors.push("new_subscription");
  }

  score = Math.min(100, score);
  let level = "LOW";
  if (score >= 70) level = "CRITICAL";
  else if (score >= 50) level = "HIGH";
  else if (score >= 30) level = "MEDIUM";

  return { score, level, factors };
}

// حساب تواريخ Smart Retry (1 يوم، 3 أيام، 7 أيام)
function buildRetrySchedule(failedAt: Date): Date[] {
  return [1, 3, 7].map((days) => {
    const d = new Date(failedAt);
    d.setDate(d.getDate() + days);
    return d;
  });
}

// ─── Controller ──────────────────────────────────────────────

export const subscriptionsController = {
  // ─── List ────────────────────────────────────────
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(
        req.query.page as string,
        req.query.limit as string
      );
      const merchantId = req.merchant.id;

      const [rows, total] = await Promise.all([
        prisma.subscription.findMany({
          where: { merchantId },
          orderBy: { createdAt: "desc" },
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
        }),
        prisma.subscription.count({ where: { merchantId } }),
      ]);

      // جلب churn scores مع كل اشتراك
      const subIds = rows.map((r) => r.id);
      const churnRows =
        subIds.length > 0
          ? await prisma.$queryRawUnsafe<
              {
                subscription_id: string;
                churn_score: number;
                risk_level: string;
                factors: unknown;
              }[]
            >(
              `SELECT subscription_id, churn_score, risk_level, factors
               FROM subscription_churn_scores
               WHERE subscription_id = ANY($1::text[])`,
              subIds
            )
          : [];

      const churnMap = new Map(
        churnRows.map((c) => [c.subscription_id, c])
      );

      const data = rows.map((s) => {
        const ch = churnMap.get(s.id);
        return {
          ...s,
          amount: Number(s.amount),
          churnScore: ch ? Number(ch.churn_score) : 0,
          churnRisk: ch?.risk_level ?? "LOW",
          churnFactors: ch?.factors ?? [],
        };
      });

      res.json({
        success: true,
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Create ──────────────────────────────────────
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        planName,
        amount,
        currency,
        interval,
        currentPeriodStart,
        currentPeriodEnd,
      } = req.body as {
        planName: string;
        amount: number;
        currency: string;
        interval: string;
        currentPeriodStart: string;
        currentPeriodEnd: string;
      };

      if (
        !planName ||
        amount === undefined ||
        !currency ||
        !interval ||
        !currentPeriodStart ||
        !currentPeriodEnd
      ) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "planName, amount, currency, interval, currentPeriodStart, currentPeriodEnd are required",
          },
        });
        return;
      }

      const intervalUp = interval.toUpperCase();
      if (!["MONTHLY", "YEARLY"].includes(intervalUp)) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "interval must be MONTHLY or YEARLY",
          },
        });
        return;
      }

      const sub = await prisma.subscription.create({
        data: {
          merchantId: req.merchant.id,
          planName,
          amount,
          currency,
          interval: intervalUp as "MONTHLY" | "YEARLY",
          status: "ACTIVE",
          currentPeriodStart: new Date(currentPeriodStart),
          currentPeriodEnd: new Date(currentPeriodEnd),
        },
      });

      // حساب churn score أولي
      const { score, level, factors } = calcChurnScore({
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd,
        createdAt: sub.createdAt,
        failedRetries: 0,
        dunningStep: 0,
      });

      await prisma.$executeRawUnsafe(
        `INSERT INTO subscription_churn_scores (subscription_id, merchant_id, churn_score, risk_level, factors)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (subscription_id) DO UPDATE
           SET churn_score = $3, risk_level = $4, factors = $5::jsonb, calculated_at = NOW()`,
        sub.id,
        req.merchant.id,
        score,
        level,
        JSON.stringify(factors)
      );

      res.status(201).json({
        success: true,
        data: { ...sub, amount: Number(sub.amount), churnScore: score, churnRisk: level },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Update ──────────────────────────────────────
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.subscription.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!existing) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Subscription not found" },
        });
        return;
      }

      const updated = await prisma.subscription.update({
        where: { id: req.params.id },
        data: req.body,
      });

      res.json({ success: true, data: { ...updated, amount: Number(updated.amount) } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Cancel ──────────────────────────────────────
  async cancel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.subscription.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!existing) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Subscription not found" },
        });
        return;
      }

      const updated = await prisma.subscription.update({
        where: { id: req.params.id },
        data: { status: "CANCELLED" },
      });

      // تحديث churn score عند الإلغاء الفعلي
      await prisma.$executeRawUnsafe(
        `INSERT INTO subscription_churn_scores (subscription_id, merchant_id, churn_score, risk_level, factors)
         VALUES ($1, $2, 100, 'CRITICAL', '["cancelled"]'::jsonb)
         ON CONFLICT (subscription_id) DO UPDATE
           SET churn_score = 100, risk_level = 'CRITICAL', factors = '["cancelled"]'::jsonb, calculated_at = NOW()`,
        req.params.id,
        req.merchant.id
      );

      res.json({ success: true, data: { ...updated, amount: Number(updated.amount) } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Smart Retry (Elite) ─────────────────────────
  async triggerSmartRetry(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const sub = await prisma.subscription.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!sub) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Subscription not found" },
        });
        return;
      }

      // إلغاء أي retry قديم pending
      await prisma.$executeRawUnsafe(
        `UPDATE subscription_retry_attempts
         SET status = 'EXHAUSTED'
         WHERE subscription_id = $1 AND status = 'PENDING'`,
        sub.id
      );

      // إنشاء جدول retry جديد
      const schedule = buildRetrySchedule(new Date());
      for (let i = 0; i < schedule.length; i++) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO subscription_retry_attempts
             (subscription_id, merchant_id, attempt_number, status, scheduled_at)
           VALUES ($1, $2, $3, 'PENDING', $4)`,
          sub.id,
          req.merchant.id,
          i + 1,
          schedule[i].toISOString()
        );
      }

      // تحديث status للـ PAST_DUE
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "PAST_DUE" },
      });

      // تحديث churn score
      const { score, level, factors } = calcChurnScore({
        status: "PAST_DUE",
        currentPeriodEnd: sub.currentPeriodEnd,
        createdAt: sub.createdAt,
        failedRetries: 1,
        dunningStep: 0,
      });
      await prisma.$executeRawUnsafe(
        `INSERT INTO subscription_churn_scores (subscription_id, merchant_id, churn_score, risk_level, factors)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (subscription_id) DO UPDATE
           SET churn_score = $3, risk_level = $4, factors = $5::jsonb, calculated_at = NOW()`,
        sub.id,
        req.merchant.id,
        score,
        level,
        JSON.stringify(factors)
      );

      const retries = await prisma.$queryRawUnsafe<
        { attempt_number: number; status: string; scheduled_at: string }[]
      >(
        `SELECT attempt_number, status, scheduled_at
         FROM subscription_retry_attempts
         WHERE subscription_id = $1
         ORDER BY attempt_number`,
        sub.id
      );

      res.json({
        success: true,
        data: {
          subscriptionId: sub.id,
          retrySchedule: retries.map((r) => ({
            attempt: Number(r.attempt_number),
            status: r.status,
            scheduledAt: r.scheduled_at,
          })),
          churnScore: score,
          churnRisk: level,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Get Retry Status (Elite) ────────────────────
  async getRetryStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const sub = await prisma.subscription.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!sub) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Subscription not found" },
        });
        return;
      }

      const retries = await prisma.$queryRawUnsafe<
        {
          id: string;
          attempt_number: number;
          status: string;
          scheduled_at: string;
          executed_at: string | null;
          error_message: string | null;
        }[]
      >(
        `SELECT id, attempt_number, status, scheduled_at, executed_at, error_message
         FROM subscription_retry_attempts
         WHERE subscription_id = $1
         ORDER BY attempt_number`,
        sub.id
      );

      res.json({
        success: true,
        data: retries.map((r) => ({
          id: r.id,
          attempt: Number(r.attempt_number),
          status: r.status,
          scheduledAt: r.scheduled_at,
          executedAt: r.executed_at,
          errorMessage: r.error_message,
        })),
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Send Dunning Notice (Elite) ─────────────────
  async sendDunningNotice(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const sub = await prisma.subscription.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!sub) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Subscription not found" },
        });
        return;
      }

      const { step = 1, channel = "PUSH" } = req.body as {
        step?: number;
        channel?: string;
      };

      const messages: Record<number, string> = {
        1: `تذكير: دفعة اشتراك "${sub.planName}" مستحقة`,
        2: `تحذير: اشتراكك "${sub.planName}" سيتوقف خلال 48 ساعة`,
        3: `إشعار أخير: سيتم إلغاء "${sub.planName}" اليوم`,
      };

      const message = messages[step] ?? messages[1];

      await prisma.$executeRawUnsafe(
        `INSERT INTO subscription_dunning_logs
           (subscription_id, merchant_id, step, channel, message)
         VALUES ($1, $2, $3, $4, $5)`,
        sub.id,
        req.merchant.id,
        step,
        channel,
        message
      );

      // إذا خطوة 3 → تحديث churn
      if (step >= 3) {
        const { score, level, factors } = calcChurnScore({
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd,
          createdAt: sub.createdAt,
          failedRetries: 2,
          dunningStep: step,
        });
        await prisma.$executeRawUnsafe(
          `INSERT INTO subscription_churn_scores (subscription_id, merchant_id, churn_score, risk_level, factors)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (subscription_id) DO UPDATE
             SET churn_score = $3, risk_level = $4, factors = $5::jsonb, calculated_at = NOW()`,
          sub.id,
          req.merchant.id,
          score,
          level,
          JSON.stringify(factors)
        );
      }

      res.json({
        success: true,
        data: {
          subscriptionId: sub.id,
          step,
          channel,
          message,
          sentAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Get Dunning History (Elite) ─────────────────
  async getDunningHistory(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const sub = await prisma.subscription.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!sub) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Subscription not found" },
        });
        return;
      }

      const logs = await prisma.$queryRawUnsafe<
        {
          id: string;
          step: number;
          channel: string;
          message: string;
          sent_at: string;
          opened: boolean;
        }[]
      >(
        `SELECT id, step, channel, message, sent_at, opened
         FROM subscription_dunning_logs
         WHERE subscription_id = $1
         ORDER BY sent_at DESC`,
        sub.id
      );

      res.json({
        success: true,
        data: logs.map((l) => ({
          id: l.id,
          step: Number(l.step),
          channel: l.channel,
          message: l.message,
          sentAt: l.sent_at,
          opened: l.opened,
        })),
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Get Churn Score (Elite) ─────────────────────
  async getChurnScore(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const sub = await prisma.subscription.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!sub) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Subscription not found" },
        });
        return;
      }

      const rows = await prisma.$queryRawUnsafe<
        {
          churn_score: number;
          risk_level: string;
          factors: unknown;
          calculated_at: string;
        }[]
      >(
        `SELECT churn_score, risk_level, factors, calculated_at
         FROM subscription_churn_scores
         WHERE subscription_id = $1`,
        sub.id
      );

      let churnData;
      if (rows.length > 0) {
        const r = rows[0];
        churnData = {
          score: Number(r.churn_score),
          riskLevel: r.risk_level,
          factors: r.factors,
          calculatedAt: r.calculated_at,
        };
      } else {
        // احسب لأول مرة
        const { score, level, factors } = calcChurnScore({
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd,
          createdAt: sub.createdAt,
        });
        await prisma.$executeRawUnsafe(
          `INSERT INTO subscription_churn_scores (subscription_id, merchant_id, churn_score, risk_level, factors)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          sub.id,
          req.merchant.id,
          score,
          level,
          JSON.stringify(factors)
        );
        churnData = {
          score,
          riskLevel: level,
          factors,
          calculatedAt: new Date().toISOString(),
        };
      }

      res.json({ success: true, data: churnData });
    } catch (err) {
      next(err);
    }
  },

  // ─── Churn Overview — كل الاشتراكات عالية الخطر (Elite) ─
  async getChurnOverview(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const merchantId = req.merchant.id;

      const rows = await prisma.$queryRawUnsafe<
        {
          subscription_id: string;
          churn_score: number;
          risk_level: string;
          factors: unknown;
        }[]
      >(
        `SELECT cs.subscription_id, cs.churn_score, cs.risk_level, cs.factors
         FROM subscription_churn_scores cs
         WHERE cs.merchant_id = $1
         ORDER BY cs.churn_score DESC`,
        merchantId
      );

      const summary = {
        critical: rows.filter((r) => r.risk_level === "CRITICAL").length,
        high: rows.filter((r) => r.risk_level === "HIGH").length,
        medium: rows.filter((r) => r.risk_level === "MEDIUM").length,
        low: rows.filter((r) => r.risk_level === "LOW").length,
        avgScore:
          rows.length > 0
            ? Math.round(
                rows.reduce((s, r) => s + Number(r.churn_score), 0) / rows.length
              )
            : 0,
      };

      res.json({
        success: true,
        data: {
          summary,
          atRisk: rows
            .filter((r) => r.risk_level !== "LOW")
            .map((r) => ({
              subscriptionId: r.subscription_id,
              churnScore: Number(r.churn_score),
              riskLevel: r.risk_level,
              factors: r.factors,
            })),
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
