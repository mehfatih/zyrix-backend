// ─────────────────────────────────────────────────────────────
// src/controllers/quotes.controller.ts
// ─────────────────────────────────────────────────────────────
import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { AuthenticatedRequest } from '../types'
import { generateQuotePdf } from '../services/quote-pdf.service'
import { sendQuoteEmail } from '../services/quote-email.service'
import { v4 as uuidv4 } from 'uuid'

// ── helpers ──────────────────────────────────────────────────

function generateQuoteId(sequence: number): string {
  const year = new Date().getFullYear()
  const seq  = String(sequence).padStart(4, '0')
  return `QT-${year}-${seq}`
}

function calcTotals(
  items: any[],
  discountType: string | null,
  discountValue: number,
  taxRate: number
) {
  const subtotal = items.reduce((sum: number, item: any) => {
    const lineTotal = item.quantity * item.unitPrice * (1 - (item.discount || 0) / 100)
    item.total      = parseFloat(lineTotal.toFixed(2))
    return sum + lineTotal
  }, 0)

  let discountAmount = 0
  if (discountType === 'percent' && discountValue > 0) {
    discountAmount = (subtotal * discountValue) / 100
  } else if (discountType === 'fixed' && discountValue > 0) {
    discountAmount = discountValue
  }

  const taxable   = subtotal - discountAmount
  const taxAmount = taxRate > 0 ? (taxable * taxRate) / 100 : 0
  const total     = taxable + taxAmount

  return {
    subtotal:       parseFloat(subtotal.toFixed(2)),
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    taxAmount:      parseFloat(taxAmount.toFixed(2)),
    total:          parseFloat(total.toFixed(2)),
  }
}

// ── LIST ─────────────────────────────────────────────────────

export async function listQuotes(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    const { status, search, from, to, page = '1', limit = '20', sortBy = 'createdAt', sortDir = 'desc' } = req.query as Record<string, string>

    const where: any = { merchantId }
    if (status) where.status = status
    if (search) {
      where.OR = [
        { quoteId:      { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { title:        { contains: search, mode: 'insensitive' } },
      ]
    }
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to)   where.createdAt.lte = new Date(to)
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { [sortBy]: sortDir },
        include: { customer: { select: { id: true, name: true, email: true } } },
      }),
      prisma.quote.count({ where }),
    ])

    res.json({
      success: true, data: quotes,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── CREATE ────────────────────────────────────────────────────

export async function createQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    const {
      customerId, templateId, language = 'AR', customerName, customerEmail, customerPhone,
      customerCompany, customerAddress, title, description, currency = 'SAR',
      items = [], discountType, discountValue = 0, taxRate = 0,
      headerNote, footerNote, terms, expiryDate, dealId,
    } = req.body

    if (!customerName || !title || !items.length) {
      res.status(400).json({ success: false, message: 'customerName, title, items مطلوبة' })
      return
    }

    const count   = await prisma.quote.count({ where: { merchantId } })
    const quoteId = generateQuoteId(count + 1)
    const totals  = calcTotals(items, discountType, discountValue, taxRate)

    const quote = await prisma.quote.create({
      data: {
        merchantId, quoteId, customerId: customerId || null, templateId: templateId || null,
        language, status: 'DRAFT', customerName, customerEmail, customerPhone,
        customerCompany, customerAddress, title, description, currency, items,
        subtotal: totals.subtotal, discountType: discountType || null,
        discountValue: discountValue || null, discountAmount: totals.discountAmount,
        taxRate: taxRate || null, taxAmount: totals.taxAmount, total: totals.total,
        headerNote, footerNote, terms,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        dealId: dealId || null, viewToken: uuidv4(),
      },
    })

    await prisma.quoteActivity.create({
      data: { quoteId: quote.id, type: 'created', note: `تم إنشاء العرض ${quoteId}` },
    })

    res.status(201).json({ success: true, data: quote })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── GET ONE ───────────────────────────────────────────────────

export async function getQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id

    const quote = await prisma.quote.findFirst({
      where: { id, merchantId },
      include: { customer: true, template: true, activities: { orderBy: { createdAt: 'desc' } } },
    })

    if (!quote) {
      res.status(404).json({ success: false, message: 'العرض غير موجود' })
      return
    }

    if (quote.expiryDate && quote.expiryDate < new Date() && quote.status === 'SENT') {
      await prisma.quote.update({ where: { id }, data: { status: 'EXPIRED' } })
      await prisma.quoteActivity.create({ data: { quoteId: id, type: 'expired' } })
    }

    res.json({ success: true, data: quote })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── UPDATE ────────────────────────────────────────────────────

export async function updateQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id

    const existing = await prisma.quote.findFirst({ where: { id, merchantId } })
    if (!existing) {
      res.status(404).json({ success: false, message: 'العرض غير موجود' })
      return
    }
    if (['ACCEPTED', 'REJECTED'].includes(existing.status)) {
      res.status(400).json({ success: false, message: 'لا يمكن تعديل عرض مقبول أو مرفوض' })
      return
    }

    const { items, discountType, discountValue, taxRate, ...rest } = req.body

    let totalsData: any = {}
    if (items) {
      const totals = calcTotals(
        items,
        discountType ?? existing.discountType,
        discountValue ?? Number(existing.discountValue),
        taxRate ?? Number(existing.taxRate)
      )
      totalsData = {
        items,
        discountType:   discountType   ?? existing.discountType,
        discountValue:  discountValue  ?? existing.discountValue,
        discountAmount: totals.discountAmount,
        taxRate:        taxRate        ?? existing.taxRate,
        taxAmount:      totals.taxAmount,
        total:          totals.total,
        subtotal:       totals.subtotal,
      }
    }

    const updated = await prisma.quote.update({
      where: { id },
      data: { ...rest, ...totalsData, expiryDate: rest.expiryDate ? new Date(rest.expiryDate) : undefined, updatedAt: new Date() },
    })

    res.json({ success: true, data: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── DELETE ────────────────────────────────────────────────────

export async function deleteQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id

    const existing = await prisma.quote.findFirst({ where: { id, merchantId } })
    if (!existing) {
      res.status(404).json({ success: false, message: 'العرض غير موجود' })
      return
    }
    if (existing.status === 'ACCEPTED') {
      res.status(400).json({ success: false, message: 'لا يمكن حذف عرض مقبول' })
      return
    }

    await prisma.quote.delete({ where: { id } })
    res.json({ success: true, message: 'تم حذف العرض' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── SEND ──────────────────────────────────────────────────────

export async function sendQuote(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }          = req.params
    const merchantId      = req.merchant.id
    const { emailMessage } = req.body

    const quote = await prisma.quote.findFirst({ where: { id, merchantId } })
    if (!quote) {
      res.status(404).json({ success: false, message: 'العرض غير موجود' })
      return
    }
    if (!quote.customerEmail) {
      res.status(400).json({ success: false, message: 'لا يوجد إيميل للعميل' })
      return
    }

    await sendQuoteEmail({
      to:           quote.customerEmail,
      customerName: quote.customerName,
      quoteId:      quote.quoteId,
      total:        Number(quote.total),
      currency:     quote.currency,
      viewUrl:      `${process.env.FRONTEND_URL}/portal/quote/${quote.viewToken}`,
      message:      emailMessage,
      language:     quote.language as 'AR' | 'TR' | 'EN',
    })

    const updated = await prisma.quote.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } })
    await prisma.quoteActivity.create({ data: { quoteId: id, type: 'sent', note: `أُرسل إلى ${quote.customerEmail}` } })

    res.json({ success: true, data: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── CONVERT TO INVOICE ────────────────────────────────────────

export async function convertToInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id

    const quote = await prisma.quote.findFirst({ where: { id, merchantId } })
    if (!quote) {
      res.status(404).json({ success: false, message: 'العرض غير موجود' })
      return
    }
    if (quote.convertedToInvoiceId) {
      res.status(400).json({ success: false, message: 'تم تحويل هذا العرض مسبقاً' })
      return
    }

    const { dueDate } = req.body
    const invoiceCount = await prisma.invoice.count({ where: { merchantId } })
    const invoiceId    = `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(4, '0')}`

    const invoice = await prisma.invoice.create({
      data: {
        merchantId, invoiceId, customerName: quote.customerName,
        total: quote.total, currency: quote.currency, status: 'DRAFT',
        items: quote.items as any,
        dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    await prisma.quote.update({ where: { id }, data: { convertedToInvoiceId: invoice.id, status: 'ACCEPTED' } })
    await prisma.quoteActivity.create({
      data: { quoteId: id, type: 'converted', note: `تحويل إلى فاتورة ${invoiceId}`, metadata: { invoiceId: invoice.id } },
    })

    res.json({ success: true, data: { quote: { ...quote, convertedToInvoiceId: invoice.id }, invoice } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── PDF ───────────────────────────────────────────────────────

export async function downloadPdf(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id

    const quote = await prisma.quote.findFirst({ where: { id, merchantId }, include: { customer: true } })
    if (!quote) {
      res.status(404).json({ success: false, message: 'العرض غير موجود' })
      return
    }

    const merchant   = await prisma.merchant.findUnique({ where: { id: merchantId } })
    const pdfBuffer  = await generateQuotePdf(quote, merchant!)

    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${quote.quoteId}.pdf"` })
    res.send(pdfBuffer)
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── ACTIVITIES ────────────────────────────────────────────────

export async function getActivities(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }     = req.params
    const merchantId = req.merchant.id

    const quote = await prisma.quote.findFirst({ where: { id, merchantId } })
    if (!quote) {
      res.status(404).json({ success: false, message: 'العرض غير موجود' })
      return
    }

    const activities = await prisma.quoteActivity.findMany({ where: { quoteId: id }, orderBy: { createdAt: 'desc' } })
    res.json({ success: true, data: activities })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── REPORTS ───────────────────────────────────────────────────

export async function getReports(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    const { from, to, period = '30' } = req.query as Record<string, string>

    const dateFrom = from ? new Date(from) : new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000)
    const dateTo   = to   ? new Date(to)   : new Date()

    const quotes = await prisma.quote.findMany({ where: { merchantId, createdAt: { gte: dateFrom, lte: dateTo } } })

    const total    = quotes.length
    const byStatus = {
      DRAFT:    quotes.filter((q: any) => q.status === 'DRAFT').length,
      SENT:     quotes.filter((q: any) => q.status === 'SENT').length,
      VIEWED:   quotes.filter((q: any) => q.status === 'VIEWED').length,
      ACCEPTED: quotes.filter((q: any) => q.status === 'ACCEPTED').length,
      REJECTED: quotes.filter((q: any) => q.status === 'REJECTED').length,
      EXPIRED:  quotes.filter((q: any) => q.status === 'EXPIRED').length,
    }

    const acceptedQuotes  = quotes.filter((q: any) => q.status === 'ACCEPTED')
    const totalValue      = quotes.reduce((s: number, q: any) => s + Number(q.total), 0)
    const wonValue        = acceptedQuotes.reduce((s: number, q: any) => s + Number(q.total), 0)
    const conversionRate  = total > 0 ? ((byStatus.ACCEPTED / total) * 100).toFixed(1) : '0'
    const avgQuoteValue   = total > 0 ? (totalValue / total).toFixed(2) : '0'
    const avgTimeToAccept = acceptedQuotes.length > 0
      ? Math.round(
          acceptedQuotes.reduce((s: number, q: any) => {
            const diff = q.acceptedAt ? (q.acceptedAt.getTime() - q.createdAt.getTime()) / (1000 * 60 * 60 * 24) : 0
            return s + diff
          }, 0) / acceptedQuotes.length
        )
      : 0

    const monthlyMap: Record<string, { created: number; accepted: number; value: number }> = {}
    for (let i = 5; i >= 0; i--) {
      const d   = new Date(); d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = { created: 0, accepted: 0, value: 0 }
    }
    quotes.forEach((q: any) => {
      const key = `${q.createdAt.getFullYear()}-${String(q.createdAt.getMonth() + 1).padStart(2, '0')}`
      if (monthlyMap[key]) {
        monthlyMap[key].created++
        monthlyMap[key].value += Number(q.total)
        if (q.status === 'ACCEPTED') monthlyMap[key].accepted++
      }
    })

    res.json({
      success: true,
      data: {
        kpis:         { total, byStatus, totalValue, wonValue, conversionRate, avgQuoteValue, avgTimeToAccept },
        monthlyTrend: Object.entries(monthlyMap).map(([month, v]) => ({ month, ...v })),
        period:       { from: dateFrom, to: dateTo },
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── TEMPLATES ─────────────────────────────────────────────────

export async function listTemplates(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    const templates  = await prisma.quoteTemplate.findMany({ where: { merchantId }, orderBy: { isDefault: 'desc' } })
    res.json({ success: true, data: templates })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function createTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId                              = req.merchant.id
    const { name, language, headerNote, footerNote, terms, isDefault } = req.body

    if (isDefault) {
      await prisma.quoteTemplate.updateMany({ where: { merchantId }, data: { isDefault: false } })
    }

    const template = await prisma.quoteTemplate.create({
      data: { merchantId, name, language: language || 'AR', headerNote, footerNote, terms, isDefault: isDefault || false },
    })
    res.status(201).json({ success: true, data: template })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function updateTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id }            = req.params
    const merchantId        = req.merchant.id
    const { isDefault, ...rest } = req.body

    if (isDefault) {
      await prisma.quoteTemplate.updateMany({ where: { merchantId }, data: { isDefault: false } })
    }

    const template = await prisma.quoteTemplate.update({ where: { id }, data: { ...rest, isDefault: isDefault ?? undefined } })
    res.json({ success: true, data: template })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function deleteTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    await prisma.quoteTemplate.delete({ where: { id } })
    res.json({ success: true, message: 'تم الحذف' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── PUBLIC VIEW ───────────────────────────────────────────────

export async function viewPublicQuote(req: Request, res: Response): Promise<void> {
  try {
    const { viewToken } = req.params

    const quote = await prisma.quote.findUnique({
      where: { viewToken },
      include: { merchant: { select: { name: true, businessName: true, email: true, phone: true, currency: true } } },
    })

    if (!quote) {
      res.status(404).json({ success: false, message: 'العرض غير موجود' })
      return
    }

    const updates: any = { viewCount: { increment: 1 } }
    if (quote.status === 'SENT') { updates.status = 'VIEWED'; updates.viewedAt = new Date() }
    await prisma.quote.update({ where: { id: quote.id }, data: updates })

    if (quote.status === 'SENT') {
      await prisma.quoteActivity.create({ data: { quoteId: quote.id, type: 'viewed' } })
    }

    const { viewToken: _vt, ...safeQuote } = quote as any
    res.json({ success: true, data: safeQuote })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function acceptPublicQuote(req: Request, res: Response): Promise<void> {
  try {
    const { viewToken } = req.params
    const { signature } = req.body

    const quote = await prisma.quote.findUnique({ where: { viewToken } })
    if (!quote) {
      res.status(404).json({ success: false, message: 'العرض غير موجود' })
      return
    }
    if (['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(quote.status)) {
      res.status(400).json({ success: false, message: 'لا يمكن تغيير هذا العرض' })
      return
    }

    await prisma.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } })
    await prisma.quoteActivity.create({
      data: { quoteId: quote.id, type: 'accepted', note: 'قَبِل العميل العرض', metadata: signature ? { signature } : undefined },
    })

    res.json({ success: true, message: 'تم قبول العرض بنجاح' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export async function rejectPublicQuote(req: Request, res: Response): Promise<void> {
  try {
    const { viewToken } = req.params
    const { reason }    = req.body

    const quote = await prisma.quote.findUnique({ where: { viewToken } })
    if (!quote) {
      res.status(404).json({ success: false, message: 'العرض غير موجود' })
      return
    }
    if (['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(quote.status)) {
      res.status(400).json({ success: false, message: 'لا يمكن تغيير هذا العرض' })
      return
    }

    await prisma.quote.update({ where: { id: quote.id }, data: { status: 'REJECTED', rejectedAt: new Date() } })
    await prisma.quoteActivity.create({ data: { quoteId: quote.id, type: 'rejected', note: reason || 'رفض العميل العرض' } })

    res.json({ success: true, message: 'تم' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}
