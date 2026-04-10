import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';

// ─── GET /api/approval/config ─────────────────────────────────
export const getConfig = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  try {
    let rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM approval_configs WHERE "merchantId"=$1`, merchantId
    );
    if (!rows.length) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await prisma.$executeRawUnsafe(
        `INSERT INTO approval_configs (id,"merchantId","smart3dsEnabled","exemptionThreshold","frictionlessCountries","challengeCountries","autoRoutingEnabled","retryOnSoftDecline","softDeclineCodes","createdAt","updatedAt")
         VALUES ($1,$2,true,100,'{}','{}',true,true,'{}','$3',$4)
         ON CONFLICT ("merchantId") DO NOTHING`,
        id, merchantId, now, now
      );
      rows = await prisma.$queryRawUnsafe(`SELECT * FROM approval_configs WHERE "merchantId"=$1`, merchantId);
    }
    res.json({ success: true, data: { config: rows[0] || null } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch config' });
    return;
  }
};

// ─── PATCH /api/approval/config ───────────────────────────────
export const updateConfig = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { smart3dsEnabled, exemptionThreshold, frictionlessCountries, challengeCountries, autoRoutingEnabled, retryOnSoftDecline, softDeclineCodes } = req.body;
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `INSERT INTO approval_configs (id,"merchantId","smart3dsEnabled","exemptionThreshold","frictionlessCountries","challengeCountries","autoRoutingEnabled","retryOnSoftDecline","softDeclineCodes","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT ("merchantId") DO UPDATE SET
         "smart3dsEnabled"=COALESCE($3,"smart3dsEnabled"),
         "exemptionThreshold"=COALESCE($4,"exemptionThreshold"),
         "frictionlessCountries"=COALESCE($5,"frictionlessCountries"),
         "challengeCountries"=COALESCE($6,"challengeCountries"),
         "autoRoutingEnabled"=COALESCE($7,"autoRoutingEnabled"),
         "retryOnSoftDecline"=COALESCE($8,"retryOnSoftDecline"),
         "softDeclineCodes"=COALESCE($9,"softDeclineCodes"),
         "updatedAt"=$11`,
      id, merchantId,
      smart3dsEnabled !== undefined ? smart3dsEnabled : null,
      exemptionThreshold !== undefined ? exemptionThreshold : null,
      frictionlessCountries !== undefined ? frictionlessCountries : null,
      challengeCountries !== undefined ? challengeCountries : null,
      autoRoutingEnabled !== undefined ? autoRoutingEnabled : null,
      retryOnSoftDecline !== undefined ? retryOnSoftDecline : null,
      softDeclineCodes !== undefined ? softDeclineCodes : null,
      now, now
    );
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM approval_configs WHERE "merchantId"=$1`, merchantId);
    res.json({ success: true, data: { config: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update config' });
    return;
  }
};

// ─── POST /api/approval/analyze ───────────────────────────────
// الـ core engine — يقرر هل نفعّل 3DS، exemption، أو routing بديل
export const analyzeApproval = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { transactionId, amount, currency, country, gatewayCode, cardBrand, cardType, isReturningCustomer } = req.body;
  if (!amount || !currency) {
    res.status(400).json({ success: false, error: 'amount and currency are required' });
    return;
  }
  try {
    const configRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM approval_configs WHERE "merchantId"=$1`, merchantId
    );
    const config = configRows[0] || {};
    const numAmount = Number(amount);

    // Smart 3DS decision
    let threeDsDecision: 'FRICTIONLESS' | 'CHALLENGE' | 'EXEMPTION' | 'SKIP' = 'FRICTIONLESS';
    let approvalRoute = 'DIRECT';
    const recommendations: string[] = [];

    if (config.smart3dsEnabled) {
      const frictionless: string[] = config.frictionlessCountries || [];
      const challenge: string[]    = config.challengeCountries || [];
      const exemptThreshold = Number(config.exemptionThreshold || 100);

      if (numAmount <= exemptThreshold) {
        threeDsDecision = 'EXEMPTION';
        recommendations.push(`Amount ${numAmount} ≤ ${exemptThreshold} — TRA exemption eligible`);
      } else if (country && challenge.includes(country)) {
        threeDsDecision = 'CHALLENGE';
        recommendations.push(`Country ${country} is in challenge list — require 3DS challenge`);
      } else if (country && frictionless.includes(country)) {
        threeDsDecision = 'FRICTIONLESS';
        recommendations.push(`Country ${country} is in frictionless list — skip challenge`);
      } else if (numAmount > 5000) {
        threeDsDecision = 'CHALLENGE';
        recommendations.push(`High amount ${numAmount} — require 3DS challenge`);
      }
    } else {
      threeDsDecision = 'SKIP';
    }

    // Gateway routing recommendation
    let recommendedGateway: string | null = null;
    if (config.autoRoutingEnabled && country) {
      const countryGwMap: Record<string, string> = {
        SA: 'tap', AE: 'stripe', TR: 'iyzico', KW: 'tap', QA: 'tap', EG: 'stripe', IQ: 'stripe',
      };
      const gwCode = countryGwMap[country];
      if (gwCode && gwCode !== gatewayCode) {
        recommendedGateway = gwCode;
        recommendations.push(`Country ${country} routes better via ${gwCode}`);
        approvalRoute = 'REROUTED';
      }
    }

    // Soft decline retry
    let softDeclineRetryable = false;
    const softCodes: string[] = config.softDeclineCodes || ['INSUFFICIENT_FUNDS', 'DO_NOT_HONOR', 'TRY_AGAIN'];
    if (config.retryOnSoftDecline) {
      softDeclineRetryable = true;
      recommendations.push(`Soft declines on [${softCodes.slice(0,2).join(', ')}] will auto-retry`);
    }

    // سجّل الحدث
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `INSERT INTO approval_events (id,"merchantId","transactionId","gatewayCode",country,currency,amount,"originalStatus","finalStatus","threeDsUsed","threeDsResult","approvalRoute","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING','PENDING',$8,$9,$10,$11)`,
      id, merchantId, transactionId || null, gatewayCode || null,
      country || null, currency, numAmount,
      threeDsDecision !== 'SKIP',
      threeDsDecision,
      approvalRoute, now
    );

    res.json({
      success: true,
      data: {
        eventId: id,
        threeDsDecision,
        recommendedGateway,
        softDeclineRetryable,
        softDeclineCodes: softCodes,
        approvalRoute,
        recommendations,
        summary: `3DS: ${threeDsDecision} | Route: ${approvalRoute} | Retry: ${softDeclineRetryable}`,
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Approval analysis failed' });
    return;
  }
};

// ─── PATCH /api/approval/events/:id ──────────────────────────
// تحديث نتيجة المعاملة بعد المعالجة
export const updateEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  const { finalStatus, declineCode, declineReason, retryCount } = req.body;
  try {
    const existing: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM approval_events WHERE id=$1 AND "merchantId"=$2`, id, merchantId
    );
    if (!existing.length) { res.status(404).json({ success: false, error: 'Event not found' }); return; }
    await prisma.$executeRawUnsafe(
      `UPDATE approval_events SET "finalStatus"=COALESCE($1,"finalStatus"),"declineCode"=COALESCE($2,"declineCode"),"declineReason"=COALESCE($3,"declineReason"),"retryCount"=COALESCE($4,"retryCount") WHERE id=$5`,
      finalStatus || null, declineCode || null, declineReason || null, retryCount || null, id
    );
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM approval_events WHERE id=$1`, id);
    res.json({ success: true, data: { event: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update event' });
    return;
  }
};

// ─── GET /api/approval/stats ──────────────────────────────────
export const getStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const days = parseInt(req.query.days as string) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  try {
    const events: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM approval_events WHERE "merchantId"=$1 AND "createdAt">=$2`, merchantId, since
    );
    const total       = events.length;
    const approved    = events.filter(e => e.finalStatus === 'SUCCESS').length;
    const declined    = events.filter(e => e.finalStatus === 'FAILED').length;
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    const threeDsUsed = events.filter(e => e.threeDsUsed).length;
    const rerouted    = events.filter(e => e.approvalRoute === 'REROUTED').length;
    const retried     = events.filter(e => Number(e.retryCount) > 0).length;
    const retrySuccess = events.filter(e => Number(e.retryCount) > 0 && e.finalStatus === 'SUCCESS').length;
    const retryRate    = retried > 0 ? Math.round((retrySuccess / retried) * 100) : 0;
    const declineBreakdown: Record<string, number> = {};
    events.filter(e => e.declineCode).forEach(e => {
      declineBreakdown[e.declineCode] = (declineBreakdown[e.declineCode] || 0) + 1;
    });
    const threeDsBreakdown: Record<string, number> = {};
    events.filter(e => e.threeDsResult).forEach(e => {
      threeDsBreakdown[e.threeDsResult] = (threeDsBreakdown[e.threeDsResult] || 0) + 1;
    });
    res.json({
      success: true,
      data: {
        period: `${days}d`, total, approved, declined, approvalRate,
        threeDsUsed, rerouted, retried, retrySuccess, retryRate,
        declineBreakdown, threeDsBreakdown,
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    return;
  }
};

// ─── GET /api/approval/sla ────────────────────────────────────
export const listSla = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  try {
    const slaRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT s.*, g.name as "gatewayName", g.code as "gatewayCode", g.status as "gatewayStatus"
       FROM gateway_sla s
       JOIN payment_gateways g ON g.id = s."gatewayId"
       WHERE s."merchantId"=$1
       ORDER BY s."slaBreached" DESC, g.name ASC`,
      merchantId
    );
    res.json({ success: true, data: { sla: slaRows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch SLA' });
    return;
  }
};

// ─── POST /api/approval/sla ───────────────────────────────────
export const upsertSla = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { gatewayId, slaUptimeTarget, slaResponseTarget, slaSuccessTarget } = req.body;
  if (!gatewayId) {
    res.status(400).json({ success: false, error: 'gatewayId is required' });
    return;
  }
  try {
    const gwExists = await prisma.paymentGateway.findFirst({ where: { id: gatewayId, merchantId } });
    if (!gwExists) { res.status(404).json({ success: false, error: 'Gateway not found' }); return; }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `INSERT INTO gateway_sla (id,"merchantId","gatewayId","slaUptimeTarget","slaResponseTarget","slaSuccessTarget","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT ("merchantId","gatewayId") DO UPDATE SET
         "slaUptimeTarget"=COALESCE($4,"slaUptimeTarget"),
         "slaResponseTarget"=COALESCE($5,"slaResponseTarget"),
         "slaSuccessTarget"=COALESCE($6,"slaSuccessTarget"),
         "updatedAt"=$8`,
      id, merchantId, gatewayId,
      slaUptimeTarget || null, slaResponseTarget || null, slaSuccessTarget || null,
      now, now
    );
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM gateway_sla WHERE "merchantId"=$1 AND "gatewayId"=$2`, merchantId, gatewayId
    );
    res.json({ success: true, data: { sla: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to upsert SLA' });
    return;
  }
};

// ─── POST /api/approval/sla/:gatewayId/check ─────────────────
// يحسب الـ SLA الفعلي من gateway events ويحدّث الـ breach status
export const checkSla = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { gatewayId } = req.params;
  try {
    const slaRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM gateway_sla WHERE "merchantId"=$1 AND "gatewayId"=$2`, merchantId, gatewayId
    );
    if (!slaRows.length) { res.status(404).json({ success: false, error: 'SLA config not found' }); return; }
    const sla = slaRows[0];
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const events: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM gateway_events WHERE "merchantId"=$1 AND "gatewayId"=$2 AND "createdAt">=$3`,
      merchantId, gatewayId, since
    );
    const total   = events.length;
    const success = events.filter(e => e.eventType === 'SUCCESS').length;
    const times   = events.filter(e => e.responseMs).map(e => Number(e.responseMs));
    const avgMs   = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const successRate  = total > 0 ? (success / total) * 100 : 0;
    const uptimeRate   = total > 0 ? ((total - events.filter(e => e.eventType === 'TIMEOUT').length) / total) * 100 : 100;
    const breached = successRate < Number(sla.slaSuccessTarget) || avgMs > Number(sla.slaResponseTarget) || uptimeRate < Number(sla.slaUptimeTarget);
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `UPDATE gateway_sla SET "currentSuccessRate"=$1,"currentResponseAvg"=$2,"currentUptimeRate"=$3,"slaBreached"=$4,"lastCheckedAt"=$5,"updatedAt"=$6 WHERE "merchantId"=$7 AND "gatewayId"=$8`,
      successRate, avgMs, uptimeRate, breached, now, now, merchantId, gatewayId
    );
    res.json({
      success: true,
      data: {
        gatewayId,
        successRate: Math.round(successRate * 10) / 10,
        avgResponseMs: avgMs,
        uptimeRate: Math.round(uptimeRate * 10) / 10,
        slaBreached: breached,
        targets: { success: Number(sla.slaSuccessTarget), responseMs: Number(sla.slaResponseTarget), uptime: Number(sla.slaUptimeTarget) },
        eventsSampled: total,
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'SLA check failed' });
    return;
  }
};
