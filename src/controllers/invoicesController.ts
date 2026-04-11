// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Invoices Controller (Elite)
// e-Invoicing ZATCA + Auto Reminders + Overdue Detection
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../config/database";
import { parsePagination, buildMeta } from "../utils/pagination";

// ─── Types ───────────────────────────────────────────────────

interface EInvoiceRow {
  invoice_id: string;
  zatca_uuid: string;
  status: string;
  qr_data: string;
}

interface EInvoiceDetailRow {
  zatca_uuid: string;
  sequence_number: number;
  qr_data: string;
  status: string;
  submitted_at: string | null;
  accepted_at: string | null;
  created_at: string;
}

interface ReminderRow {
  id: string;
  trigger_day: number;
  channel: string;
  message: string;
  status: string;
  sent_at: string | null;
}

interface SeqRow {
  last_seq: number;
}

interface StatusSummaryRow {
  status: string;
  count: number;
  total_amount: number;
}

// ─── Helpers ─────────────────────────────────────────────────

function buildZatcaQr(params: {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  total: number;
  vat: number;
}): string {
  const encode = (tag: number, value: string): string => {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.from([tag, bytes.length, ...bytes]).toString("base64");
  };
  return [
    encode(1, params.sellerName),
    encode(2, params.vatNumber),
    encode(3, params.timestamp),
    encode(4, params.total.toFixed(2)),
    encode(5, params.vat.toFixed(2)),
  ].join("");
}

function buildReminderMessage(
  invoiceId: string,
  customerName: string,
  total: number,
  currency: string,
  triggerDay: number
): string {
  const amountStr = `${total.toLocaleString()} ${currency}`;
  if (triggerDay < 0)
    return `تذكير: فاتورة ${invoiceId} للعميل ${customerName} بمبلغ ${amountStr} تستحق خلال ${Math.abs(triggerDay)} أيام`;
  if (triggerDay === 0)
    return `تنبيه: فاتورة ${invoiceId} للعميل ${customerName} بمبلغ ${amountStr} تستحق اليوم`;
  return `متأخرة: فاتورة ${invoiceId} للعميل ${customerName} بمبلغ ${amountStr} متأخرة ${triggerDay} يوم`;
}

// ─── Controller ──────────────────────────────────────────────

export const invoicesController = {
  // ─── List ────────────────────────────────────────
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const pagination = parsePagination(
        req.query.page as string,
        req.query.limit as string
      );

      await prisma.$executeRawUnsafe(
        `UPDATE invoices SET status = 'OVERDUE'
         WHERE merchant_id = $1 AND status = 'SENT' AND due_date < NOW()`,
        merchantId
      );

      const [rows, total] = await Promise.all([
        prisma.invoice.findMany({
          where: { merchantId },
          orderBy: { createdAt: "desc" },
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
        }),
        prisma.invoice.count({ where: { merchantId } }),
      ]);

      const invIds = rows.map((r) => r.id);
      const einvoiceRows: EInvoiceRow[] =
        invIds.length > 0
          ? await prisma.$queryRawUnsafe<EInvoiceRow[]>(
              `SELECT invoice_id, zatca_uuid, status, qr_data
               FROM invoice_einvoice
               WHERE invoice_id = ANY($1::text[])`,
              invIds
            )
          : [];

      const einvoiceMap = new Map(
        einvoiceRows.map((e: EInvoiceRow) => [e.invoice_id, e])
      );

      const data = rows.map((inv) => {
        const ei = einvoiceMap.get(inv.id);
        return {
          ...inv,
          total: Number(inv.total),
          einvoice: ei
            ? { zatcaUuid: ei.zatca_uuid, status: ei.status, qrData: ei.qr_data }
            : null,
        };
      });

      res.json({
        success: true,
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Create ──────────────────────────────────────
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { customerName, total, currency, items, dueDate, taxRate } = req.body as {
        customerName: string;
        total: number;
        currency: string;
        items: unknown[];
        dueDate: string;
        taxRate?: number;
      };

      if (!customerName || total === undefined || !currency || !items || !dueDate) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "customerName, total, currency, items, dueDate are required" },
        });
        return;
      }

      const count = await prisma.invoice.count({ where: { merchantId: req.merchant.id } });
      const invoiceId = `ZRX-INV-${String(count + 1).padStart(3, "0")}`;

      const inv = await prisma.invoice.create({
        data: {
          merchantId: req.merchant.id,
          invoiceId,
          customerName,
          total,
          currency,
          items: items as never,
          status: "DRAFT",
          dueDate: new Date(dueDate),
        },
      });

      const reminderDays = [-3, 0, 3];
      for (const day of reminderDays) {
        const msg = buildReminderMessage(invoiceId, customerName, Number(total), currency, day);
        await prisma.$executeRawUnsafe(
          `INSERT INTO invoice_reminders (invoice_id, merchant_id, trigger_day, channel, message)
           VALUES ($1, $2, $3, 'PUSH', $4)`,
          inv.id, req.merchant.id, day, msg
        );
      }

      res.status(201).json({ success: true, data: { ...inv, total: Number(inv.total) } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Get By ID ───────────────────────────────────
  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const inv = await prisma.invoice.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!inv) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }

      const einvoiceRows = await prisma.$queryRawUnsafe<EInvoiceDetailRow[]>(
        `SELECT zatca_uuid, status, qr_data, sequence_number
         FROM invoice_einvoice WHERE invoice_id = $1`,
        inv.id
      );

      const reminderRows = await prisma.$queryRawUnsafe<ReminderRow[]>(
        `SELECT trigger_day, channel, status, sent_at
         FROM invoice_reminders WHERE invoice_id = $1 ORDER BY trigger_day`,
        inv.id
      );

      res.json({
        success: true,
        data: {
          ...inv,
          total: Number(inv.total),
          einvoice: einvoiceRows[0]
            ? {
                zatcaUuid: einvoiceRows[0].zatca_uuid,
                status: einvoiceRows[0].status,
                qrData: einvoiceRows[0].qr_data,
                sequenceNumber: Number(einvoiceRows[0].sequence_number),
              }
            : null,
          reminders: reminderRows.map((r: ReminderRow) => ({
            triggerDay: Number(r.trigger_day),
            channel: r.channel,
            status: r.status,
            sentAt: r.sent_at,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Update ──────────────────────────────────────
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.invoice.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!existing) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }
      const updated = await prisma.invoice.update({ where: { id: req.params.id }, data: req.body });
      res.json({ success: true, data: { ...updated, total: Number(updated.total) } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Delete ──────────────────────────────────────
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.invoice.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!existing) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }
      await prisma.invoice.delete({ where: { id: req.params.id } });
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Send ────────────────────────────────────────
  async send(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.invoice.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!existing) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }
      const updated = await prisma.invoice.update({ where: { id: req.params.id }, data: { status: "SENT" } });
      res.json({ success: true, data: { ...updated, total: Number(updated.total) } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Mark Paid ───────────────────────────────────
  async markPaid(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.invoice.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!existing) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }
      const updated = await prisma.invoice.update({
        where: { id: req.params.id },
        data: { status: "PAID", paidDate: new Date() },
      });
      res.json({ success: true, data: { ...updated, total: Number(updated.total) } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Generate e-Invoice ZATCA (Elite) ───────────
  async generateEInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const inv = await prisma.invoice.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
        include: { merchant: true },
      });
      if (!inv) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO invoice_sequence (merchant_id, last_seq)
         VALUES ($1, 1)
         ON CONFLICT (merchant_id) DO UPDATE SET last_seq = invoice_sequence.last_seq + 1`,
        req.merchant.id
      );

      const seqRows = await prisma.$queryRawUnsafe<SeqRow[]>(
        `SELECT last_seq FROM invoice_sequence WHERE merchant_id = $1`,
        req.merchant.id
      );
      const seqNum = Number(seqRows[0]?.last_seq ?? 1);

      const taxRate = (req.body?.taxRate as number) ?? 15;
      const totalNum = Number(inv.total);
      const vatAmount = totalNum * (taxRate / 100);

      const qrData = buildZatcaQr({
        sellerName: inv.merchant.businessName ?? inv.merchant.name,
        vatNumber: inv.merchant.merchantId,
        timestamp: inv.createdAt.toISOString(),
        total: totalNum,
        vat: vatAmount,
      });

      await prisma.$executeRawUnsafe(
        `INSERT INTO invoice_einvoice
           (invoice_id, merchant_id, sequence_number, qr_data, status)
         VALUES ($1, $2, $3, $4, 'GENERATED')
         ON CONFLICT (invoice_id) DO UPDATE
           SET sequence_number = $3, qr_data = $4, status = 'GENERATED'`,
        inv.id, req.merchant.id, seqNum, qrData
      );

      res.json({
        success: true,
        data: {
          invoiceId: inv.invoiceId,
          zatcaUuid: inv.id,
          sequenceNumber: seqNum,
          qrData,
          vatAmount: vatAmount.toFixed(2),
          total: totalNum.toFixed(2),
          status: "GENERATED",
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Get e-Invoice (Elite) ───────────────────────
  async getEInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const inv = await prisma.invoice.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!inv) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }

      const rows = await prisma.$queryRawUnsafe<EInvoiceDetailRow[]>(
        `SELECT zatca_uuid, sequence_number, qr_data, status, submitted_at, accepted_at, created_at
         FROM invoice_einvoice WHERE invoice_id = $1`,
        inv.id
      );

      if (rows.length === 0) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "e-Invoice not generated yet" } });
        return;
      }

      const r: EInvoiceDetailRow = rows[0];
      res.json({
        success: true,
        data: {
          zatcaUuid: r.zatca_uuid,
          sequenceNumber: Number(r.sequence_number),
          qrData: r.qr_data,
          status: r.status,
          submittedAt: r.submitted_at,
          acceptedAt: r.accepted_at,
          createdAt: r.created_at,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Send Reminder (Elite) ───────────────────────
  async sendReminder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const inv = await prisma.invoice.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!inv) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }

      const { triggerDay = 0, channel = "PUSH" } = req.body as {
        triggerDay?: number;
        channel?: string;
      };

      const message = buildReminderMessage(
        inv.invoiceId, inv.customerName, Number(inv.total), inv.currency, triggerDay
      );

      await prisma.$executeRawUnsafe(
        `INSERT INTO invoice_reminders (invoice_id, merchant_id, trigger_day, channel, message, sent_at, status)
         VALUES ($1, $2, $3, $4, $5, NOW(), 'SENT')`,
        inv.id, req.merchant.id, triggerDay, channel, message
      );

      res.json({
        success: true,
        data: { invoiceId: inv.invoiceId, triggerDay, channel, message, sentAt: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Get Reminders (Elite) ───────────────────────
  async getReminders(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const inv = await prisma.invoice.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!inv) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }

      const rows = await prisma.$queryRawUnsafe<ReminderRow[]>(
        `SELECT id, trigger_day, channel, message, status, sent_at
         FROM invoice_reminders
         WHERE invoice_id = $1
         ORDER BY trigger_day`,
        inv.id
      );

      res.json({
        success: true,
        data: rows.map((r: ReminderRow) => ({
          id: r.id,
          triggerDay: Number(r.trigger_day),
          channel: r.channel,
          message: r.message,
          status: r.status,
          sentAt: r.sent_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Overdue Summary (Elite) ─────────────────────
  async getOverdueSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;

      await prisma.$executeRawUnsafe(
        `UPDATE invoices SET status = 'OVERDUE'
         WHERE merchant_id = $1 AND status = 'SENT' AND due_date < NOW()`,
        merchantId
      );

      const rows = await prisma.$queryRawUnsafe<StatusSummaryRow[]>(
        `SELECT status,
                COUNT(*)::int AS count,
                COALESCE(SUM(total::numeric), 0)::float AS total_amount
         FROM invoices
         WHERE merchant_id = $1
         GROUP BY status`,
        merchantId
      );

      const summary: Record<string, { count: number; totalAmount: number }> = {};
      let overdueAmount = 0;
      let overdueCount = 0;

      for (const r of rows) {
        summary[r.status.toLowerCase()] = {
          count: Number(r.count),
          totalAmount: Number(r.total_amount),
        };
        if (r.status === "OVERDUE") {
          overdueAmount = Number(r.total_amount);
          overdueCount = Number(r.count);
        }
      }

      res.json({
        success: true,
        data: { summary, overdue: { count: overdueCount, totalAmount: overdueAmount } },
      });
    } catch (err) {
      next(err);
    }
  },
};
