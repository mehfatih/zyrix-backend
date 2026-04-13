// ─────────────────────────────────────────────────────────────
// src/services/quote-email.service.ts
// يستخدم nodemailer أو Resend حسب SMTP_PROVIDER في .env
// ─────────────────────────────────────────────────────────────
import nodemailer from 'nodemailer'

interface SendQuoteEmailOptions {
  to: string
  customerName: string
  quoteId: string
  total: number
  currency: string
  viewUrl: string
  message?: string
  language: 'AR' | 'TR' | 'EN'
}

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST     || 'smtp.resend.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE   === 'true',
  auth: {
    user: process.env.SMTP_USER     || 'resend',
    pass: process.env.SMTP_PASS     || '',
  },
})

export async function sendQuoteEmail(opts: SendQuoteEmailOptions) {
  const { to, customerName, quoteId, total, currency, viewUrl, message, language } = opts

  const isAr = language === 'AR'
  const isTr = language === 'TR'

  const subject = isAr
    ? `عرض سعر جديد - ${quoteId}`
    : isTr
    ? `Yeni Teklif - ${quoteId}`
    : `New Quote - ${quoteId}`

  const greeting = isAr
    ? `مرحباً ${customerName}،`
    : isTr
    ? `Merhaba ${customerName},`
    : `Hello ${customerName},`

  const intro = isAr
    ? `يسعدنا تقديم عرض سعر بمبلغ <strong>${total.toLocaleString()} ${currency}</strong>`
    : isTr
    ? `<strong>${total.toLocaleString()} ${currency}</strong> tutarında bir teklif sunmaktan memnuniyet duyarız.`
    : `Please find attached a quote for <strong>${total.toLocaleString()} ${currency}</strong>.`

  const btnText = isAr ? 'عرض التفاصيل والموافقة' : isTr ? 'Teklifi Görüntüle' : 'View & Respond to Quote'
  const footerText = isAr ? 'شكراً لتعاملكم معنا' : isTr ? 'İlginiz için teşekkürler' : 'Thank you for your business'

  const html = `
<!DOCTYPE html>
<html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : isTr ? 'tr' : 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F8FAFC; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { background: #0D9488; padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 700; }
    .header p  { color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px; }
    .body { padding: 36px 40px; }
    .greeting { font-size: 18px; font-weight: 600; color: #0F172A; margin-bottom: 16px; }
    .intro    { font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 20px; }
    .custom-msg { background: #F0FDFA; border-left: 4px solid #0D9488; padding: 14px 18px; border-radius: 6px; font-size: 14px; color: #0F172A; margin-bottom: 28px; }
    .quote-box { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 20px 24px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: center; }
    .quote-id  { font-size: 13px; color: #64748B; }
    .quote-val { font-size: 22px; font-weight: 700; color: #0D9488; }
    .btn { display: inline-block; background: #0D9488; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; text-align: center; }
    .btn:hover { background: #0F766E; }
    .btn-wrap { text-align: center; margin: 28px 0; }
    .footer { background: #F8FAFC; padding: 20px 40px; text-align: center; font-size: 12px; color: #94A3B8; border-top: 1px solid #E2E8F0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Zyrix</h1>
      <p>${quoteId}</p>
    </div>
    <div class="body">
      <div class="greeting">${greeting}</div>
      <div class="intro">${intro}</div>
      ${message ? `<div class="custom-msg">${message}</div>` : ''}
      <div class="quote-box">
        <span class="quote-id">${quoteId}</span>
        <span class="quote-val">${total.toLocaleString()} ${currency}</span>
      </div>
      <div class="btn-wrap">
        <a href="${viewUrl}" class="btn">${btnText}</a>
      </div>
    </div>
    <div class="footer">
      ${footerText} · Zyrix Platform
    </div>
  </div>
</body>
</html>`

  await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'Zyrix'}" <${process.env.SMTP_FROM_EMAIL || 'noreply@zyrix.co'}>`,
    to,
    subject,
    html,
  })
}
