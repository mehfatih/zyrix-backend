// ─────────────────────────────────────────────────────────────
// src/controllers/roleDashboard.controller.ts
// Zyrix Backend — Role-based Dashboard
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express"
import { AuthenticatedRequest } from "../types"
import { prisma } from "../config/database"

// ─── Role Permissions Map ─────────────────────────────────────

const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: [
    "dashboard", "transactions", "settlements", "disputes", "refunds",
    "invoices", "expenses", "revenue-goals", "customers", "team",
    "analytics", "reports", "settings", "api-keys", "webhooks",
    "quotes", "pipeline", "loyalty", "ai-cfo", "tax-engine",
    "cash-flow", "smart-follow-up", "task-management", "commission-engine",
    "marketing-automation", "campaign-management",
  ],
  MANAGER: [
    "dashboard", "transactions", "invoices", "expenses", "customers",
    "analytics", "reports", "quotes", "pipeline", "loyalty",
    "cash-flow", "smart-follow-up", "task-management",
    "marketing-automation", "campaign-management",
  ],
  ACCOUNTANT: [
    "dashboard", "transactions", "settlements", "invoices", "expenses",
    "revenue-goals", "reports", "tax-engine", "cash-flow",
  ],
  VIEWER: [
    "dashboard", "transactions", "reports",
  ],
}

const ROLE_WIDGETS: Record<string, string[]> = {
  ADMIN: [
    "revenue_today", "transactions_today", "pending_settlements",
    "open_disputes", "active_customers", "pipeline_value",
    "loyalty_points_issued", "cash_flow_net", "pending_tasks",
    "active_campaigns", "commission_pending",
  ],
  MANAGER: [
    "revenue_today", "transactions_today", "active_customers",
    "pipeline_value", "pending_tasks", "active_campaigns",
  ],
  ACCOUNTANT: [
    "revenue_today", "transactions_today", "pending_settlements",
    "invoices_overdue", "cash_flow_net", "tax_this_month",
  ],
  VIEWER: [
    "revenue_today", "transactions_today",
  ],
}

// ─── Controller ──────────────────────────────────────────────

export const roleDashboardController = {

  // ── Get Role Dashboard ────────────────────────────────────
  async getDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id
      const now        = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      // KPIs مشتركة
      const [txToday, pendingSettlements, openDisputes, overdueInvoices] = await Promise.all([
        prisma.transaction.aggregate({
          where: { merchantId, createdAt: { gte: todayStart }, status: "SUCCESS" },
          _sum: { amount: true }, _count: true,
        }),
        prisma.settlement.count({ where: { merchantId, status: "SCHEDULED" } }),
        prisma.dispute.count({ where: { merchantId, status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
        prisma.invoice.count({ where: { merchantId, status: "OVERDUE" } }),
      ])

      // Pipeline value
      const pipelineVal = await prisma.$queryRawUnsafe<{ val: number }[]>(
        `SELECT COALESCE(SUM(value)::float, 0) AS val FROM deals WHERE merchant_id = $1 AND status = 'OPEN'`,
        merchantId
      )

      // Cash flow net (this month)
      const cfNet = await prisma.$queryRawUnsafe<{ net: number }[]>(
        `SELECT COALESCE(SUM(CASE WHEN type='INFLOW' THEN amount ELSE -amount END)::float, 0) AS net
         FROM cash_flow_entries
         WHERE merchant_id = $1
           AND EXTRACT(MONTH FROM entry_date) = $2
           AND EXTRACT(YEAR  FROM entry_date) = $3`,
        merchantId, now.getMonth() + 1, now.getFullYear()
      )

      // Tax this month
      const taxMonth = await prisma.$queryRawUnsafe<{ total: number }[]>(
        `SELECT COALESCE(SUM(tax_amount)::float, 0) AS total FROM tax_calculations
         WHERE merchant_id = $1 AND period_month = $2 AND period_year = $3`,
        merchantId, now.getMonth() + 1, now.getFullYear()
      )

      // Pending tasks
      const pendingTasks = await prisma.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM tasks WHERE merchant_id = $1 AND status IN ('TODO','IN_PROGRESS')`,
        merchantId
      )

      // Commission pending
      const commPending = await prisma.$queryRawUnsafe<{ total: number }[]>(
        `SELECT COALESCE(SUM(commission_amt)::float, 0) AS total FROM commission_records
         WHERE merchant_id = $1 AND status = 'PENDING'`,
        merchantId
      )

      // Active campaigns
      const activeCampaigns = await prisma.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM marketing_campaigns WHERE merchant_id = $1 AND status = 'ACTIVE'`,
        merchantId
      )

      const widgets = {
        revenue_today:        { value: Number(txToday._sum.amount || 0), label: "إيرادات اليوم",      format: "currency" },
        transactions_today:   { value: txToday._count,                    label: "معاملات اليوم",      format: "number" },
        pending_settlements:  { value: pendingSettlements,                label: "تسويات معلقة",       format: "number" },
        open_disputes:        { value: openDisputes,                      label: "نزاعات مفتوحة",      format: "number" },
        invoices_overdue:     { value: overdueInvoices,                   label: "فواتير متأخرة",      format: "number" },
        pipeline_value:       { value: Number(pipelineVal[0]?.val || 0),  label: "قيمة الـ Pipeline", format: "currency" },
        cash_flow_net:        { value: Number(cfNet[0]?.net || 0),        label: "صافي التدفق النقدي", format: "currency" },
        tax_this_month:       { value: Number(taxMonth[0]?.total || 0),   label: "ضرائب الشهر",        format: "currency" },
        pending_tasks:        { value: Number(pendingTasks[0]?.count || 0), label: "مهام قيد التنفيذ", format: "number" },
        commission_pending:   { value: Number(commPending[0]?.total || 0), label: "عمولات معلقة",      format: "currency" },
        active_campaigns:     { value: Number(activeCampaigns[0]?.count || 0), label: "حملات نشطة",   format: "number" },
        active_customers:     { value: 0, label: "العملاء النشطون", format: "number" },
        loyalty_points_issued:{ value: 0, label: "نقاط الولاء",     format: "number" },
      }

      res.json({ success: true, data: { widgets, permissions: ROLE_PERMISSIONS, roleWidgets: ROLE_WIDGETS } })
    } catch (err) { next(err) }
  },

  // ── Get Permissions for Role ───────────────────────────────
  async getPermissions(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: { permissions: ROLE_PERMISSIONS, widgets: ROLE_WIDGETS } })
    } catch (err) { next(err) }
  },

  // ── Get Team Dashboard ─────────────────────────────────────
  async getTeamOverview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const members = await prisma.teamMember.findMany({
        where: { merchantId: req.merchant.id },
        select: { id: true, name: true, email: true, role: true, status: true, joinedAt: true },
        orderBy: { role: "asc" },
      })

      const byRole = members.reduce((acc, m) => {
        if (!acc[m.role]) acc[m.role] = []
        acc[m.role].push(m)
        return acc
      }, {} as Record<string, typeof members>)

      res.json({
        success: true,
        data: {
          total:    members.length,
          active:   members.filter(m => m.status === "ACTIVE").length,
          invited:  members.filter(m => m.status === "INVITED").length,
          byRole,
          members:  members.map(m => ({
            id: m.id, name: m.name, email: m.email,
            role: m.role, status: m.status, joinedAt: m.joinedAt,
            permissions: ROLE_PERMISSIONS[m.role] || [],
            widgets:     ROLE_WIDGETS[m.role] || [],
          })),
        },
      })
    } catch (err) { next(err) }
  },
}
