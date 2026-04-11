import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

// ─── Connections ─────────────────────────────────────────────

export const getConnections = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, merchant_id, provider, label, status, last_sync_at, created_at,
              webhook_url, config
       FROM crm_connections WHERE merchant_id=$1 ORDER BY created_at DESC`,
      merchantId
    ) as any[];
    res.json({ success: true, data: { connections: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get connections" });
    return;
  }
};

export const createConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { provider, label, api_key, webhook_url, config } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO crm_connections (merchant_id, provider, label, api_key, webhook_url, config)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (merchant_id, provider) DO UPDATE
       SET label=$3, api_key=$4, webhook_url=$5, config=$6, status='active'
       RETURNING id, provider, label, status, created_at`,
      merchantId, provider, label, api_key ?? null, webhook_url ?? null,
      JSON.stringify(config ?? {})
    ) as any[];
    res.json({ success: true, data: { connection: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create connection" });
    return;
  }
};

export const updateConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { label, api_key, webhook_url, config, status } = req.body;
    await prisma.$queryRawUnsafe(
      `UPDATE crm_connections
       SET label=$1, api_key=$2, webhook_url=$3, config=$4, status=$5
       WHERE id=$6 AND merchant_id=$7`,
      label, api_key ?? null, webhook_url ?? null,
      JSON.stringify(config ?? {}), status ?? 'active', id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update connection" });
    return;
  }
};

export const deleteConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM crm_connections WHERE id=$1 AND merchant_id=$2`,
      id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete connection" });
    return;
  }
};

// ─── Sync ─────────────────────────────────────────────────────

export const syncConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { event_type, payload } = req.body;
    const logRows = await prisma.$queryRawUnsafe(
      `INSERT INTO crm_sync_logs (merchant_id, connection_id, event_type, payload, status)
       VALUES ($1,$2,$3,$4,'success') RETURNING *`,
      merchantId, id, event_type ?? 'MANUAL_SYNC', JSON.stringify(payload ?? {})
    ) as any[];
    await prisma.$queryRawUnsafe(
      `UPDATE crm_connections SET last_sync_at=NOW() WHERE id=$1 AND merchant_id=$2`,
      id, merchantId
    );
    res.json({ success: true, data: { log: logRows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to sync" });
    return;
  }
};

export const getSyncLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { connectionId } = req.query;
    const limit = Number(req.query.limit ?? 50);
    let query = `SELECT * FROM crm_sync_logs WHERE merchant_id=$1`;
    const params: any[] = [merchantId];
    if (connectionId) { query += ` AND connection_id=$2`; params.push(connectionId); }
    query += ` ORDER BY synced_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    const rows = await prisma.$queryRawUnsafe(query, ...params) as any[];
    res.json({ success: true, data: { logs: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get sync logs" });
    return;
  }
};

// ─── Field Mappings ───────────────────────────────────────────

export const getMappings = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { connectionId } = req.params;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM crm_field_mappings WHERE merchant_id=$1 AND connection_id=$2`,
      merchantId, connectionId
    ) as any[];
    res.json({ success: true, data: { mappings: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get mappings" });
    return;
  }
};

export const upsertMapping = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { connectionId } = req.params;
    const { zyrix_field, crm_field, transform } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO crm_field_mappings (merchant_id, connection_id, zyrix_field, crm_field, transform)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      merchantId, connectionId, zyrix_field, crm_field, transform ?? null
    ) as any[];
    res.json({ success: true, data: { mapping: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to upsert mapping" });
    return;
  }
};
