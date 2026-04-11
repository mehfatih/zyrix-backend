import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

export const getTeamAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    let account = await prisma.$queryRawUnsafe(
      `SELECT * FROM team_accounts WHERE merchant_id=$1`, merchantId
    ) as any[];
    if (!account.length) {
      account = await prisma.$queryRawUnsafe(
        `INSERT INTO team_accounts (merchant_id) VALUES ($1) RETURNING *`, merchantId
      ) as any[];
    }
    const members = await prisma.$queryRawUnsafe(
      `SELECT * FROM team_members WHERE merchant_id=$1 ORDER BY created_at DESC`, merchantId
    ) as any[];
    res.json({ success: true, data: { account: account[0], members } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get team account" });
    return;
  }
};

export const getMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, merchant_id, name, email, phone, role, status, last_login_at, created_at
       FROM team_members WHERE merchant_id=$1 ORDER BY created_at DESC`, merchantId
    ) as any[];
    const stats = await prisma.$queryRawUnsafe(
      `SELECT
        COUNT(*)::int as total,
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END)::int as active,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)::int as pending
       FROM team_members WHERE merchant_id=$1`, merchantId
    ) as any[];
    res.json({ success: true, data: { members: rows, stats: stats[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get members" });
    return;
  }
};

export const inviteMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, email, phone, role } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO team_members (merchant_id, name, email, phone, role, status)
       VALUES ($1,$2,$3,$4,$5,'pending')
       ON CONFLICT (merchant_id, email) DO UPDATE SET name=$2, role=$5, status='pending'
       RETURNING *`,
      merchantId, name, email, phone ?? null, role ?? 'viewer'
    ) as any[];
    await prisma.$queryRawUnsafe(
      `INSERT INTO team_activity_logs (merchant_id, member_id, action, resource)
       VALUES ($1,$2,'INVITE_SENT','team_member')`,
      merchantId, rows[0].id
    );
    res.json({ success: true, data: { member: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to invite member" });
    return;
  }
};

export const updateMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { name, role, status } = req.body;
    await prisma.$queryRawUnsafe(
      `UPDATE team_members SET name=$1, role=$2, status=$3 WHERE id=$4 AND merchant_id=$5`,
      name, role, status ?? 'active', id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update member" });
    return;
  }
};

export const removeMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM team_members WHERE id=$1 AND merchant_id=$2 AND role != 'owner'`,
      id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to remove member" });
    return;
  }
};

export const getActivityLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const limit = Number(req.query.limit ?? 50);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT l.*, m.name as member_name, m.email as member_email
       FROM team_activity_logs l
       LEFT JOIN team_members m ON m.id = l.member_id
       WHERE l.merchant_id=$1 ORDER BY l.performed_at DESC LIMIT $2`,
      merchantId, limit
    ) as any[];
    res.json({ success: true, data: { logs: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get activity logs" });
    return;
  }
};
