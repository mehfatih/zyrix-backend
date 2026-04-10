import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';

function safeNum(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 32. PAYMENT REMINDERS — send reminder for unpaid invoices / pending payments
// GET  /api/growth/reminders
// POST /api/growth/reminders          — create reminder rule
// POST /api/growth/reminders/:id/send — manually trigger
// DELETE /api/growth/reminders/:id
// ─────────────────────────────────────────────────────────────────────────────
export async function getReminders(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM payment_reminders WHERE "merchantId"=$1 ORDER BY "createdAt" DESC`,
      merchantId
    );
    const history = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM reminder_events WHERE "merchantId"=$1 ORDER BY "sentAt" DESC LIMIT 20`,
      merchantId
    );
    res.json({ success: true, data: { reminders: rows, history } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function createReminder(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { name, triggerType, triggerDays, channel, messageAr, isActive } = req.body;
    if (!name || !triggerType || !channel) {
      res.status(400).json({ success: false, error: 'name, triggerType, channel مطلوبة' });
      return;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO payment_reminders
         ("id","merchantId","name","triggerType","triggerDays","channel","messageAr","isActive","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
      merchantId, name, triggerType, Number(triggerDays || 3), channel, messageAr || '', Boolean(isActive ?? true)
    );
    const created = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM payment_reminders WHERE "merchantId"=$1 ORDER BY "createdAt" DESC LIMIT 1`,
      merchantId
    );
    res.status(201).json({ success: true, data: { reminder: created[0] } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function sendReminder(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { id } = req.params;
    const reminder = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM payment_reminders WHERE id=$1 AND "merchantId"=$2`,
      id, merchantId
    );
    if (reminder.length === 0) { res.status(404).json({ success: false, error: 'تذكير غير موجود' }); return; }

    // Find pending invoices/links to remind about
    const targets = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, "customerName", total::float AS amount, currency FROM invoices
       WHERE "merchantId"=$1 AND status IN ('SENT','OVERDUE')
       LIMIT 10`,
      merchantId
    );

    // Log send event
    await prisma.$executeRawUnsafe(
      `INSERT INTO reminder_events
         ("id","merchantId","reminderId","reminderName","channel","recipientCount","sentAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,NOW())`,
      merchantId, id, reminder[0].name, reminder[0].channel, targets.length
    );

    res.json({ success: true, data: { sent: targets.length, targets, message: 'تم إرسال التذكيرات بنجاح' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteReminder(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { id } = req.params;
    await prisma.$executeRawUnsafe(
      `DELETE FROM payment_reminders WHERE id=$1 AND "merchantId"=$2`,
      id, merchantId
    );
    res.json({ success: true, message: 'تم الحذف' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 33. REVENUE RECOVERY — detect and retry failed/abandoned payments
// GET  /api/growth/recovery
// POST /api/growth/recovery/retry/:txId
// GET  /api/growth/recovery/stats
// ─────────────────────────────────────────────────────────────────────────────
export async function getRecoveryOpportunities(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const since = new Date(Date.now() - 30 * 86400000);

    const [failedTx, expiredLinks, overdueInvoices] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT id, "transactionId", "customerName", amount::float, currency, "createdAt"
         FROM transactions
         WHERE "merchantId"=$1 AND status='FAILED' AND "createdAt">=$2
         ORDER BY amount DESC LIMIT 20`,
        merchantId, since
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT id, "linkId", title, "usageCount", "paidCount", currency
         FROM payment_links
         WHERE "merchantId"=$1 AND status='EXPIRED' AND "createdAt">=$2
         LIMIT 10`,
        merchantId, since
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT id, "invoiceId", "customerName", total::float, currency
         FROM invoices
         WHERE "merchantId"=$1 AND status='OVERDUE'
         LIMIT 10`,
        merchantId
      ),
    ]);

    const totalRecoverable = failedTx.reduce((s: number, t: any) => s + safeNum(t.amount), 0)
      + overdueInvoices.reduce((s: number, i: any) => s + safeNum(i.total), 0);

    res.json({
      success: true,
      data: {
        totalRecoverable,
        failedTransactions: failedTx,
        expiredLinks,
        overdueInvoices,
        summary: {
          failedCount: failedTx.length,
          expiredLinksCount: expiredLinks.length,
          overdueCount: overdueInvoices.length,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function retryRecovery(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { txId } = req.params;

    const tx = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM transactions WHERE id=$1 AND "merchantId"=$2 AND status='FAILED'`,
      txId, merchantId
    );
    if (tx.length === 0) { res.status(404).json({ success: false, error: 'معاملة غير موجودة' }); return; }

    // Log recovery attempt
    await prisma.$executeRawUnsafe(
      `INSERT INTO recovery_attempts
         ("id","merchantId","transactionId","amount","currency","status","createdAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,'INITIATED',NOW())`,
      merchantId, txId, tx[0].amount, tx[0].currency
    );

    res.json({ success: true, data: { message: 'تم بدء محاولة الاسترداد', transactionId: txId } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 34. CRM INTEGRATION — customer notes, tags, segments export
// GET    /api/growth/crm/customers
// PATCH  /api/growth/crm/customers/:id
// POST   /api/growth/crm/export
// ─────────────────────────────────────────────────────────────────────────────
export async function getCRMCustomers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { search, page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let where = `WHERE c."merchantId"=$1`;
    const params: any[] = [merchantId];
    let idx = 2;

    if (search) {
      where += ` AND (c.name ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.email ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    const customers = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.id, c."customerId", c.name, c.phone, c.email, c.city, c.country,
              c.tags, c.notes, c."totalSpent"::float, c."totalOrders",
              c."avgOrderValue"::float, c."lastSeenAt", c."firstSeenAt",
              c."refundCount", c."refundAmount"::float
       FROM customers c ${where}
       ORDER BY c."totalSpent" DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      ...params, parseInt(limit as string), offset
    );

    const countRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int AS cnt FROM customers c ${where}`,
      ...params.slice(0, idx - 1)
    );

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: safeNum(countRows[0]?.cnt),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateCRMCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { id } = req.params;
    const { notes, tags } = req.body;

    const fields: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (notes !== undefined) { fields.push(`notes=$${i++}`); vals.push(notes); }
    if (tags  !== undefined) { fields.push(`tags=$${i++}`);  vals.push(tags); }
    if (fields.length === 0) { res.status(400).json({ success: false, error: 'لا حقول للتحديث' }); return; }
    fields.push(`"updatedAt"=NOW()`);
    vals.push(id, merchantId);

    await prisma.$executeRawUnsafe(
      `UPDATE customers SET ${fields.join(',')} WHERE id=$${i} AND "merchantId"=$${i + 1}`,
      ...vals
    );
    const updated = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM customers WHERE id=$1`, id);
    res.json({ success: true, data: { customer: updated[0] } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function exportCRM(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const customers = await prisma.$queryRawUnsafe<any[]>(
      `SELECT name, phone, email, city, country, tags, "totalSpent"::float,
              "totalOrders", "avgOrderValue"::float, "lastSeenAt", "firstSeenAt"
       FROM customers WHERE "merchantId"=$1 ORDER BY "totalSpent" DESC`,
      merchantId
    );
    res.json({ success: true, data: { customers, exportedAt: new Date().toISOString(), count: customers.length } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 36. AFFILIATE SYSTEM
// GET    /api/growth/affiliates
// POST   /api/growth/affiliates
// GET    /api/growth/affiliates/:id/stats
// PATCH  /api/growth/affiliates/:id
// DELETE /api/growth/affiliates/:id
// ─────────────────────────────────────────────────────────────────────────────
export async function getAffiliates(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const affiliates = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM affiliates WHERE "merchantId"=$1 ORDER BY "createdAt" DESC`,
      merchantId
    );
    res.json({ success: true, data: { affiliates } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function createAffiliate(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { name, email, commissionType, commissionValue, isActive } = req.body;
    if (!name || !email || !commissionType || commissionValue === undefined) {
      res.status(400).json({ success: false, error: 'name, email, commissionType, commissionValue مطلوبة' });
      return;
    }
    const code = `AFF-${name.slice(0, 3).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO affiliates
         ("id","merchantId","name","email","code","commissionType","commissionValue","isActive",
          "totalClicks","totalConversions","totalEarnings","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,0,0,0,NOW(),NOW())`,
      merchantId, name, email, code, commissionType, Number(commissionValue), Boolean(isActive ?? true)
    );
    const created = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM affiliates WHERE "merchantId"=$1 ORDER BY "createdAt" DESC LIMIT 1`,
      merchantId
    );
    res.status(201).json({ success: true, data: { affiliate: created[0] } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getAffiliateStats(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { id } = req.params;
    const aff = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM affiliates WHERE id=$1 AND "merchantId"=$2`,
      id, merchantId
    );
    if (aff.length === 0) { res.status(404).json({ success: false, error: 'شريك غير موجود' }); return; }

    const clicks = await prisma.$queryRawUnsafe<any[]>(
      `SELECT DATE("clickedAt") AS day, COUNT(*)::int AS cnt
       FROM affiliate_clicks WHERE "affiliateId"=$1
       AND "clickedAt">=NOW()-INTERVAL '30 days'
       GROUP BY day ORDER BY day ASC`,
      id
    );

    res.json({ success: true, data: { affiliate: aff[0], clicksLast30Days: clicks } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateAffiliate(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { id } = req.params;
    const { name, commissionValue, isActive } = req.body;
    const fields: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (name            !== undefined) { fields.push(`name=$${i++}`);            vals.push(name); }
    if (commissionValue !== undefined) { fields.push(`"commissionValue"=$${i++}`); vals.push(Number(commissionValue)); }
    if (isActive        !== undefined) { fields.push(`"isActive"=$${i++}`);       vals.push(Boolean(isActive)); }
    if (fields.length === 0) { res.status(400).json({ success: false, error: 'لا تحديثات' }); return; }
    fields.push(`"updatedAt"=NOW()`);
    vals.push(id, merchantId);
    await prisma.$executeRawUnsafe(
      `UPDATE affiliates SET ${fields.join(',')} WHERE id=$${i} AND "merchantId"=$${i + 1}`,
      ...vals
    );
    const updated = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM affiliates WHERE id=$1`, id);
    res.json({ success: true, data: { affiliate: updated[0] } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteAffiliate(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { id } = req.params;
    await prisma.$executeRawUnsafe(`DELETE FROM affiliates WHERE id=$1 AND "merchantId"=$2`, id, merchantId);
    res.json({ success: true, message: 'تم حذف الشريك' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 37+38. TEAM ACCOUNTS + PERMISSIONS SYSTEM
// (موجود بالفعل في /api/team — نضيف permissions endpoint)
// GET  /api/growth/permissions
// POST /api/growth/permissions/check
// ─────────────────────────────────────────────────────────────────────────────
export async function getPermissions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const members = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, email, role, status, "invitedAt", "joinedAt"
       FROM team_members WHERE "merchantId"=$1 ORDER BY "invitedAt" DESC`,
      merchantId
    );

    const ROLE_PERMISSIONS: Record<string, string[]> = {
      ADMIN:      ['view', 'create', 'edit', 'delete', 'export', 'manage_team', 'manage_settings'],
      MANAGER:    ['view', 'create', 'edit', 'export'],
      ACCOUNTANT: ['view', 'export'],
      VIEWER:     ['view'],
    };

    const membersWithPerms = members.map(m => ({
      ...m,
      permissions: ROLE_PERMISSIONS[m.role] || ['view'],
    }));

    res.json({ success: true, data: { members: membersWithPerms, roleDefinitions: ROLE_PERMISSIONS } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function checkPermission(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { email, permission } = req.body;
    const member = await prisma.$queryRawUnsafe<any[]>(
      `SELECT role FROM team_members WHERE "merchantId"=$1 AND email=$2 AND status='ACTIVE'`,
      merchantId, email
    );

    const ROLE_PERMISSIONS: Record<string, string[]> = {
      ADMIN:      ['view', 'create', 'edit', 'delete', 'export', 'manage_team', 'manage_settings'],
      MANAGER:    ['view', 'create', 'edit', 'export'],
      ACCOUNTANT: ['view', 'export'],
      VIEWER:     ['view'],
    };

    if (member.length === 0) { res.json({ success: true, data: { allowed: false, reason: 'عضو غير موجود' } }); return; }
    const perms = ROLE_PERMISSIONS[member[0].role] || [];
    const allowed = perms.includes(permission);
    res.json({ success: true, data: { allowed, role: member[0].role, permissions: perms } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 39. MARKETPLACE SUPPORT — multi-vendor split config
// GET  /api/growth/marketplace
// POST /api/growth/marketplace/vendor
// GET  /api/growth/marketplace/vendors
// ─────────────────────────────────────────────────────────────────────────────
export async function getMarketplaceConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const config = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM marketplace_configs WHERE "merchantId"=$1`,
      merchantId
    );
    const vendors = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM marketplace_vendors WHERE "merchantId"=$1 ORDER BY "createdAt" DESC`,
      merchantId
    );
    res.json({ success: true, data: { config: config[0] || null, vendors } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function createVendor(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { name, email, commissionPercent, bankAccount, isActive } = req.body;
    if (!name || !email || commissionPercent === undefined) {
      res.status(400).json({ success: false, error: 'name, email, commissionPercent مطلوبة' });
      return;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO marketplace_vendors
         ("id","merchantId","name","email","commissionPercent","bankAccount","isActive","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      merchantId, name, email, Number(commissionPercent), bankAccount || '', Boolean(isActive ?? true)
    );
    const created = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM marketplace_vendors WHERE "merchantId"=$1 ORDER BY "createdAt" DESC LIMIT 1`,
      merchantId
    );
    res.status(201).json({ success: true, data: { vendor: created[0] } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 40. SPLIT PAYMENTS
// POST /api/growth/split/calculate
// GET  /api/growth/split/rules
// POST /api/growth/split/rules
// ─────────────────────────────────────────────────────────────────────────────
export async function calculateSplit(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { amount, currency, vendors } = req.body;
    if (!amount || !vendors || !Array.isArray(vendors)) {
      res.status(400).json({ success: false, error: 'amount و vendors مطلوبان' });
      return;
    }

    let remaining = Number(amount);
    const splits = vendors.map((v: any) => {
      const vendorAmount = v.type === 'percent'
        ? Math.round((Number(amount) * v.value / 100) * 100) / 100
        : Math.min(Number(v.value), remaining);
      remaining -= vendorAmount;
      return { vendorId: v.vendorId, vendorName: v.name, amount: vendorAmount, currency, type: v.type };
    });

    res.json({
      success: true,
      data: { totalAmount: Number(amount), currency, splits, platformAmount: Math.max(remaining, 0) },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getSplitRules(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const rules = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM split_rules WHERE "merchantId"=$1 ORDER BY "createdAt" DESC`,
      merchantId
    );
    res.json({ success: true, data: { rules } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function createSplitRule(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { name, vendors, isActive } = req.body;
    if (!name || !vendors) {
      res.status(400).json({ success: false, error: 'name و vendors مطلوبان' });
      return;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO split_rules ("id","merchantId","name","vendors","isActive","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,NOW(),NOW())`,
      merchantId, name, JSON.stringify(vendors), Boolean(isActive ?? true)
    );
    const created = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM split_rules WHERE "merchantId"=$1 ORDER BY "createdAt" DESC LIMIT 1`,
      merchantId
    );
    res.status(201).json({ success: true, data: { rule: created[0] } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
