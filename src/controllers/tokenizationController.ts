import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';

// ─── GET /api/tokenization ────────────────────────────────────
export const listTokens = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { customerId } = req.query;
  try {
    let where = `"merchantId" = $1 AND "isActive" = true`;
    const params: any[] = [merchantId];
    if (customerId) { params.push(customerId); where += ` AND "customerId" = $${params.length}`; }
    const tokens: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM payment_tokens WHERE ${where} ORDER BY "isDefault" DESC, "lastUsedAt" DESC NULLS LAST`,
      ...params
    );
    res.json({ success: true, data: { tokens } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch tokens' });
    return;
  }
};

// ─── POST /api/tokenization ───────────────────────────────────
export const createToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { customerId, alias, cardLast4, cardBrand, cardExpiry, cardholderName, country, currency, gatewayToken, gatewayCode, isDefault, expiresAt } = req.body;
  if (!alias || !gatewayToken || !gatewayCode) {
    res.status(400).json({ success: false, error: 'alias, gatewayToken, gatewayCode are required' });
    return;
  }
  try {
    if (isDefault) {
      await prisma.$executeRawUnsafe(
        `UPDATE payment_tokens SET "isDefault"=false WHERE "merchantId"=$1 AND "customerId" IS NOT DISTINCT FROM $2`,
        merchantId, customerId || null
      );
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `INSERT INTO payment_tokens (id,"merchantId","customerId",alias,"cardLast4","cardBrand","cardExpiry","cardholderName",country,currency,"gatewayToken","gatewayCode","isDefault","expiresAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      id, merchantId, customerId || null, alias,
      cardLast4 || null, cardBrand || null, cardExpiry || null, cardholderName || null,
      country || null, currency || null, gatewayToken, gatewayCode,
      isDefault || false, expiresAt || null, now, now
    );
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM payment_tokens WHERE id=$1`, id);
    res.status(201).json({ success: true, data: { token: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create token' });
    return;
  }
};

// ─── GET /api/tokenization/:id ────────────────────────────────
export const getToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM payment_tokens WHERE id=$1 AND "merchantId"=$2`, id, merchantId
    );
    if (!rows.length) { res.status(404).json({ success: false, error: 'Token not found' }); return; }
    res.json({ success: true, data: { token: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch token' });
    return;
  }
};

// ─── PATCH /api/tokenization/:id ─────────────────────────────
export const updateToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  const { alias, isDefault, isActive } = req.body;
  try {
    const existing: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM payment_tokens WHERE id=$1 AND "merchantId"=$2`, id, merchantId
    );
    if (!existing.length) { res.status(404).json({ success: false, error: 'Token not found' }); return; }
    if (isDefault) {
      await prisma.$executeRawUnsafe(
        `UPDATE payment_tokens SET "isDefault"=false WHERE "merchantId"=$1 AND "customerId" IS NOT DISTINCT FROM $2`,
        merchantId, existing[0].customerId
      );
    }
    const updates: string[] = [];
    const params: any[] = [];
    if (alias !== undefined)     { params.push(alias);     updates.push(`alias=$${params.length}`); }
    if (isDefault !== undefined) { params.push(isDefault); updates.push(`"isDefault"=$${params.length}`); }
    if (isActive !== undefined)  { params.push(isActive);  updates.push(`"isActive"=$${params.length}`); }
    params.push(new Date().toISOString()); updates.push(`"updatedAt"=$${params.length}`);
    params.push(id);
    await prisma.$executeRawUnsafe(`UPDATE payment_tokens SET ${updates.join(',')} WHERE id=$${params.length}`, ...params);
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM payment_tokens WHERE id=$1`, id);
    res.json({ success: true, data: { token: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update token' });
    return;
  }
};

// ─── DELETE /api/tokenization/:id ────────────────────────────
export const deleteToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  try {
    const existing: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM payment_tokens WHERE id=$1 AND "merchantId"=$2`, id, merchantId
    );
    if (!existing.length) { res.status(404).json({ success: false, error: 'Token not found' }); return; }
    await prisma.$executeRawUnsafe(`DELETE FROM payment_tokens WHERE id=$1`, id);
    res.json({ success: true, message: 'Token deleted' });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete token' });
    return;
  }
};

// ─── POST /api/tokenization/:id/charge ───────────────────────
export const chargeToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  const { amount, currency, description } = req.body;
  if (!amount || !currency) {
    res.status(400).json({ success: false, error: 'amount and currency are required' });
    return;
  }
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM payment_tokens WHERE id=$1 AND "merchantId"=$2 AND "isActive"=true`, id, merchantId
    );
    if (!rows.length) { res.status(404).json({ success: false, error: 'Token not found or inactive' }); return; }
    const token = rows[0];
    if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
      await prisma.$executeRawUnsafe(`UPDATE payment_tokens SET "isActive"=false WHERE id=$1`, id);
      res.status(400).json({ success: false, error: 'Token expired' });
      return;
    }
    await prisma.$executeRawUnsafe(
      `UPDATE payment_tokens SET "usageCount"="usageCount"+1,"lastUsedAt"=$1,"updatedAt"=$2 WHERE id=$3`,
      new Date().toISOString(), new Date().toISOString(), id
    );
    res.json({
      success: true,
      data: {
        tokenId: id,
        gatewayToken: token.gatewayToken,
        gatewayCode: token.gatewayCode,
        cardLast4: token.cardLast4,
        cardBrand: token.cardBrand,
        amount, currency, description: description || null,
        message: 'Token ready for gateway charge',
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Token charge failed' });
    return;
  }
};

// ─── GET /api/tokenization/stats ─────────────────────────────
export const getStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  try {
    const tokens: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM payment_tokens WHERE "merchantId"=$1`, merchantId
    );
    const total      = tokens.length;
    const active     = tokens.filter(t => t.isActive).length;
    const expired    = tokens.filter(t => t.expiresAt && new Date(t.expiresAt) < new Date()).length;
    const totalUsage = tokens.reduce((s, t) => s + Number(t.usageCount || 0), 0);
    const brandBreakdown: Record<string, number> = {};
    tokens.forEach(t => { if (t.cardBrand) brandBreakdown[t.cardBrand] = (brandBreakdown[t.cardBrand] || 0) + 1; });
    res.json({ success: true, data: { total, active, expired, totalUsage, brandBreakdown } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    return;
  }
};
