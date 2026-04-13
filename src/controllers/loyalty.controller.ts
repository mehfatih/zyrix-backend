// ─────────────────────────────────────────────────────────────
// src/controllers/loyalty.controller.ts
// ─────────────────────────────────────────────────────────────
import { Response } from 'express'
import { prisma } from '../config/database'
import { AuthenticatedRequest } from '../types'

// ── Default Settings ──────────────────────────────────────────
const DEFAULT_SETTINGS = {
  pointsPerUnit:    1,      // نقطة لكل وحدة عملة
  unitAmount:       10,     // كل 10 ريال = نقطة
  pointValue:       0.1,    // قيمة النقطة الواحدة بالعملة
  expiryDays:       365,    // صلاحية النقاط
  minRedeemPoints:  100,    // الحد الأدنى للاسترداد
  tiers: [
    { name: 'Bronze',   minPoints: 0,    color: '#CD7F32', discount: 0    },
    { name: 'Silver',   minPoints: 500,  color: '#94A3B8', discount: 0.05 },
    { name: 'Gold',     minPoints: 2000, color: '#D97706', discount: 0.10 },
    { name: 'Platinum', minPoints: 5000, color: '#7C3AED', discount: 0.15 },
  ],
}

// ── Helper: get or create loyalty settings ────────────────────
async function getOrCreateSettings(merchantId: string) {
  let settings = await prisma.loyaltySettings.findUnique({ where: { merchantId } })
  if (!settings) {
    settings = await prisma.loyaltySettings.create({
      data: { merchantId, ...DEFAULT_SETTINGS },
    })
  }
  return settings
}

// ── Helper: calculate tier ────────────────────────────────────
function calculateTier(totalPoints: number, tiers: any[]) {
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints)
  return sorted.find(t => totalPoints >= t.minPoints) || tiers[0]
}

// ── SETTINGS ─────────────────────────────────────────────────

export async function getSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    const settings   = await getOrCreateSettings(merchantId)
    res.json({ success: true, data: settings })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function updateSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    const { pointsPerUnit, unitAmount, pointValue, expiryDays, minRedeemPoints, tiers } = req.body

    const settings = await prisma.loyaltySettings.upsert({
      where:  { merchantId },
      update: { pointsPerUnit, unitAmount, pointValue, expiryDays, minRedeemPoints, tiers: tiers ?? undefined },
      create: { merchantId, pointsPerUnit: pointsPerUnit ?? 1, unitAmount: unitAmount ?? 10, pointValue: pointValue ?? 0.1, expiryDays: expiryDays ?? 365, minRedeemPoints: minRedeemPoints ?? 100, tiers: tiers ?? DEFAULT_SETTINGS.tiers },
    })
    res.json({ success: true, data: settings })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── CUSTOMERS ─────────────────────────────────────────────────

export async function listCustomers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    const { search, tier, page = '1', limit = '20', sortBy = 'totalPoints', sortDir = 'desc' } = req.query as Record<string, string>

    const where: any = { merchantId }
    if (search) {
      where.customer = { OR: [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ]}
    }
    if (tier) where.currentTier = tier

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const [customers, total] = await Promise.all([
      prisma.loyaltyCustomer.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { [sortBy]: sortDir },
        include: { customer: { select: { id: true, name: true, email: true, phone: true } } },
      }),
      prisma.loyaltyCustomer.count({ where }),
    ])

    res.json({
      success: true, data: customers,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function getCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id

    const lc = await prisma.loyaltyCustomer.findFirst({
      where: { customerId: id, merchantId },
      include: {
        customer:      true,
        transactions:  { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })

    if (!lc) {
      res.status(404).json({ success: false, message: 'العميل غير موجود في برنامج الولاء' })
      return
    }
    res.json({ success: true, data: lc })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── AWARD POINTS ──────────────────────────────────────────────

export async function awardPoints(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    const { customerId, points, reason, orderId } = req.body

    if (!customerId || !points || points <= 0) {
      res.status(400).json({ success: false, message: 'customerId وpoints مطلوبان' })
      return
    }

    const settings = await getOrCreateSettings(merchantId)

    // Get or create loyalty customer
    let lc = await prisma.loyaltyCustomer.findFirst({ where: { customerId, merchantId } })
    if (!lc) {
      lc = await prisma.loyaltyCustomer.create({
        data: { merchantId, customerId, totalPoints: 0, activePoints: 0, redeemedPoints: 0, currentTier: 'Bronze' },
      })
    }

    // Calculate expiry
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + (settings.expiryDays || 365))

    // Create transaction
    await prisma.loyaltyTransaction.create({
      data: {
        loyaltyCustomerId: lc.id,
        merchantId,
        type:         'AWARD',
        points,
        balanceBefore: lc.activePoints,
        balanceAfter:  lc.activePoints + points,
        reason:        reason || 'منح نقاط',
        orderId:       orderId || null,
        expiresAt,
      },
    })

    // Update totals
    const newActive = lc.activePoints + points
    const newTotal  = lc.totalPoints  + points
    const tier      = calculateTier(newTotal, (settings.tiers as any[]) || DEFAULT_SETTINGS.tiers)

    const updated = await prisma.loyaltyCustomer.update({
      where: { id: lc.id },
      data:  { activePoints: newActive, totalPoints: newTotal, currentTier: tier.name },
      include: { customer: { select: { name: true, email: true } } },
    })

    res.status(201).json({ success: true, data: updated, message: `تم منح ${points} نقطة` })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── REDEEM POINTS ─────────────────────────────────────────────

export async function redeemPoints(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    const { customerId, points, reason, orderId } = req.body

    if (!customerId || !points || points <= 0) {
      res.status(400).json({ success: false, message: 'customerId وpoints مطلوبان' })
      return
    }

    const settings = await getOrCreateSettings(merchantId)

    const lc = await prisma.loyaltyCustomer.findFirst({ where: { customerId, merchantId } })
    if (!lc) {
      res.status(404).json({ success: false, message: 'العميل غير موجود في برنامج الولاء' })
      return
    }
    if (lc.activePoints < points) {
      res.status(400).json({ success: false, message: `رصيد النقاط غير كافٍ — متاح: ${lc.activePoints}` })
      return
    }
    if (points < (settings.minRedeemPoints || 100)) {
      res.status(400).json({ success: false, message: `الحد الأدنى للاسترداد: ${settings.minRedeemPoints} نقطة` })
      return
    }

    const discountValue = points * (Number(settings.pointValue) || 0.1)

    await prisma.loyaltyTransaction.create({
      data: {
        loyaltyCustomerId: lc.id,
        merchantId,
        type:          'REDEEM',
        points:        -points,
        balanceBefore: lc.activePoints,
        balanceAfter:  lc.activePoints - points,
        reason:        reason || 'استرداد نقاط',
        orderId:       orderId || null,
        discountValue,
      },
    })

    const newActive   = lc.activePoints - points
    const newRedeemed = lc.redeemedPoints + points
    const tier        = calculateTier(lc.totalPoints, (settings.tiers as any[]) || DEFAULT_SETTINGS.tiers)

    const updated = await prisma.loyaltyCustomer.update({
      where: { id: lc.id },
      data:  { activePoints: newActive, redeemedPoints: newRedeemed, currentTier: tier.name },
      include: { customer: { select: { name: true, email: true } } },
    })

    res.json({ success: true, data: { ...updated, discountValue }, message: `تم استرداد ${points} نقطة بقيمة ${discountValue}` })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── REPORTS ───────────────────────────────────────────────────

export async function getReports(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id

    const [settings, customers, transactions] = await Promise.all([
      getOrCreateSettings(merchantId),
      prisma.loyaltyCustomer.findMany({ where: { merchantId } }),
      prisma.loyaltyTransaction.findMany({
        where:   { merchantId },
        orderBy: { createdAt: 'desc' },
        take:    500,
      }),
    ])

    const totalActivePoints  = customers.reduce((s, c) => s + c.activePoints,  0)
    const totalRedeemedPoints = customers.reduce((s, c) => s + c.redeemedPoints, 0)
    const totalIssuedPoints  = customers.reduce((s, c) => s + c.totalPoints,    0)
    const enrolledCustomers  = customers.length
    const redemptionRate     = totalIssuedPoints > 0 ? ((totalRedeemedPoints / totalIssuedPoints) * 100).toFixed(1) : '0'
    const avgPointsPerCustomer = enrolledCustomers > 0 ? Math.round(totalActivePoints / enrolledCustomers) : 0

    // Tier distribution
    const tiers = (settings.tiers as any[]) || DEFAULT_SETTINGS.tiers
    const tierDist = tiers.map(t => ({
      name:  t.name,
      color: t.color,
      count: customers.filter(c => c.currentTier === t.name).length,
    }))

    // Monthly trend — آخر 6 أشهر
    const monthlyMap: Record<string, { awarded: number; redeemed: number }> = {}
    for (let i = 5; i >= 0; i--) {
      const d   = new Date(); d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = { awarded: 0, redeemed: 0 }
    }
    transactions.forEach(tx => {
      const key = `${tx.createdAt.getFullYear()}-${String(tx.createdAt.getMonth() + 1).padStart(2, '0')}`
      if (!monthlyMap[key]) return
      if (tx.type === 'AWARD')  monthlyMap[key].awarded  += tx.points
      if (tx.type === 'REDEEM') monthlyMap[key].redeemed += Math.abs(tx.points)
    })

    res.json({
      success: true,
      data: {
        kpis: { totalActivePoints, totalRedeemedPoints, totalIssuedPoints, enrolledCustomers, redemptionRate, avgPointsPerCustomer },
        tierDist,
        monthlyTrend: Object.entries(monthlyMap).map(([month, v]) => ({ month, ...v })),
        settings,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}
