import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';

// ─── POST /api/cross-retry/initiate ──────────────────────────
export const initiateRetry = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { transactionId, originalGatewayId, amount, currency, country, method, maxAttempts } = req.body;
  if (!originalGatewayId || !amount || !currency || !country) {
    res.status(400).json({ success: false, error: 'originalGatewayId, amount, currency, country are required' });
    return;
  }
  try {
    const gatewayExists = await prisma.paymentGateway.findFirst({ where: { id: originalGatewayId, merchantId } });
    if (!gatewayExists) {
      res.status(404).json({ success: false, error: 'Original gateway not found' });
      return;
    }

    const config = await prisma.gatewayRoutingConfig.findUnique({ where: { merchantId } });
    const resolvedMax = maxAttempts || config?.maxRetries || 3;
    const retryId = crypto.randomUUID();
    const now = new Date().toISOString();

    await prisma.$executeRawUnsafe(
      `INSERT INTO cross_gateway_retries (id, "merchantId", "transactionId", "originalGatewayId", amount, currency, country, method, status, "maxAttempts", "attemptCount", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,0,$10,$11)`,
      retryId, merchantId, transactionId || null, originalGatewayId,
      amount, currency, country, method || null, resolvedMax, now, now
    );

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM cross_gateway_retries WHERE id = $1`, retryId
    );
    const retry = rows[0];

    const gateways = await prisma.paymentGateway.findMany({
      where: { merchantId, status: 'ACTIVE', id: { not: originalGatewayId } },
      include: { routingRules: { where: { isActive: true } } },
      orderBy: { successRate: 'desc' },
    });

    const eligible = gateways.filter((gw) => {
      const countryRules = gw.routingRules.filter((r: any) => r.type === 'COUNTRY');
      const currencyRules = gw.routingRules.filter((r: any) => r.type === 'CURRENCY');
      if (countryRules.length && !countryRules.some((r: any) => r.value === country)) return false;
      if (currencyRules.length && !currencyRules.some((r: any) => r.value === currency)) return false;
      return true;
    });

    res.status(201).json({
      success: true,
      data: {
        retry,
        eligibleGateways: eligible.map((g: any) => ({ id: g.id, name: g.name, code: g.code, successRate: Number(g.successRate) })),
        message: `${eligible.length} gateway(s) available for retry`,
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to initiate retry' });
    return;
  }
};

// ─── POST /api/cross-retry/:retryId/attempt ──────────────────
export const recordAttempt = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { retryId } = req.params;
  const { gatewayId, status, responseMs, errorCode, errorMessage } = req.body;
  if (!gatewayId || !status) {
    res.status(400).json({ success: false, error: 'gatewayId and status are required' });
    return;
  }
  try {
    const retryRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM cross_gateway_retries WHERE id = $1 AND "merchantId" = $2`, retryId, merchantId
    );
    if (!retryRows.length) {
      res.status(404).json({ success: false, error: 'Retry session not found' });
      return;
    }
    const retry = retryRows[0];

    if (retry.status === 'SUCCEEDED' || retry.status === 'EXHAUSTED' || retry.status === 'CANCELLED') {
      res.status(400).json({ success: false, error: `Retry session is already ${retry.status}` });
      return;
    }

    const gateway = await prisma.paymentGateway.findFirst({ where: { id: gatewayId, merchantId } });
    if (!gateway) {
      res.status(404).json({ success: false, error: 'Gateway not found' });
      return;
    }

    const attemptNum = Number(retry.attemptCount) + 1;
    const attemptId = crypto.randomUUID();
    const now = new Date().toISOString();

    await prisma.$executeRawUnsafe(
      `INSERT INTO cross_gateway_retry_attempts (id, "retryId", "gatewayId", "gatewayName", "gatewayCode", "attemptNum", status, "responseMs", "errorCode", "errorMessage", "executedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      attemptId, retryId, gatewayId, gateway.name, gateway.code,
      attemptNum, status, responseMs || null, errorCode || null, errorMessage || null, now
    );

    const attemptRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM cross_gateway_retry_attempts WHERE id = $1`, attemptId
    );
    const attempt = attemptRows[0];

    let newRetryStatus = 'PENDING';
    if (status === 'SUCCESS') newRetryStatus = 'SUCCEEDED';
    else if (attemptNum >= Number(retry.maxAttempts)) newRetryStatus = 'EXHAUSTED';

    const errorSummary = newRetryStatus === 'EXHAUSTED'
      ? `Failed after ${attemptNum} attempts. Last error: ${errorMessage || errorCode || 'Unknown'}`
      : null;

    const succeededGatewayId = status === 'SUCCESS' ? gatewayId : null;

    await prisma.$executeRawUnsafe(
      `UPDATE cross_gateway_retries SET "attemptCount"=$1, status=$2, "succeededGatewayId"=COALESCE($3,"succeededGatewayId"), "errorSummary"=COALESCE($4,"errorSummary"), "updatedAt"=$5 WHERE id=$6`,
      attemptNum, newRetryStatus, succeededGatewayId, errorSummary, new Date().toISOString(), retryId
    );

    const updatedRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM cross_gateway_retries WHERE id = $1`, retryId
    );
    const updatedRetry = updatedRows[0];

    const allAttempts: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM cross_gateway_retry_attempts WHERE "retryId" = $1 ORDER BY "attemptNum" ASC`, retryId
    );

    res.status(201).json({ success: true, data: { attempt, retry: { ...updatedRetry, attempts: allAttempts } } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to record attempt' });
    return;
  }
};

// ─── GET /api/cross-retry ─────────────────────────────────────
export const listRetries = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { status, page = '1', limit = '20' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const take = parseInt(limit as string);
  try {
    let whereClause = `"merchantId" = $1`;
    const params: any[] = [merchantId];
    if (status) { params.push(status); whereClause += ` AND status = $${params.length}`; }

    const retries: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM cross_gateway_retries WHERE ${whereClause} ORDER BY "createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      ...params, take, skip
    );

    const countRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as total FROM cross_gateway_retries WHERE ${whereClause}`, ...params
    );
    const total = Number(countRows[0].total);

    const retriesWithAttempts = await Promise.all(
      retries.map(async (r: any) => {
        const attempts: any[] = await prisma.$queryRawUnsafe(
          `SELECT * FROM cross_gateway_retry_attempts WHERE "retryId" = $1 ORDER BY "attemptNum" ASC`, r.id
        );
        return { ...r, attempts };
      })
    );

    res.json({
      success: true,
      data: {
        retries: retriesWithAttempts,
        pagination: { page: parseInt(page as string), limit: take, total, pages: Math.ceil(total / take) },
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch retries' });
    return;
  }
};

// ─── GET /api/cross-retry/:retryId ───────────────────────────
export const getRetry = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { retryId } = req.params;
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM cross_gateway_retries WHERE id = $1 AND "merchantId" = $2`, retryId, merchantId
    );
    if (!rows.length) {
      res.status(404).json({ success: false, error: 'Retry session not found' });
      return;
    }
    const attempts: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM cross_gateway_retry_attempts WHERE "retryId" = $1 ORDER BY "attemptNum" ASC`, retryId
    );
    res.json({ success: true, data: { retry: { ...rows[0], attempts } } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch retry' });
    return;
  }
};

// ─── PATCH /api/cross-retry/:retryId/cancel ──────────────────
export const cancelRetry = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { retryId } = req.params;
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM cross_gateway_retries WHERE id = $1 AND "merchantId" = $2`, retryId, merchantId
    );
    if (!rows.length) {
      res.status(404).json({ success: false, error: 'Retry session not found' });
      return;
    }
    if (rows[0].status !== 'PENDING') {
      res.status(400).json({ success: false, error: `Cannot cancel a ${rows[0].status} retry` });
      return;
    }
    await prisma.$executeRawUnsafe(
      `UPDATE cross_gateway_retries SET status='CANCELLED', "updatedAt"=$1 WHERE id=$2`,
      new Date().toISOString(), retryId
    );
    const updated: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM cross_gateway_retries WHERE id = $1`, retryId
    );
    res.json({ success: true, data: { retry: updated[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to cancel retry' });
    return;
  }
};

// ─── GET /api/cross-retry/stats ───────────────────────────────
export const getStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const days = parseInt(req.query.days as string) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  try {
    const retries: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM cross_gateway_retries WHERE "merchantId" = $1 AND "createdAt" >= $2`, merchantId, since
    );

    const total = retries.length;
    const succeeded = retries.filter((r: any) => r.status === 'SUCCEEDED').length;
    const exhausted = retries.filter((r: any) => r.status === 'EXHAUSTED').length;
    const pending   = retries.filter((r: any) => r.status === 'PENDING').length;
    const cancelled = retries.filter((r: any) => r.status === 'CANCELLED').length;
    const recoveryRate = total > 0 ? Math.round((succeeded / total) * 100) : 0;
    const avgAttempts  = total > 0
      ? Math.round((retries.reduce((sum: number, r: any) => sum + Number(r.attemptCount), 0) / total) * 10) / 10
      : 0;

    const retryIds = retries.map((r: any) => r.id);
    let allAttempts: any[] = [];
    if (retryIds.length) {
      allAttempts = await prisma.$queryRawUnsafe(
        `SELECT * FROM cross_gateway_retry_attempts WHERE "retryId" = ANY($1::text[])`, retryIds
      );
    }

    const gatewayBreakdown: Record<string, { name: string; attempts: number; successes: number }> = {};
    allAttempts.forEach((a: any) => {
      if (!gatewayBreakdown[a.gatewayId]) gatewayBreakdown[a.gatewayId] = { name: a.gatewayName, attempts: 0, successes: 0 };
      gatewayBreakdown[a.gatewayId].attempts++;
      if (a.status === 'SUCCESS') gatewayBreakdown[a.gatewayId].successes++;
    });

    const gatewayStats = Object.entries(gatewayBreakdown).map(([id, data]) => ({
      gatewayId: id,
      gatewayName: data.name,
      attempts: data.attempts,
      successes: data.successes,
      successRate: data.attempts > 0 ? Math.round((data.successes / data.attempts) * 100) : 0,
    })).sort((a, b) => b.successRate - a.successRate);

    res.json({
      success: true,
      data: { period: `${days}d`, total, succeeded, exhausted, pending, cancelled, recoveryRate, avgAttempts, gatewayStats },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    return;
  }
};
