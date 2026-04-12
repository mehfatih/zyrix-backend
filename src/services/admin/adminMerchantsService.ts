// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Admin Merchants Service
// ─────────────────────────────────────────────────────────────
import { prisma } from "../../config/database";
import { PaginationParams } from "../../utils/pagination";
import { MerchantStatus } from "@prisma/client";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(
  email: string,
  name: string,
  merchantId: string,
  tempPassword: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: "Zyrix <noreply@zyrix.co>",
      to: email,
      subject: "Welcome to Zyrix — Your Account is Ready",
      html: `
        <!DOCTYPE html>
        <html dir="ltr" lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Welcome to Zyrix</title>
        </head>
        <body style="margin:0;padding:0;background:#EFF6FF;font-family:'Segoe UI',Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(26,86,219,0.10);">

                  <!-- HEADER -->
                  <tr>
                    <td style="background:linear-gradient(135deg,#1A56DB,#0B3EAD);padding:36px 40px;text-align:center;">
                      <h1 style="margin:0;color:#FFFFFF;font-size:30px;font-weight:900;letter-spacing:-0.5px;">Zyrix.</h1>
                      <p style="margin:8px 0 0;color:rgba(255,255,255,0.80);font-size:13px;font-weight:500;">Payment Gateway for MENA & Turkey</p>
                    </td>
                  </tr>

                  <!-- BODY -->
                  <tr>
                    <td style="padding:40px;">
                      <h2 style="margin:0 0 10px;color:#1E293B;font-size:22px;font-weight:800;">Welcome aboard, ${name}! 🎉</h2>
                      <p style="margin:0 0 28px;color:#64748B;font-size:15px;line-height:1.7;">
                        Your Zyrix merchant account has been created successfully. Here are your login credentials:
                      </p>

                      <!-- CREDENTIALS BOX -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F7FF;border-radius:14px;border:1.5px solid #BFDBFE;margin-bottom:24px;">
                        <tr>
                          <td style="padding:24px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr>
                                <td style="padding:10px 0;border-bottom:1px solid #DBEAFE;">
                                  <span style="color:#6B7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Merchant ID</span><br/>
                                  <span style="color:#1E293B;font-size:15px;font-weight:700;font-family:monospace;">${merchantId}</span>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding:10px 0;border-bottom:1px solid #DBEAFE;">
                                  <span style="color:#6B7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Email</span><br/>
                                  <span style="color:#1E293B;font-size:15px;font-weight:700;">${email}</span>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding:10px 0;">
                                  <span style="color:#6B7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Temporary Password</span><br/>
                                  <span style="color:#1A56DB;font-size:20px;font-weight:900;font-family:monospace;letter-spacing:0.06em;">${tempPassword}</span>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                      <!-- WARNING -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF3C7;border-radius:12px;border:1.5px solid #FCD34D;margin-bottom:28px;">
                        <tr>
                          <td style="padding:14px 18px;">
                            <p style="margin:0;color:#92400E;font-size:13px;font-weight:600;">
                              ⚠️ Please change your password immediately after logging in for the first time.
                            </p>
                          </td>
                        </tr>
                      </table>

                      <!-- CTA BUTTON -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                        <tr>
                          <td align="center">
                            <a href="https://zyrix.co/en/dashboard"
                               style="display:inline-block;background:linear-gradient(135deg,#1A56DB,#0B3EAD);color:#FFFFFF;font-size:16px;font-weight:800;text-decoration:none;padding:16px 44px;border-radius:12px;box-shadow:0 4px 14px rgba(26,86,219,0.30);">
                              Access My Dashboard →
                            </a>
                          </td>
                        </tr>
                      </table>

                      <!-- STEPS -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:12px;padding:4px;margin-bottom:8px;">
                        <tr>
                          <td style="padding:16px 20px 8px;">
                            <p style="margin:0 0 12px;color:#64748B;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Next Steps</p>
                          </td>
                        </tr>
                        ${[
                          ["📧", "Log in using your email and temporary password"],
                          ["🔑", "Change your password from account settings"],
                          ["⚙️", "Complete your business profile"],
                          ["💳", "Start accepting payments"],
                        ].map(([icon, text]) => `
                          <tr>
                            <td style="padding:6px 20px;">
                              <table cellpadding="0" cellspacing="0"><tr>
                                <td style="font-size:18px;padding-right:12px;vertical-align:middle;">${icon}</td>
                                <td style="color:#475569;font-size:14px;line-height:1.5;">${text}</td>
                              </tr></table>
                            </td>
                          </tr>
                        `).join("")}
                        <tr><td style="height:12px;"></td></tr>
                      </table>

                    </td>
                  </tr>

                  <!-- FOOTER -->
                  <tr>
                    <td style="background:#F0F7FF;padding:24px 40px;text-align:center;border-top:1.5px solid #DBEAFE;">
                      <p style="margin:0 0 8px;color:#94A3B8;font-size:12px;">Need help? Contact us anytime</p>
                      <p style="margin:0;font-size:12px;">
                        <a href="mailto:support@zyrix.co" style="color:#1A56DB;text-decoration:none;font-weight:600;">support@zyrix.co</a>
                        &nbsp;·&nbsp;
                        <a href="https://wa.me/905452210888" style="color:#1A56DB;text-decoration:none;font-weight:600;">WhatsApp Support</a>
                      </p>
                      <p style="margin:14px 0 0;color:#CBD5E1;font-size:11px;">© 2025 Zyrix. All rights reserved.</p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });
  } catch (err) {
    console.error("Failed to send welcome email:", err);
  }
}

export const adminMerchantsService = {
  async list(pagination: PaginationParams, search?: string) {
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { merchantId: { contains: search, mode: "insensitive" as const } },
            { businessName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};
    const [merchants, total] = await Promise.all([
      prisma.merchant.findMany({
        where,
        select: {
          id: true, merchantId: true, name: true, email: true, phone: true,
          businessName: true, businessType: true, country: true,
          status: true, kycStatus: true, currency: true,
          onboardingDone: true, createdAt: true,
          _count: { select: { transactions: true, disputes: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.merchant.count({ where }),
    ]);
    return { data: merchants, total };
  },

  async getById(id: string) {
    const merchant = await prisma.merchant.findUnique({
      where: { id },
      select: {
        id: true, merchantId: true, name: true, email: true, phone: true,
        businessName: true, businessType: true, country: true, timezone: true,
        language: true, currency: true, status: true, kycStatus: true,
        onboardingDone: true, createdAt: true, updatedAt: true,
        _count: { select: { transactions: true, disputes: true, settlements: true } },
      },
    });
    if (!merchant) return null;
    const [txStats, revenue] = await Promise.all([
      prisma.transaction.aggregate({
        where: { merchantId: id },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { merchantId: id, status: "SUCCESS", isCredit: true },
        _sum: { amount: true },
      }),
    ]);
    return {
      ...merchant,
      stats: {
        totalTransactions: txStats._count,
        totalVolume: parseFloat((txStats._sum.amount ?? 0).toString()),
        totalRevenue: parseFloat((revenue._sum.amount ?? 0).toString()),
      },
    };
  },

  async updateStatus(id: string, status: MerchantStatus) {
    return prisma.merchant.update({
      where: { id },
      data: { status },
      select: { id: true, merchantId: true, name: true, status: true },
    });
  },
};
