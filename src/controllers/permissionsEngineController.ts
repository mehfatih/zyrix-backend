import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

const DEFAULT_ROLES = [
  { name: 'admin',      permissions: ['*'] },
  { name: 'manager',    permissions: ['transactions:read','settlements:read','invoices:*','customers:*','analytics:read'] },
  { name: 'accountant', permissions: ['transactions:read','settlements:read','invoices:read','expenses:*','reports:*'] },
  { name: 'viewer',     permissions: ['transactions:read','analytics:read','dashboard:read'] },
];

export const getRoles = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    let rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM permission_roles WHERE merchant_id=$1 ORDER BY created_at ASC`, merchantId
    ) as any[];
    if (!rows.length) {
      for (const r of DEFAULT_ROLES) {
        await prisma.$queryRawUnsafe(
          `INSERT INTO permission_roles (merchant_id, name, permissions, is_system)
           VALUES ($1,$2,$3,true) ON CONFLICT (merchant_id, name) DO NOTHING`,
          merchantId, r.name, JSON.stringify(r.permissions)
        );
      }
      rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM permission_roles WHERE merchant_id=$1 ORDER BY created_at ASC`, merchantId
      ) as any[];
    }
    res.json({ success: true, data: { roles: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get roles" });
    return;
  }
};

export const createRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, description, permissions } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO permission_roles (merchant_id, name, description, permissions)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      merchantId, name, description ?? null, JSON.stringify(permissions ?? [])
    ) as any[];
    res.json({ success: true, data: { role: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create role" });
    return;
  }
};

export const updateRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    await prisma.$queryRawUnsafe(
      `UPDATE permission_roles SET name=$1, description=$2, permissions=$3
       WHERE id=$4 AND merchant_id=$5 AND is_system=false`,
      name, description ?? null, JSON.stringify(permissions ?? []), id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update role" });
    return;
  }
};

export const deleteRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM permission_roles WHERE id=$1 AND merchant_id=$2 AND is_system=false`,
      id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete role" });
    return;
  }
};

export const getGrants = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { memberId } = req.params;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT g.*, m.name as member_name
       FROM permission_grants g
       LEFT JOIN team_members m ON m.id = g.member_id
       WHERE g.merchant_id=$1 AND g.member_id=$2`,
      merchantId, memberId
    ) as any[];
    res.json({ success: true, data: { grants: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get grants" });
    return;
  }
};

export const upsertGrant = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { member_id, role_id, resource, action, granted, granted_by } = req.body;
    await prisma.$queryRawUnsafe(
      `INSERT INTO permission_grants (merchant_id, member_id, role_id, resource, action, granted, granted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (merchant_id, member_id, resource, action)
       DO UPDATE SET granted=$6, role_id=$3`,
      merchantId, member_id, role_id ?? null, resource, action,
      granted ?? true, granted_by ?? null
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to upsert grant" });
    return;
  }
};

export const checkPermission = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { member_id, resource, action } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT granted FROM permission_grants
       WHERE merchant_id=$1 AND member_id=$2
       AND (resource=$3 OR resource='*')
       AND (action=$4 OR action='*')
       LIMIT 1`,
      merchantId, member_id, resource, action
    ) as any[];
    const allowed = rows.length > 0 ? rows[0].granted : false;
    res.json({ success: true, data: { allowed, resource, action } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to check permission" });
    return;
  }
};

export const assignRoleToMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { memberId } = req.params;
    const { role_id } = req.body;
    const roleRows = await prisma.$queryRawUnsafe(
      `SELECT * FROM permission_roles WHERE id=$1 AND merchant_id=$2`, role_id, merchantId
    ) as any[];
    if (!roleRows.length) {
      res.status(404).json({ success: false, error: "Role not found" });
      return;
    }
    const role = roleRows[0];
    const perms: string[] = Array.isArray(role.permissions) ? role.permissions : JSON.parse(role.permissions ?? '[]');
    for (const perm of perms) {
      const [res_part, act_part] = perm.includes(':') ? perm.split(':') : [perm, '*'];
      await prisma.$queryRawUnsafe(
        `INSERT INTO permission_grants (merchant_id, member_id, role_id, resource, action, granted)
         VALUES ($1,$2,$3,$4,$5,true)
         ON CONFLICT (merchant_id, member_id, resource, action) DO UPDATE SET granted=true, role_id=$3`,
        merchantId, memberId, role_id, res_part, act_part
      );
    }
    await prisma.$queryRawUnsafe(
      `UPDATE team_members SET role=$1 WHERE id=$2 AND merchant_id=$3`,
      role.name, memberId, merchantId
    );
    res.json({ success: true, data: { message: `Role ${role.name} assigned` } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to assign role" });
    return;
  }
};
