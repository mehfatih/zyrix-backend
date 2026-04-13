// ─────────────────────────────────────────────────────────────
// src/controllers/ai-cfo.controller.ts
// AI CFO Dashboard — يستخدم Anthropic API
// ─────────────────────────────────────────────────────────────
import { Response } from 'express'
import { prisma } from '../config/database'
import { AuthenticatedRequest } from '../types'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

// ── Helper: gather merchant financial data ────────────────────
async function gatherFinancialData(merchantId: string) {
  const now      = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const [
    txThisMonth, txLastMonth,
    invoices, expenses,
    settlements, disputes,
    revenueGoals,
  ] = await Promise.all([
    prisma.transaction.findMany({ where: { merchantId, createdAt: { gte: thisMonth }, status: 'SUCCESS' } }),
    prisma.transaction.findMany({ where: { merchantId, createdAt: { gte: lastMonth, lte: lastMonthEnd }, status: 'SUCCESS' } }),
    prisma.invoice.findMany({ where: { merchantId } }),
    prisma.expense.findMany({ where: { merchantId, date: { gte: thisMonth } } }),
    prisma.settlement.findMany({ where: { merchantId, status: 'COMPLETED', createdAt: { gte: thisMonth } } }),
    prisma.dispute.findMany({ where: { merchantId, status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
    prisma.revenueGoal.findMany({ where: { merchantId } }),
  ])

  const revenueThisMonth = txThisMonth.reduce((s, t) => s + Number(t.amount), 0)
  const revenueLastMonth = txLastMonth.reduce((s, t) => s + Number(t.amount), 0)
  const totalExpenses    = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const pendingInvoices  = invoices.filter(i => i.status === 'SENT' || i.status === 'OVERDUE')
  const pendingAmount    = pendingInvoices.reduce((s, i) => s + Number(i.total), 0)
  const overdueInvoices  = invoices.filter(i => i.status === 'OVERDUE')
  const settledAmount    = settlements.reduce((s, s2) => s + Number(s2.netAmount), 0)
  const revenueChange    = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100).toFixed(1) : '0'

  // Monthly trend — آخر 6 أشهر
  const monthlyRevenue: { month: string; revenue: number; expenses: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const dEnd  = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const txs   = await prisma.transaction.findMany({ where: { merchantId, createdAt: { gte: d, lte: dEnd }, status: 'SUCCESS' } })
    const exps  = await prisma.expense.findMany({ where: { merchantId, date: { gte: d, lte: dEnd } } })
    monthlyRevenue.push({ month: key, revenue: txs.reduce((s, t) => s + Number(t.amount), 0), expenses: exps.reduce((s, e) => s + Number(e.amount), 0) })
  }

  return {
    revenueThisMonth, revenueLastMonth, revenueChange,
    totalExpenses, netProfit: revenueThisMonth - totalExpenses,
    pendingInvoicesCount: pendingInvoices.length, pendingAmount,
    overdueCount: overdueInvoices.length,
    settledAmount, openDisputesCount: disputes.length,
    revenueGoals: revenueGoals.map(g => ({ name: g.name, target: Number(g.targetAmount), current: Number(g.currentAmount), currency: g.currency })),
    monthlyRevenue,
    txCount: txThisMonth.length,
  }
}

// ── SUMMARY ───────────────────────────────────────────────────
export async function getSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    const data       = await gatherFinancialData(merchantId)
    res.json({ success: true, data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── INSIGHTS (AI-generated) ───────────────────────────────────
export async function getInsights(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    const lang       = (req.query.lang as string) || 'AR'
    const data       = await gatherFinancialData(merchantId)

    const langMap: Record<string, string> = { AR: 'العربية', TR: 'التركية', EN: 'الإنجليزية' }
    const langName = langMap[lang] || 'العربية'

    const prompt = `أنت مدير مالي خبير (CFO). بناءً على البيانات المالية التالية، قدم 4-5 رؤى تحليلية مهمة وتوصيات عملية باللغة ${langName}.

البيانات المالية:
- إيراد هذا الشهر: ${data.revenueThisMonth.toLocaleString()}
- إيراد الشهر الماضي: ${data.revenueLastMonth.toLocaleString()}
- نسبة التغيير: ${data.revenueChange}%
- إجمالي المصاريف: ${data.totalExpenses.toLocaleString()}
- صافي الربح: ${data.netProfit.toLocaleString()}
- فواتير معلقة: ${data.pendingInvoicesCount} بقيمة ${data.pendingAmount.toLocaleString()}
- فواتير متأخرة: ${data.overdueCount}
- نزاعات مفتوحة: ${data.openDisputesCount}
- عدد المعاملات: ${data.txCount}

اكتب الرؤى بشكل مختصر وعملي. كل رؤية في سطر واحد. ابدأ كل رؤية بـ emoji مناسب.`

    const result  = await model.generateContent(prompt)
    const insights = result.response.text()
    res.json({ success: true, data: { insights, generatedAt: new Date() } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── REPORTS ───────────────────────────────────────────────────
export async function getReports(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id
    const data       = await gatherFinancialData(merchantId)
    res.json({ success: true, data: { ...data, generatedAt: new Date() } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── ASK AI ────────────────────────────────────────────────────
export async function askAI(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId     = req.merchant.id
    const { question, lang = 'AR' } = req.body

    if (!question || question.trim().length < 3) {
      res.status(400).json({ success: false, message: 'السؤال مطلوب' })
      return
    }

    const data = await gatherFinancialData(merchantId)
    const langMap: Record<string, string> = { AR: 'العربية', TR: 'التركية', EN: 'الإنجليزية' }
    const langName = langMap[lang] || 'العربية'

    const prompt = `أنت مدير مالي خبير (CFO) لشركة تجارة إلكترونية. أجب على السؤال التالي باللغة ${langName} بناءً على البيانات المالية المتاحة.

البيانات المالية الحالية:
- إيراد هذا الشهر: ${data.revenueThisMonth.toLocaleString()}
- إيراد الشهر الماضي: ${data.revenueLastMonth.toLocaleString()}
- نسبة التغيير: ${data.revenueChange}%
- إجمالي المصاريف: ${data.totalExpenses.toLocaleString()}
- صافي الربح: ${data.netProfit.toLocaleString()}
- فواتير معلقة: ${data.pendingInvoicesCount} بقيمة ${data.pendingAmount.toLocaleString()}
- فواتير متأخرة: ${data.overdueCount}
- نزاعات مفتوحة: ${data.openDisputesCount}
- الاتجاه الشهري: ${data.monthlyRevenue.map(m => `${m.month}: ${m.revenue.toLocaleString()}`).join(', ')}

السؤال: ${question}

أجب بشكل مختصر ومفيد وعملي.`

    const result = await model.generateContent(prompt)
    const answer  = result.response.text()
    res.json({ success: true, data: { question, answer, generatedAt: new Date() } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}
