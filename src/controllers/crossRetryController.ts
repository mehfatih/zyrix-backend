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

    // Get routing config for maxRetries default
    const config = await prisma.gatewayRoutingConfig.findUnique({ where: { merchantId } });
    const resolvedMax = maxAttempts || config?.maxRetries || 3;

    const retry = await prisma.crossGatewayRetry.create({
      data: {
        merchantId,
        transactionId: transactionId || null,
        originalGatewayId,
        amount,
        currency,
        country,
        method: method || null,
        maxAttempts: resolvedMax,
        status: 'PENDING',
      },
    });

    // Find eligible fallback gateways (exclude original)
    const gateways = await prisma.paymentGateway.findMany({
      where: { merchantId, status: 'ACTIVE', id: { not: originalGatewayId } },
      include: { routingRules: { where: { isActive: true } } },
      orderBy: { successRate: 'desc' },
    });

    const eligible = gateways.filter((gw) => {
      const countryRules = gw.routingRules.filter(r => r.type === 'COUNTRY');
      const currencyRules = gw.routingRules.filter(r => r.type === 'CURRENCY');
      if (countryRules.length && !countryRules.some(r => r.value === country)) return false;
      if (currencyRules.length && !currencyRules.some(r => r.value === currency)) return false;
      return true;
    });

    res.status(201).json({
      success: true,
      data: {
        retry,
        eligibleGateways: eligible.map(g => ({ id: g.id, name: g.name, code: g.code, successRate: Number(g.successRate) })),
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
    const retry = await prisma.crossGatewayRetry.findFirst({ where: { id: retryId, merchantId } });
    if (!retry) {
      res.status(404).json({ success: false, error: 'Retry session not found' });
      return;
    }
    if (retry.status === 'SUCCEEDED' || retry.status === 'EXHAUSTED' || retry.status === 'CANCELLED') {
      res.status(400).json({ success: false, error: `Retry session is already ${retry.status}` });
      return;
    }

    const gateway = await prisma.paymentGateway.findFirst({ where: { id: gatewayId, merchantId } });
    if (!gateway) {
      res.status(404).json({ success: false, error: 'Gateway not found' });
      return;
    }

    const attemptNum = retry.attemptCount + 1;
    const attempt = await prisma.crossGatewayRetryAttempt.create({
      data: {
        retryId,
        gatewayId,
        gatewayName: gateway.name,
        gatewayCode: gateway.code,
        attemptNum,
        status,
        responseMs: responseMs || null,
        errorCode: errorCode || null,
        errorMessage: errorMessage || null,
      },
    });

    // Determine new retry status
    let newRetryStatus: 'PENDING' | 'SUCCEEDED' | 'EXHAUSTED' = 'PENDING';
    if (status === 'SUCCESS') {
      newRetryStatus = 'SUCCEEDED';
    } else if (attemptNum >= retry.maxAttempts) {
      newRetryStatus = 'EXHAUSTED';
    }

    const updatedRetry = await prisma.crossGatewayRetry.update({
      where: { id: retryId },
      data: {
        attemptCount: attemptNum,
        status: newRetryStatus,
        ...(status === 'SUCCESS' && { succeededGatewayId: gatewayId }),
        ...(newRetryStatus === 'EXHAUSTED' && { errorSummary: `Failed after ${attemptNum} attempts. Last error: ${errorMessage || errorCode || 'Unknown'}` }),
      },
      include: { attempts: { orderBy: { attemptNum: 'asc' } } },
    });

    res.status(201).json({ success: true, data: { attempt, retry: updatedRetry } });
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
  try {
    const where: any = { merchantId };
    if (status) where.status = status;

    const [retries, total] = await Promise.all([
      prisma.crossGatewayRetry.findMany({
        where,
        include: {
          attempts: { orderBy: { attemptNum: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.crossGatewayRetry.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        retries,
        pagination: { page: parseInt(page as string), limit: parseInt(limit as string), total, pages: Math.ceil(total / parseInt(limit as string)) },
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
    const retry = await prisma.crossGatewayRetry.findFirst({
      where: { id: retryId, merchantId },
      include: { attempts: { orderBy: { attemptNum: 'asc' } } },
    });
    if (!retry) {
      res.status(404).json({ success: false, error: 'Retry session not found' });
      return;
    }
    res.json({ success: true, data: { retry } });
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
    const retry = await prisma.crossGatewayRetry.findFirst({ where: { id: retryId, merchantId } });
    if (!retry) {
      res.status(404).json({ success: false, error: 'Retry session not found' });
      return;
    }
    if (retry.status !== 'PENDING') {
      res.status(400).json({ success: false, error: `Cannot cancel a ${retry.status} retry` });
      return;
    }
    const updated = await prisma.crossGatewayRetry.update({
      where: { id: retryId },
      data: { status: 'CANCELLED' },
    });
    res.json({ success: true, data: { retry: updated } });
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
  const since = new Date(Date.now() - days * 86400000);
  try {
    const retries = await prisma.crossGatewayRetry.findMany({
      where: { merchantId, createdAt: { gte: since } },
      include: { attempts: true },
    });

    const total = retries.length;
    const succeeded = retries.filter(r => r.status === 'SUCCEEDED').length;
    const exhausted = retries.filter(r => r.status === 'EXHAUSTED').length;
    const pending = retries.filter(r => r.status === 'PENDING').length;
    const cancelled = retries.filter(r => r.status === 'CANCELLED').length;
    const recoveryRate = total > 0 ? Math.round((succeeded / total) * 100) : 0;

    const avgAttempts = total > 0
      ? Math.round((retries.reduce((sum, r) => sum + r.attemptCount, 0) / total) * 10) / 10
      : 0;

    // Gateway success breakdown
    const gatewayBreakdown: Record<string, { name: string; attempts: number; successes: number }> = {};
    retries.forEach(r => {
      r.attempts.forEach(a => {
        if (!gatewayBreakdown[a.gatewayId]) {
          gatewayBreakdown[a.gatewayId] = { name: a.gatewayName, attempts: 0, successes: 0 };
        }
        gatewayBreakdown[a.gatewayId].attempts++;
        if (a.status === 'SUCCESS') gatewayBreakdown[a.gatewayId].successes++;
      });
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
      data: {
        period: `${days}d`,
        total,
        succeeded,
        exhausted,
        pending,
        cancelled,
        recoveryRate,
        avgAttempts,
        gatewayStats,
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    return;
  }
};
