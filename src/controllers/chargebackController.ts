import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';

// ─── GET /api/chargeback/alerts ───────────────────────────────
export const listAlerts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { status, page = '1', limit = '20' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const take = parseInt(limit as string);
  try {
    let where = `"merchantId"=$1`;
    const params: any[] = [merchantId];
    if (status) { params.push(status); where += ` AND status=$${params.length}`; }
    const alerts: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM chargeback_alerts WHERE ${where} ORDER BY "createdAt" DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      ...params, take, skip
    );
    const countRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as total FROM chargeback_alerts WHERE ${where}`, ...params
    );
    const total = Number(countRows[0].total);
    res.json({ success: true, data: { alerts, pagination: { page: parseInt(page as string), limit: take, total, pages: Math.ceil(total / take) } } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch alerts' });
    return;
  }
};

// ─── POST /api/chargeback/analyze ─────────────────────────────
// يحلل معاملة ويقرر هل ترسل pre-dispute alert
export const analyzeForChargeback = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { transactionId, amount, currency, customerPhone, customerEmail, reason } = req.body;
  if (!amount || !currency) {
    res.status(400).json({ success: false, error: 'amount and currency are required' });
    return;
  }
  try {
    // اجلب rules
    const rules: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM chargeback_rules WHERE "merchantId"=$1 AND "isActive"=true`, merchantId
    );
    let riskScore = 0;
    let alertType = 'PRE_DISPUTE';
    let recommendedAction = 'MONITOR';
    let autoRefunded = false;
    let autoRefundAmount: number | null = null;
    const triggeredRules: string[] = [];

    for (const rule of rules) {
      let triggered = false;
      switch (rule.triggerType) {
        case 'HIGH_AMOUNT':
          if (Number(amount) >= Number(rule.triggerValue || 1000)) triggered = true;
          break;
        case 'REPEAT_CUSTOMER':
          if (customerPhone || customerEmail) {
            const prior: any[] = await prisma.$queryRawUnsafe(
              `SELECT COUNT(*) as cnt FROM chargeback_alerts WHERE "merchantId"=$1 AND ("customerPhone"=$2 OR "customerEmail"=$3)`,
              merchantId, customerPhone || '', customerEmail || ''
            );
            if (Number(prior[0].cnt) >= Number(rule.triggerValue || 2)) triggered = true;
          }
          break;
        case 'DISPUTE_KEYWORD':
          if (reason && reason.toLowerCase().includes((rule.triggerValue || '').toLowerCase())) triggered = true;
          break;
        case 'AMOUNT_THRESHOLD':
          if (Number(amount) >= Number(rule.triggerValue || 500)) triggered = true;
          break;
      }
      if (triggered) {
        riskScore += 25;
        triggeredRules.push(rule.name);
        if (rule.action === 'AUTO_REFUND' && rule.autoRefundThreshold && Number(amount) <= Number(rule.autoRefundThreshold)) {
          autoRefunded = true;
          autoRefundAmount = Number(amount);
          recommendedAction = 'AUTO_REFUND';
        } else if (rule.action === 'ALERT' && recommendedAction === 'MONITOR') {
          recommendedAction = 'ALERT_MERCHANT';
        }
        await prisma.$executeRawUnsafe(
          `UPDATE chargeback_rules SET "triggerCount"="triggerCount"+1 WHERE id=$1`, rule.id
        );
      }
    }

    // baseline scoring
    if (Number(amount) > 5000)  { riskScore += 20; }
    if (Number(amount) > 10000) { riskScore += 20; }
    riskScore = Math.min(riskScore, 100);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `INSERT INTO chargeback_alerts (id,"merchantId","transactionId","alertType","riskScore",status,"autoRefunded","autoRefundAmount","recommendedAction",reason,"customerPhone","customerEmail",amount,currency,"createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,'OPEN',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      id, merchantId, transactionId || null, alertType, riskScore,
      autoRefunded, autoRefundAmount, recommendedAction,
      reason || null, customerPhone || null, customerEmail || null,
      Number(amount), currency, now, now
    );
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM chargeback_alerts WHERE id=$1`, id);
    res.json({
      success: true,
      data: {
        alert: rows[0],
        riskScore,
        recommendedAction,
        autoRefunded,
        autoRefundAmount,
        triggeredRules,
        summary: riskScore >= 70 ? 'HIGH_RISK — فعّل refund تلقائي أو تواصل مع العميل' :
                 riskScore >= 40 ? 'MEDIUM_RISK — راقب وتحقق من العميل' :
                 'LOW_RISK — لا حاجة فورية',
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Chargeback analysis failed' });
    return;
  }
};

// ─── PATCH /api/chargeback/alerts/:id/resolve ─────────────────
export const resolveAlert = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  const { resolvedNote } = req.body;
  try {
    const existing: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM chargeback_alerts WHERE id=$1 AND "merchantId"=$2`, id, merchantId
    );
    if (!existing.length) { res.status(404).json({ success: false, error: 'Alert not found' }); return; }
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `UPDATE chargeback_alerts SET status='RESOLVED',"resolvedAt"=$1,"resolvedNote"=$2,"updatedAt"=$3 WHERE id=$4`,
      now, resolvedNote || null, now, id
    );
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM chargeback_alerts WHERE id=$1`, id);
    res.json({ success: true, data: { alert: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to resolve alert' });
    return;
  }
};

// ─── GET /api/chargeback/rules ────────────────────────────────
export const listRules = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  try {
    const rules: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM chargeback_rules WHERE "merchantId"=$1 ORDER BY "createdAt" DESC`, merchantId
    );
    res.json({ success: true, data: { rules } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch rules' });
    return;
  }
};

// ─── POST /api/chargeback/rules ───────────────────────────────
export const createRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { name, description, triggerType, triggerValue, action, autoRefundThreshold } = req.body;
  if (!name || !triggerType || !action) {
    res.status(400).json({ success: false, error: 'name, triggerType, action are required' });
    return;
  }
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `INSERT INTO chargeback_rules (id,"merchantId",name,description,"triggerType","triggerValue",action,"autoRefundThreshold","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      id, merchantId, name, description || null, triggerType, triggerValue || null,
      action, autoRefundThreshold || null, now, now
    );
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM chargeback_rules WHERE id=$1`, id);
    res.status(201).json({ success: true, data: { rule: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create rule' });
    return;
  }
};

// ─── PATCH /api/chargeback/rules/:id ─────────────────────────
export const updateRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  const { name, description, triggerValue, action, autoRefundThreshold, isActive } = req.body;
  try {
    const existing: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM chargeback_rules WHERE id=$1 AND "merchantId"=$2`, id, merchantId
    );
    if (!existing.length) { res.status(404).json({ success: false, error: 'Rule not found' }); return; }
    const updates: string[] = [];
    const params: any[] = [];
    if (name !== undefined)               { params.push(name);               updates.push(`name=$${params.length}`); }
    if (description !== undefined)        { params.push(description);        updates.push(`description=$${params.length}`); }
    if (triggerValue !== undefined)       { params.push(triggerValue);       updates.push(`"triggerValue"=$${params.length}`); }
    if (action !== undefined)             { params.push(action);             updates.push(`action=$${params.length}`); }
    if (autoRefundThreshold !== undefined){ params.push(autoRefundThreshold);updates.push(`"autoRefundThreshold"=$${params.length}`); }
    if (isActive !== undefined)           { params.push(isActive);           updates.push(`"isActive"=$${params.length}`); }
    params.push(new Date().toISOString()); updates.push(`"updatedAt"=$${params.length}`);
    params.push(id);
    await prisma.$executeRawUnsafe(`UPDATE chargeback_rules SET ${updates.join(',')} WHERE id=$${params.length}`, ...params);
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM chargeback_rules WHERE id=$1`, id);
    res.json({ success: true, data: { rule: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update rule' });
    return;
  }
};

// ─── DELETE /api/chargeback/rules/:id ────────────────────────
export const deleteRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  try {
    const existing: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM chargeback_rules WHERE id=$1 AND "merchantId"=$2`, id, merchantId
    );
    if (!existing.length) { res.status(404).json({ success: false, error: 'Rule not found' }); return; }
    await prisma.$executeRawUnsafe(`DELETE FROM chargeback_rules WHERE id=$1`, id);
    res.json({ success: true, message: 'Rule deleted' });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete rule' });
    return;
  }
};

// ─── GET /api/chargeback/stats ────────────────────────────────
export const getStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const days = parseInt(req.query.days as string) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  try {
    const alerts: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM chargeback_alerts WHERE "merchantId"=$1 AND "createdAt">=$2`, merchantId, since
    );
    const total       = alerts.length;
    const open        = alerts.filter(a => a.status === 'OPEN').length;
    const resolved    = alerts.filter(a => a.status === 'RESOLVED').length;
    const autoRefunds = alerts.filter(a => a.autoRefunded).length;
    const highRisk    = alerts.filter(a => Number(a.riskScore) >= 70).length;
    const avgRisk     = total > 0 ? Math.round(alerts.reduce((s, a) => s + Number(a.riskScore), 0) / total) : 0;
    const savedAmount = alerts.filter(a => a.autoRefunded && a.autoRefundAmount).reduce((s, a) => s + Number(a.autoRefundAmount), 0);
    res.json({ success: true, data: { period: `${days}d`, total, open, resolved, autoRefunds, highRisk, avgRisk, savedAmount: Math.round(savedAmount * 100) / 100 } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    return;
  }
};
