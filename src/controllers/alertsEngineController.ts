import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

export const listRules = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rules = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM alert_rules WHERE "merchantId" = $1 ORDER BY "createdAt" DESC`, merchantId
    );
    res.json({ success: true, data: { rules } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to list rules" });
    return;
  }
};

export const createRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, metric, operator, threshold, windowMinutes = 60, channel = "push" } = req.body as {
      name: string; metric: string; operator: string; threshold: number; windowMinutes?: number; channel?: string;
    };
    if (!name || !metric || !operator || threshold === undefined) {
      res.status(400).json({ success: false, error: "name, metric, operator, threshold required" }); return;
    }
    const id = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO alert_rules (id, "merchantId", name, metric, operator, threshold, "windowMinutes", channel) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      id, merchantId, name, metric, operator, threshold, windowMinutes, channel
    );
    res.json({ success: true, data: { rule: { id, name, metric, operator, threshold, windowMinutes, channel, isActive: true } } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create rule" });
    return;
  }
};

export const updateRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { name, threshold, windowMinutes, channel, isActive } = req.body;
    await prisma.$executeRawUnsafe(
      `UPDATE alert_rules SET name = COALESCE($1, name), threshold = COALESCE($2, threshold), "windowMinutes" = COALESCE($3, "windowMinutes"), channel = COALESCE($4, channel), "isActive" = COALESCE($5, "isActive"), "updatedAt" = NOW() WHERE id = $6 AND "merchantId" = $7`,
      name ?? null, threshold ?? null, windowMinutes ?? null, channel ?? null, isActive ?? null, id, merchantId
    );
    res.json({ success: true, data: { updated: true } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update rule" });
    return;
  }
};

export const deleteRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$executeRawUnsafe(
      `DELETE FROM alert_rules WHERE id = $1 AND "merchantId" = $2`, id, merchantId
    );
    res.json({ success: true, data: { deleted: true } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete rule" });
    return;
  }
};

export const checkAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;

    const rules = await prisma.$queryRawUnsafe<Array<{
      id: string; name: string; metric: string; operator: string;
      threshold: number; windowMinutes: number;
    }>>(
      `SELECT * FROM alert_rules WHERE "merchantId" = $1 AND "isActive" = true`, merchantId
    );

    const triggered: { ruleId: string; ruleName: string; metric: string; value: number; threshold: number; message: string }[] = [];

    for (const rule of rules) {
      const windowStart = new Date(Date.now() - rule.windowMinutes * 60 * 1000);
      let currentValue = 0;

      if (rule.metric === "success_rate") {
        const [total, success] = await Promise.all([
          prisma.transaction.count({ where: { merchantId, createdAt: { gte: windowStart } } }),
          prisma.transaction.count({ where: { merchantId, status: "SUCCESS", createdAt: { gte: windowStart } } }),
        ]);
        currentValue = total > 0 ? (success / total) * 100 : 100;
      } else if (rule.metric === "transaction_count") {
        currentValue = await prisma.transaction.count({ where: { merchantId, createdAt: { gte: windowStart } } });
      } else if (rule.metric === "revenue") {
        const agg = await prisma.transaction.aggregate({ where: { merchantId, status: "SUCCESS", createdAt: { gte: windowStart } }, _sum: { amount: true } });
        currentValue = Number(agg._sum.amount ?? 0);
      } else if (rule.metric === "failed_count") {
        currentValue = await prisma.transaction.count({ where: { merchantId, status: "FAILED", createdAt: { gte: windowStart } } });
      } else if (rule.metric === "pending_count") {
        currentValue = await prisma.transaction.count({ where: { merchantId, status: "PENDING" } });
      }

      const threshold = Number(rule.threshold);
      let shouldTrigger = false;
      if (rule.operator === "gt"  && currentValue >  threshold) shouldTrigger = true;
      if (rule.operator === "lt"  && currentValue <  threshold) shouldTrigger = true;
      if (rule.operator === "gte" && currentValue >= threshold) shouldTrigger = true;
      if (rule.operator === "lte" && currentValue <= threshold) shouldTrigger = true;

      if (shouldTrigger) {
        const message = `${rule.name}: القيمة الحالية ${Math.round(currentValue * 10) / 10} ${getOperatorLabel(rule.operator)} الحد ${threshold}`;
        const eventId = crypto.randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO alert_events (id, "merchantId", "ruleId", metric, "triggerValue", threshold, message) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          eventId, merchantId, rule.id, rule.metric, currentValue, threshold, message
        );
        await prisma.$executeRawUnsafe(
          `UPDATE alert_rules SET "lastTriggered" = NOW(), "triggerCount" = "triggerCount" + 1 WHERE id = $1`, rule.id
        );
        triggered.push({ ruleId: rule.id, ruleName: rule.name, metric: rule.metric, value: Math.round(currentValue * 10) / 10, threshold, message });
      }
    }

    res.json({ success: true, data: { checked: rules.length, triggered: triggered.length, alerts: triggered } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to check alerts" });
    return;
  }
};

export const listEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { unreadOnly = "false", limit = "20" } = req.query as Record<string, string>;
    const whereClause = unreadOnly === "true"
      ? `WHERE "merchantId" = $1 AND "isRead" = false`
      : `WHERE "merchantId" = $1`;
    const events = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM alert_events ${whereClause} ORDER BY "createdAt" DESC LIMIT $2`,
      merchantId, Number(limit)
    );
    const unreadCount = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
      `SELECT COUNT(*) as cnt FROM alert_events WHERE "merchantId" = $1 AND "isRead" = false`, merchantId
    );
    res.json({ success: true, data: { events, unreadCount: Number(unreadCount[0]?.cnt ?? 0) } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to list events" });
    return;
  }
};

export const markEventRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$executeRawUnsafe(
      `UPDATE alert_events SET "isRead" = true WHERE id = $1 AND "merchantId" = $2`, id, merchantId
    );
    res.json({ success: true, data: { updated: true } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to mark event" });
    return;
  }
};

export const markAllEventsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    await prisma.$executeRawUnsafe(
      `UPDATE alert_events SET "isRead" = true WHERE "merchantId" = $1`, merchantId
    );
    res.json({ success: true, data: { updated: true } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to mark all events" });
    return;
  }
};

function getOperatorLabel(op: string): string {
  const m: Record<string, string> = { gt: "أكبر من", lt: "أصغر من", gte: "أكبر من أو يساوي", lte: "أصغر من أو يساوي" };
  return m[op] ?? op;
}
