import { Request, Response } from "express";
import { prisma } from "../config/database";
import { nanoid } from "nanoid";

// ─── List all checkouts for merchant ─────────────────────────
export async function listCheckouts(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id;
    const checkouts = await prisma.hostedCheckout.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        checkoutId: true,
        name: true,
        description: true,
        currency: true,
        isActive: true,
        status: true,
        usageCount: true,
        totalRevenue: true,
        brandColor: true,
        theme: true,
        createdAt: true,
      },
    });
    return res.json({ success: true, data: { checkouts } });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

// ─── Create checkout ──────────────────────────────────────────
export async function createCheckout(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id;
    const {
      name,
      description,
      logoUrl,
      brandColor,
      theme,
      currency,
      allowedCurrencies,
      allowedMethods,
      requirePhone,
      requireAddress,
      allowNote,
      successUrl,
      cancelUrl,
      webhookUrl,
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: "name is required" });
    }

    const checkoutId = "ZRX-CHK-" + nanoid(8).toUpperCase();

    const checkout = await prisma.hostedCheckout.create({
      data: {
        merchantId,
        checkoutId,
        name,
        description,
        logoUrl,
        brandColor:        brandColor        || "#1A56DB",
        theme:             theme             || "DARK",
        currency:          currency          || "SAR",
        allowedCurrencies: allowedCurrencies || ["SAR", "USD", "AED"],
        allowedMethods:    allowedMethods    || ["CREDIT_CARD", "BANK_TRANSFER"],
        requirePhone:      requirePhone      ?? false,
        requireAddress:    requireAddress    ?? false,
        allowNote:         allowNote         ?? false,
        successUrl,
        cancelUrl,
        webhookUrl,
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        checkout,
        checkoutUrl: `https://pay.zyrix.co/checkout/${checkoutId}`,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

// ─── Get single checkout ──────────────────────────────────────
export async function getCheckout(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id;
    const { id } = req.params;

    const checkout = await prisma.hostedCheckout.findFirst({
      where: { id, merchantId },
      include: {
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!checkout) {
      return res.status(404).json({ success: false, error: "Checkout not found" });
    }

    return res.json({ success: true, data: { checkout } });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

// ─── Update checkout ──────────────────────────────────────────
export async function updateCheckout(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id;
    const { id } = req.params;

    const existing = await prisma.hostedCheckout.findFirst({
      where: { id, merchantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: "Checkout not found" });
    }

    const {
      name,
      description,
      logoUrl,
      brandColor,
      theme,
      currency,
      allowedCurrencies,
      allowedMethods,
      requirePhone,
      requireAddress,
      allowNote,
      successUrl,
      cancelUrl,
      webhookUrl,
      isActive,
    } = req.body;

    const updated = await prisma.hostedCheckout.update({
      where: { id },
      data: {
        ...(name              !== undefined && { name }),
        ...(description       !== undefined && { description }),
        ...(logoUrl           !== undefined && { logoUrl }),
        ...(brandColor        !== undefined && { brandColor }),
        ...(theme             !== undefined && { theme }),
        ...(currency          !== undefined && { currency }),
        ...(allowedCurrencies !== undefined && { allowedCurrencies }),
        ...(allowedMethods    !== undefined && { allowedMethods }),
        ...(requirePhone      !== undefined && { requirePhone }),
        ...(requireAddress    !== undefined && { requireAddress }),
        ...(allowNote         !== undefined && { allowNote }),
        ...(successUrl        !== undefined && { successUrl }),
        ...(cancelUrl         !== undefined && { cancelUrl }),
        ...(webhookUrl        !== undefined && { webhookUrl }),
        ...(isActive          !== undefined && { isActive }),
      },
    });

    return res.json({ success: true, data: { checkout: updated } });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

// ─── Delete checkout ──────────────────────────────────────────
export async function deleteCheckout(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id;
    const { id } = req.params;

    const existing = await prisma.hostedCheckout.findFirst({
      where: { id, merchantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: "Checkout not found" });
    }

    await prisma.hostedCheckout.delete({ where: { id } });

    return res.json({ success: true, data: { message: "Checkout deleted" } });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

// ─── Create session (public) ──────────────────────────────────
export async function createSession(req: Request, res: Response) {
  try {
    const { checkoutId } = req.params;
    const {
      amount,
      currency,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      customerNote,
      metadata,
    } = req.body;

    const checkout = await prisma.hostedCheckout.findFirst({
      where: { checkoutId, isActive: true },
    });

    if (!checkout) {
      return res.status(404).json({ success: false, error: "Checkout not found or inactive" });
    }

    if (!amount) {
      return res.status(400).json({ success: false, error: "amount is required" });
    }

    const sessionId = "ZRX-SES-" + nanoid(10).toUpperCase();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const session = await prisma.checkoutSession.create({
      data: {
        sessionId,
        checkoutId: checkout.id,
        amount,
        currency:        currency        || checkout.currency,
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        customerNote,
        metadata,
        expiresAt,
      },
    });

    await prisma.hostedCheckout.update({
      where: { id: checkout.id },
      data: { usageCount: { increment: 1 } },
    });

    return res.status(201).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        checkoutUrl: `https://pay.zyrix.co/checkout/${checkoutId}/pay/${session.sessionId}`,
        expiresAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

// ─── Get session (public) ─────────────────────────────────────
export async function getSession(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;

    const session = await prisma.checkoutSession.findUnique({
      where: { sessionId },
      include: {
        checkout: {
          select: {
            name: true,
            description: true,
            logoUrl: true,
            brandColor: true,
            theme: true,
            allowedMethods: true,
            allowedCurrencies: true,
            requirePhone: true,
            requireAddress: true,
            allowNote: true,
            merchant: {
              select: {
                name: true,
                businessName: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    if (new Date() > session.expiresAt) {
      return res.status(410).json({ success: false, error: "Session expired" });
    }

    return res.json({ success: true, data: { session } });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
