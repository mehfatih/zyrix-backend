// ─────────────────────────────────────────────────────────────
// src/controllers/tasks.controller.ts
// Zyrix Backend — Task Management
// Color: #059669
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express"
import { AuthenticatedRequest } from "../types"
import { prisma } from "../config/database"

// ─── Types ────────────────────────────────────────────────────

interface TaskRow {
  id: string
  merchant_id: string
  title: string
  description: string | null
  status: string
  priority: string
  assigned_to: string | null
  related_type: string | null
  related_id: string | null
  due_date: string | null
  done_at: string | null
  created_at: string
  updated_at: string
}

interface StatsRow {
  total: number
  todo: number
  in_progress: number
  done: number
  cancelled: number
  overdue: number
}

function mapTask(r: TaskRow) {
  return {
    id:          r.id,
    title:       r.title,
    description: r.description,
    status:      r.status,
    priority:    r.priority,
    assignedTo:  r.assigned_to,
    relatedType: r.related_type,
    relatedId:   r.related_id,
    dueDate:     r.due_date,
    doneAt:      r.done_at,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  }
}

// ─── Controller ──────────────────────────────────────────────

export const tasksController = {

  // ── List ──────────────────────────────────────────────────
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status, priority, assigned_to } = req.query as Record<string, string>
      const merchantId = req.merchant.id

      let where = `WHERE merchant_id = $1`
      const params: unknown[] = [merchantId]
      let idx = 2

      if (status)      { where += ` AND status = $${idx++}`;      params.push(status.toUpperCase()) }
      if (priority)    { where += ` AND priority = $${idx++}`;    params.push(priority.toUpperCase()) }
      if (assigned_to) { where += ` AND assigned_to = $${idx++}`; params.push(assigned_to) }

      const rows = await prisma.$queryRawUnsafe<TaskRow[]>(
        `SELECT * FROM tasks ${where} ORDER BY
           CASE priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
           due_date ASC NULLS LAST, created_at DESC`,
        ...params
      )

      res.json({ success: true, data: rows.map(mapTask) })
    } catch (err) { next(err) }
  },

  // ── Stats ─────────────────────────────────────────────────
  async getStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const now = new Date().toISOString()
      const rows = await prisma.$queryRawUnsafe<StatsRow[]>(
        `SELECT
           COUNT(*)::int                                                           AS total,
           COUNT(*) FILTER (WHERE status = 'TODO')::int                           AS todo,
           COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int                    AS in_progress,
           COUNT(*) FILTER (WHERE status = 'DONE')::int                           AS done,
           COUNT(*) FILTER (WHERE status = 'CANCELLED')::int                      AS cancelled,
           COUNT(*) FILTER (WHERE status NOT IN ('DONE','CANCELLED')
                              AND due_date IS NOT NULL AND due_date < $2)::int     AS overdue
         FROM tasks WHERE merchant_id = $1`,
        req.merchant.id, now
      )

      res.json({
        success: true,
        data: {
          total:      Number(rows[0]?.total       || 0),
          todo:       Number(rows[0]?.todo        || 0),
          inProgress: Number(rows[0]?.in_progress || 0),
          done:       Number(rows[0]?.done        || 0),
          cancelled:  Number(rows[0]?.cancelled   || 0),
          overdue:    Number(rows[0]?.overdue     || 0),
        },
      })
    } catch (err) { next(err) }
  },

  // ── Create ────────────────────────────────────────────────
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        title, description, priority = "MEDIUM",
        assignedTo, relatedType, relatedId, dueDate,
      } = req.body as {
        title: string; description?: string; priority?: string
        assignedTo?: string; relatedType?: string; relatedId?: string; dueDate?: string
      }

      if (!title?.trim()) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "title مطلوب" } })
        return
      }

      const rows = await prisma.$queryRawUnsafe<TaskRow[]>(
        `INSERT INTO tasks (merchant_id, title, description, priority, assigned_to, related_type, related_id, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        req.merchant.id, title.trim(), description ?? null,
        priority.toUpperCase(), assignedTo ?? null,
        relatedType?.toUpperCase() ?? null, relatedId ?? null,
        dueDate ?? null
      )

      res.json({ success: true, data: mapTask(rows[0]) })
    } catch (err) { next(err) }
  },

  // ── Update ────────────────────────────────────────────────
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const { title, description, status, priority, assignedTo, dueDate } = req.body as {
        title?: string; description?: string; status?: string
        priority?: string; assignedTo?: string; dueDate?: string
      }

      const doneAt = status?.toUpperCase() === "DONE" ? new Date().toISOString() : null

      const rows = await prisma.$queryRawUnsafe<TaskRow[]>(
        `UPDATE tasks SET
           title       = COALESCE($3, title),
           description = COALESCE($4, description),
           status      = COALESCE($5, status),
           priority    = COALESCE($6, priority),
           assigned_to = COALESCE($7, assigned_to),
           due_date    = COALESCE($8, due_date),
           done_at     = CASE WHEN $5 = 'DONE' THEN NOW() ELSE done_at END,
           updated_at  = NOW()
         WHERE id = $1 AND merchant_id = $2
         RETURNING *`,
        id, req.merchant.id,
        title?.trim() ?? null,
        description ?? null,
        status?.toUpperCase() ?? null,
        priority?.toUpperCase() ?? null,
        assignedTo ?? null,
        dueDate ?? null
      )

      if (rows.length === 0) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "المهمة غير موجودة" } })
        return
      }

      res.json({ success: true, data: mapTask(rows[0]) })
    } catch (err) { next(err) }
  },

  // ── Update Status ─────────────────────────────────────────
  async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const { status } = req.body as { status: string }

      const validStatuses = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]
      if (!validStatuses.includes(status?.toUpperCase())) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "status غير صحيح" } })
        return
      }

      const rows = await prisma.$queryRawUnsafe<TaskRow[]>(
        `UPDATE tasks SET
           status     = $1,
           done_at    = CASE WHEN $1 = 'DONE' THEN NOW() ELSE done_at END,
           updated_at = NOW()
         WHERE id = $2 AND merchant_id = $3
         RETURNING *`,
        status.toUpperCase(), id, req.merchant.id
      )

      res.json({ success: true, data: rows[0] ? mapTask(rows[0]) : null })
    } catch (err) { next(err) }
  },

  // ── Delete ────────────────────────────────────────────────
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM tasks WHERE id = $1 AND merchant_id = $2`,
        req.params.id, req.merchant.id
      )
      res.json({ success: true, data: { deleted: true } })
    } catch (err) { next(err) }
  },

  // ── Get by Related Entity ─────────────────────────────────
  async getByRelated(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { type, id } = req.params

      const rows = await prisma.$queryRawUnsafe<TaskRow[]>(
        `SELECT * FROM tasks
         WHERE merchant_id = $1 AND related_type = $2 AND related_id = $3
         ORDER BY created_at DESC`,
        req.merchant.id, type.toUpperCase(), id
      )

      res.json({ success: true, data: rows.map(mapTask) })
    } catch (err) { next(err) }
  },
}
