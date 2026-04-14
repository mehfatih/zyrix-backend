import { Request, Response } from "express";
import { prisma } from "../config/database";

// ─── Token Validation Helper ──────────────────────────────────────────────────
// Portal uses customer.customerId as the token (UUID already unique)
// URL: /portal/tk_<customerId>
// Strip the "tk_" prefix if present

function extractCustomerId(token: string): string {
  return token.startsWith("tk_") ? token.slice(3) : token;
}

// ─── GET /api/customer-portal/profile ─────────────────────────────────────────
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers["x-portal-token"] as string;
    if (!token) { res.status(401).json({ success: false, error: "Token required" }); return; }

    const customerId = extractCustomerId(token);

    const customer = await prisma.customer.findUnique({
      where: { customerId },
      select: {
        id: true,
        customerId: true,
        name: true,
        phone: true,
        email: true,
        city: true,
        country: true,
        totalSpent: true,
        totalOrders: true,
        avgOrderValue: true,
        createdAt: true,
        merchant: {
          select: { businessName: true, name: true, currency: true },
        },
      },
    });

    if (!customer) { res.status(404).json({ success: false, error: "Customer not found" }); return; }

    res.json({ success: true, data: customer });
  } catch (err) {
    console.error("[CustomerPortal] getProfile:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ─── GET /api/customer-portal/invoices ────────────────────────────────────────
export const getInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers["x-portal-token"] as string;
    if (!token) { res.status(401).json({ success: false, error: "Token required" }); return; }

    const customerId = extractCustomerId(token);

    const customer = await prisma.customer.findUnique({ where: { customerId }, select: { id: true, merchantId: true, name: true } });
    if (!customer) { res.status(404).json({ success: false, error: "Customer not found" }); return; }

    // Invoices are matched by customerName since Invoice model has no customerId FK
    const invoices = await prisma.invoice.findMany({
      where: { merchantId: customer.merchantId, customerName: customer.name },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ success: true, data: invoices });
  } catch (err) {
    console.error("[CustomerPortal] getInvoices:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ─── GET /api/customer-portal/quotes ──────────────────────────────────────────
export const getQuotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers["x-portal-token"] as string;
    if (!token) { res.status(401).json({ success: false, error: "Token required" }); return; }

    const customerId = extractCustomerId(token);

    const customer = await prisma.customer.findUnique({ where: { customerId }, select: { id: true, merchantId: true } });
    if (!customer) { res.status(404).json({ success: false, error: "Customer not found" }); return; }

    const quotes = await prisma.quote.findMany({
      where: { merchantId: customer.merchantId, customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, quoteId: true, title: true, description: true,
        status: true, currency: true, subtotal: true, total: true,
        taxAmount: true, discountAmount: true,
        issueDate: true, expiryDate: true, sentAt: true,
        viewedAt: true, acceptedAt: true, rejectedAt: true,
        viewToken: true, items: true,
        customerName: true, customerEmail: true, customerPhone: true,
        headerNote: true, footerNote: true, terms: true,
      },
    });

    res.json({ success: true, data: quotes });
  } catch (err) {
    console.error("[CustomerPortal] getQuotes:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ─── POST /api/customer-portal/quotes/:id/respond ─────────────────────────────
export const respondToQuote = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers["x-portal-token"] as string;
    if (!token) { res.status(401).json({ success: false, error: "Token required" }); return; }

    const customerId = extractCustomerId(token);
    const { id } = req.params;
    const { action, note } = req.body as { action: "accept" | "reject"; note?: string };

    if (!["accept", "reject"].includes(action)) {
      res.status(400).json({ success: false, error: "action must be 'accept' or 'reject'" });
      return;
    }

    const customer = await prisma.customer.findUnique({ where: { customerId }, select: { id: true, merchantId: true } });
    if (!customer) { res.status(404).json({ success: false, error: "Customer not found" }); return; }

    const quote = await prisma.quote.findFirst({
      where: { id, merchantId: customer.merchantId, customerId: customer.id },
    });

    if (!quote) { res.status(404).json({ success: false, error: "Quote not found" }); return; }
    if (!["SENT", "VIEWED"].includes(quote.status)) {
      res.status(400).json({ success: false, error: "Quote cannot be responded to in its current status" });
      return;
    }

    const now = new Date();
    const updated = await prisma.quote.update({
      where: { id },
      data: {
        status: action === "accept" ? "ACCEPTED" : "REJECTED",
        acceptedAt: action === "accept" ? now : null,
        rejectedAt: action === "reject" ? now : null,
        activities: {
          create: {
            type: action === "accept" ? "ACCEPTED_BY_CUSTOMER" : "REJECTED_BY_CUSTOMER",
            note: note || null,
          },
        },
      },
    });

    res.json({ success: true, data: { status: updated.status, message: action === "accept" ? "تم قبول العرض" : "تم رفض العرض" } });
  } catch (err) {
    console.error("[CustomerPortal] respondToQuote:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ─── GET /api/customer-portal/loyalty ─────────────────────────────────────────
export const getLoyalty = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers["x-portal-token"] as string;
    if (!token) { res.status(401).json({ success: false, error: "Token required" }); return; }

    const customerId = extractCustomerId(token);

    const customer = await prisma.customer.findUnique({ where: { customerId }, select: { id: true, merchantId: true } });
    if (!customer) { res.status(404).json({ success: false, error: "Customer not found" }); return; }

    const loyaltyProfile = await prisma.loyaltyCustomer.findUnique({
      where: { merchantId_customerId: { merchantId: customer.merchantId, customerId: customer.id } },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    const settings = await prisma.loyaltySettings.findUnique({
      where: { merchantId: customer.merchantId },
      select: { pointValue: true, tiers: true, minRedeemPoints: true, expiryDays: true },
    });

    res.json({
      success: true,
      data: {
        profile: loyaltyProfile || null,
        settings: settings || null,
      },
    });
  } catch (err) {
    console.error("[CustomerPortal] getLoyalty:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ─── GET /api/customer-portal/transactions ────────────────────────────────────
export const getTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers["x-portal-token"] as string;
    if (!token) { res.status(401).json({ success: false, error: "Token required" }); return; }

    const customerId = extractCustomerId(token);

    const customer = await prisma.customer.findUnique({ where: { customerId }, select: { id: true, merchantId: true, phone: true, email: true } });
    if (!customer) { res.status(404).json({ success: false, error: "Customer not found" }); return; }

    // Match transactions by phone or email
    const orConditions: object[] = [];
    if (customer.phone) orConditions.push({ customerPhone: customer.phone });
    if (customer.email) orConditions.push({ customerEmail: customer.email });

    const transactions = orConditions.length > 0
      ? await prisma.transaction.findMany({
          where: { merchantId: customer.merchantId, OR: orConditions },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            transactionId: true, amount: true, currency: true,
            status: true, method: true, description: true, createdAt: true,
          },
        })
      : [];

    res.json({ success: true, data: transactions });
  } catch (err) {
    console.error("[CustomerPortal] getTransactions:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ─── GET /api/customer-portal/validate-token ─────────────────────────────────
// Quick endpoint to validate a token before rendering the portal page
export const validateToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const customerId = extractCustomerId(token);

    const customer = await prisma.customer.findUnique({
      where: { customerId },
      select: { customerId: true, name: true, merchantId: true, merchant: { select: { businessName: true, name: true } } },
    });

    if (!customer) { res.status(404).json({ success: false, valid: false }); return; }

    res.json({
      success: true,
      valid: true,
      data: {
        customerName: customer.name,
        merchantName: customer.merchant.businessName || customer.merchant.name,
      },
    });
  } catch (err) {
    console.error("[CustomerPortal] validateToken:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
