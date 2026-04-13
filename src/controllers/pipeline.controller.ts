// ─────────────────────────────────────────────────────────────
// src/controllers/pipeline.controller.ts
// ─────────────────────────────────────────────────────────────
import { Response } from 'express'
import { prisma } from '../config/database'
import { AuthenticatedRequest } from '../types'

// ── Default stages ────────────────────────────────────────────
const DEFAULT_STAGES = [
  { name: 'جديد',          color: '#64748B', order: 0 },
  { name: 'مؤهَّل',        color: '#2563EB', order: 1 },
  { name: 'عرض سعر',      color: '#7C3AED', order: 2 },
  { name: 'تفاوض',        color: '#D97706', order: 3 },
  { name: 'مُغلَق - ربح', color: '#059669', order: 4 },
  { name: 'مُغلَق - خسارة', color: '#E11D48', order: 5 },
]

async function ensureStages(merchantId: string): Promise<void> {
  const count = await prisma.pipelineStage.count({ where: { merchantId } })
  if (count === 0) {
    await prisma.pipelineStage.createMany({
      data: DEFAULT_STAGES.map(s => ({ ...s, merchantId, isDefault: s.order === 0 })),
    })
  }
}

function makeDealId(seq: number): string {
  return `DL-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
}

// ── STAGES ───────────────────────────────────────────────────

export async function listStages(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    await ensureStages(merchantId)
    const stages = await prisma.pipelineStage.findMany({
      where:   { merchantId },
      orderBy: { order: 'asc' },
      include: { _count: { select: { deals: { where: { status: 'OPEN' } } } } },
    })
    res.json({ success: true, data: stages })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function createStage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId  = req.merchant.id
    const { name, color } = req.body
    if (!name) {
      res.status(400).json({ success: false, message: 'name مطلوب' })
      return
    }
    const max   = await prisma.pipelineStage.aggregate({ where: { merchantId }, _max: { order: true } })
    const stage = await prisma.pipelineStage.create({
      data: { merchantId, name, color: color || '#2563EB', order: (max._max.order ?? -1) + 1 },
    })
    res.status(201).json({ success: true, data: stage })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function updateStage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }       = req.params
    const { name, color } = req.body
    const stage = await prisma.pipelineStage.update({ where: { id }, data: { name, color } })
    res.json({ success: true, data: stage })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function deleteStage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id

    const dealsCount = await prisma.deal.count({ where: { stageId: id, status: 'OPEN' } })
    if (dealsCount > 0) {
      res.status(400).json({ success: false, message: `لا يمكن حذف مرحلة تحتوي على ${dealsCount} صفقة مفتوحة` })
      return
    }
    const count = await prisma.pipelineStage.count({ where: { merchantId } })
    if (count <= 1) {
      res.status(400).json({ success: false, message: 'يجب أن يكون هناك مرحلة واحدة على الأقل' })
      return
    }
    await prisma.pipelineStage.delete({ where: { id } })
    res.json({ success: true, message: 'تم الحذف' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function reorderStages(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { order } = req.body as { order: { id: string; order: number }[] }
    await Promise.all(order.map((s) => prisma.pipelineStage.update({ where: { id: s.id }, data: { order: s.order } })))
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── DEALS ─────────────────────────────────────────────────────

export async function listDeals(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    await ensureStages(merchantId)

    const { status, stageId, search, page = '1', limit = '100' } = req.query as Record<string, string>

    const where: any = { merchantId }
    if (status)  where.status  = status
    if (stageId) where.stageId = stageId
    if (search)  where.OR = [
      { title:    { contains: search, mode: 'insensitive' } },
      { dealId:   { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
    ]

    const [deals, total] = await Promise.all([
      prisma.deal.findMany({
        where, skip: (parseInt(page) - 1) * parseInt(limit), take: parseInt(limit),
        orderBy: { lastActivityAt: 'desc' },
        include: {
          stage:    { select: { id: true, name: true, color: true, order: true } },
          customer: { select: { id: true, name: true, email: true, phone: true } },
        },
      }),
      prisma.deal.count({ where }),
    ])

    res.json({ success: true, data: deals, pagination: { total, page: parseInt(page), limit: parseInt(limit) } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function createDeal(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    await ensureStages(merchantId)

    const { stageId, customerId, title, value, currency, probability, assignedTo, expectedCloseAt, notes } = req.body

    if (!title || !stageId || value === undefined) {
      res.status(400).json({ success: false, message: 'title, stageId, value مطلوبة' })
      return
    }

    const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, merchantId } })
    if (!stage) {
      res.status(400).json({ success: false, message: 'المرحلة غير موجودة' })
      return
    }

    const count = await prisma.deal.count({ where: { merchantId } })
    const deal  = await prisma.deal.create({
      data: {
        merchantId, dealId: makeDealId(count + 1), stageId,
        customerId: customerId || null, title, value, currency: currency || 'SAR',
        probability: probability ?? 50, assignedTo: assignedTo || null,
        expectedCloseAt: expectedCloseAt ? new Date(expectedCloseAt) : null,
        notes: notes || null,
      },
      include: {
        stage:    { select: { id: true, name: true, color: true } },
        customer: { select: { id: true, name: true, email: true } },
      },
    })

    await prisma.dealActivity.create({ data: { dealId: deal.id, type: 'created', note: `تم إنشاء الصفقة ${deal.dealId}` } })

    res.status(201).json({ success: true, data: deal })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function getDeal(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id

    const deal = await prisma.deal.findFirst({
      where: { id, merchantId },
      include: { stage: true, customer: true, activities: { orderBy: { createdAt: 'desc' }, take: 20 } },
    })

    if (!deal) {
      res.status(404).json({ success: false, message: 'الصفقة غير موجودة' })
      return
    }
    res.json({ success: true, data: deal })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function updateDeal(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id

    const existing = await prisma.deal.findFirst({ where: { id, merchantId } })
    if (!existing) {
      res.status(404).json({ success: false, message: 'الصفقة غير موجودة' })
      return
    }

    const { title, value, currency, probability, assignedTo, expectedCloseAt, notes, stageId } = req.body
    const deal = await prisma.deal.update({
      where: { id },
      data: {
        title, value, currency, probability, assignedTo, notes, stageId,
        expectedCloseAt: expectedCloseAt ? new Date(expectedCloseAt) : undefined,
        lastActivityAt:  new Date(),
        updatedAt:       new Date(),
      },
      include: { stage: true, customer: true },
    })
    res.json({ success: true, data: deal })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function deleteDeal(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id

    const existing = await prisma.deal.findFirst({ where: { id, merchantId } })
    if (!existing) {
      res.status(404).json({ success: false, message: 'الصفقة غير موجودة' })
      return
    }
    await prisma.deal.delete({ where: { id } })
    res.json({ success: true, message: 'تم الحذف' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function moveDealStage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id
    const { stageId, status, lostReason } = req.body

    const existing = await prisma.deal.findFirst({ where: { id, merchantId }, include: { stage: true } })
    if (!existing) {
      res.status(404).json({ success: false, message: 'الصفقة غير موجودة' })
      return
    }

    const updateData: any = { lastActivityAt: new Date() }
    if (stageId)        updateData.stageId    = stageId
    if (status === 'WON')  { updateData.status = 'WON';  updateData.closedAt = new Date() }
    if (status === 'LOST') { updateData.status = 'LOST'; updateData.closedAt = new Date(); updateData.lostReason = lostReason || null }
    if (status === 'OPEN') { updateData.status = 'OPEN'; updateData.closedAt = null }

    const deal = await prisma.deal.update({ where: { id }, data: updateData, include: { stage: true } })

    const actType = status === 'WON' ? 'won' : status === 'LOST' ? 'lost' : 'stage_change'
    const actNote = status === 'WON'
      ? 'تم إغلاق الصفقة بنجاح 🎉'
      : status === 'LOST'
      ? `خُسرت الصفقة${lostReason ? ': ' + lostReason : ''}`
      : `انتقلت من "${existing.stage.name}" إلى مرحلة جديدة`

    await prisma.dealActivity.create({ data: { dealId: id, type: actType, note: actNote } })

    res.json({ success: true, data: deal })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function addActivity(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id
    const { type, note } = req.body

    const existing = await prisma.deal.findFirst({ where: { id, merchantId } })
    if (!existing) {
      res.status(404).json({ success: false, message: 'الصفقة غير موجودة' })
      return
    }

    const activity = await prisma.dealActivity.create({ data: { dealId: id, type: type || 'note', note } })
    await prisma.deal.update({ where: { id }, data: { lastActivityAt: new Date() } })

    res.status(201).json({ success: true, data: activity })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function getActivities(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id

    const existing = await prisma.deal.findFirst({ where: { id, merchantId } })
    if (!existing) {
      res.status(404).json({ success: false, message: 'الصفقة غير موجودة' })
      return
    }

    const activities = await prisma.dealActivity.findMany({ where: { dealId: id }, orderBy: { createdAt: 'desc' } })
    res.json({ success: true, data: activities })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function getReports(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    await ensureStages(merchantId)

    const { from, to } = req.query as Record<string, string>
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const dateTo   = to   ? new Date(to)   : new Date()

    const [deals, stages] = await Promise.all([
      prisma.deal.findMany({ where: { merchantId, createdAt: { gte: dateFrom, lte: dateTo } }, include: { stage: true } }),
      prisma.pipelineStage.findMany({ where: { merchantId }, orderBy: { order: 'asc' } }),
    ])

    const openDeals = deals.filter((d: any) => d.status === 'OPEN')
    const wonDeals  = deals.filter((d: any) => d.status === 'WON')
    const lostDeals = deals.filter((d: any) => d.status === 'LOST')

    const totalPipelineValue = openDeals.reduce((s: number, d: any) => s + Number(d.value), 0)
    const totalWonValue      = wonDeals.reduce((s: number, d: any)  => s + Number(d.value), 0)
    const conversionRate     = deals.length > 0 ? ((wonDeals.length / deals.length) * 100).toFixed(1) : '0'
    const avgDealValue       = deals.length > 0 ? (deals.reduce((s: number, d: any) => s + Number(d.value), 0) / deals.length).toFixed(2) : '0'

    const funnelData = stages.map((stage: any) => {
      const stageDeals = openDeals.filter((d: any) => d.stageId === stage.id)
      return { stage: stage.name, color: stage.color, count: stageDeals.length, value: stageDeals.reduce((s: number, d: any) => s + Number(d.value), 0) }
    })

    const monthlyMap: Record<string, { created: number; won: number; value: number }> = {}
    for (let i = 5; i >= 0; i--) {
      const d   = new Date(); d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = { created: 0, won: 0, value: 0 }
    }
    deals.forEach((d: any) => {
      const key = `${d.createdAt.getFullYear()}-${String(d.createdAt.getMonth() + 1).padStart(2, '0')}`
      if (monthlyMap[key]) {
        monthlyMap[key].created++
        monthlyMap[key].value += Number(d.value)
        if (d.status === 'WON') monthlyMap[key].won++
      }
    })

    res.json({
      success: true,
      data: {
        kpis:         { total: deals.length, open: openDeals.length, won: wonDeals.length, lost: lostDeals.length, totalPipelineValue, totalWonValue, conversionRate, avgDealValue },
        funnelData,
        monthlyTrend: Object.entries(monthlyMap).map(([month, v]) => ({ month, ...v })),
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}
