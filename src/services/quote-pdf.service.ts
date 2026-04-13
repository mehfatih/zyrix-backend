// ─────────────────────────────────────────────────────────────
// src/services/quote-pdf.service.ts
// يستخدم pdfkit — npm install pdfkit @types/pdfkit
// ─────────────────────────────────────────────────────────────
import PDFDocument from 'pdfkit'

interface QuoteItem {
  description: string
  quantity: number
  unitPrice: number
  unit?: string
  discount?: number
  total: number
}

export async function generateQuotePdf(quote: any, merchant: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })
    const chunks: Buffer[] = []

    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end',  () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const isRtl = quote.language === 'AR'
    const colors = {
      primary:   '#0D9488',  // Teal — لون Quotes & Proposals
      secondary: '#F0FDFA',
      text:      '#0F172A',
      muted:     '#64748B',
      border:    '#E2E8F0',
      success:   '#059669',
      danger:    '#E11D48',
    }

    // ── Header ────────────────────────────────────────────────
    // Accent bar أعلى الصفحة
    doc.rect(0, 0, 595, 6).fill(colors.primary)

    // شعار / اسم الشركة
    doc.fillColor(colors.primary).fontSize(22).font('Helvetica-Bold')
       .text(merchant.businessName || merchant.name, 50, 30)

    // بيانات الشركة
    doc.fillColor(colors.muted).fontSize(9).font('Helvetica')
       .text(merchant.email || '', 50, 58)
       .text(merchant.phone || '', 50, 70)

    // عنوان العرض (يمين الصفحة)
    doc.fillColor(colors.text).fontSize(28).font('Helvetica-Bold')
       .text(isRtl ? 'عرض سعر' : (quote.language === 'TR' ? 'TEKLİF' : 'QUOTE'), 380, 30, { align: 'right', width: 165 })

    doc.fillColor(colors.muted).fontSize(10).font('Helvetica')
       .text(quote.quoteId, 380, 65, { align: 'right', width: 165 })

    // ── Info Grid ──────────────────────────────────────────────
    doc.moveTo(50, 95).lineTo(545, 95).strokeColor(colors.border).lineWidth(1).stroke()

    const infoY = 105
    // يسار — بيانات العميل
    doc.fillColor(colors.muted).fontSize(8).font('Helvetica-Bold')
       .text(isRtl ? 'إلى:' : 'TO:', 50, infoY)
    doc.fillColor(colors.text).fontSize(10).font('Helvetica-Bold')
       .text(quote.customerName, 50, infoY + 14)
    doc.fillColor(colors.muted).fontSize(9).font('Helvetica')
    if (quote.customerCompany) doc.text(quote.customerCompany, 50, infoY + 28)
    if (quote.customerEmail)   doc.text(quote.customerEmail,   50, infoY + 40)
    if (quote.customerPhone)   doc.text(quote.customerPhone,   50, infoY + 52)

    // يمين — تواريخ
    const labelX = 380; const valueX = 460
    const labels = isRtl
      ? ['تاريخ الإصدار:', 'تاريخ الانتهاء:', 'العملة:']
      : (quote.language === 'TR'
        ? ['Tarih:', 'Geçerlilik:', 'Para Birimi:']
        : ['Issue Date:', 'Expiry Date:', 'Currency:'])

    doc.fillColor(colors.muted).fontSize(8).font('Helvetica-Bold')
    doc.text(labels[0], labelX, infoY)
    doc.text(labels[1], labelX, infoY + 14)
    doc.text(labels[2], labelX, infoY + 28)

    doc.fillColor(colors.text).fontSize(9).font('Helvetica')
    doc.text(quote.issueDate?.toLocaleDateString('en-GB') || new Date().toLocaleDateString('en-GB'), valueX, infoY)
    doc.text(quote.expiryDate ? quote.expiryDate.toLocaleDateString('en-GB') : '—', valueX, infoY + 14)
    doc.text(quote.currency, valueX, infoY + 28)

    // ── Title / Description ───────────────────────────────────
    const titleY = 175
    doc.moveTo(50, titleY - 5).lineTo(545, titleY - 5).strokeColor(colors.border).lineWidth(1).stroke()

    doc.fillColor(colors.text).fontSize(13).font('Helvetica-Bold')
       .text(quote.title, 50, titleY)
    if (quote.description) {
      doc.fillColor(colors.muted).fontSize(9).font('Helvetica')
         .text(quote.description, 50, titleY + 18, { width: 495 })
    }

    // ── Items Table ───────────────────────────────────────────
    let tableY = quote.description ? titleY + 50 : titleY + 25

    // Table Header
    doc.rect(50, tableY, 495, 22).fill(colors.primary)
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
    const hLabels = isRtl
      ? ['الوصف', 'الكمية', 'سعر الوحدة', 'الخصم', 'الإجمالي']
      : (quote.language === 'TR'
        ? ['Açıklama', 'Miktar', 'Birim Fiyat', 'İndirim', 'Toplam']
        : ['Description', 'Qty', 'Unit Price', 'Discount', 'Total'])
    doc.text(hLabels[0], 56,  tableY + 7, { width: 195 })
    doc.text(hLabels[1], 255, tableY + 7, { width: 55,  align: 'center' })
    doc.text(hLabels[2], 310, tableY + 7, { width: 80,  align: 'right' })
    doc.text(hLabels[3], 390, tableY + 7, { width: 55,  align: 'right' })
    doc.text(hLabels[4], 445, tableY + 7, { width: 95,  align: 'right' })

    tableY += 22
    const items: QuoteItem[] = quote.items || []

    items.forEach((item, i) => {
      const rowH = 24
      if (i % 2 === 0) doc.rect(50, tableY, 495, rowH).fill(colors.secondary)
      else             doc.rect(50, tableY, 495, rowH).fill('#FFFFFF')

      doc.fillColor(colors.text).fontSize(9).font('Helvetica')
      doc.text(item.description, 56, tableY + 8, { width: 195 })
      doc.text(`${item.quantity}${item.unit ? ' ' + item.unit : ''}`, 255, tableY + 8, { width: 55,  align: 'center' })
      doc.text(item.unitPrice.toLocaleString(), 310, tableY + 8, { width: 80,  align: 'right' })
      doc.text(item.discount ? `${item.discount}%` : '—', 390, tableY + 8, { width: 55,  align: 'right' })
      doc.fillColor(colors.text).font('Helvetica-Bold')
      doc.text(item.total.toLocaleString(), 445, tableY + 8, { width: 95,  align: 'right' })

      tableY += rowH
    })

    doc.moveTo(50, tableY).lineTo(545, tableY).strokeColor(colors.border).lineWidth(1).stroke()

    // ── Totals ────────────────────────────────────────────────
    tableY += 10
    const totalsX = 380

    const totalsLabels = isRtl
      ? ['المجموع الفرعي:', 'الخصم:', `الضريبة (${quote.taxRate || 0}%):`, 'الإجمالي:']
      : (quote.language === 'TR'
        ? ['Ara Toplam:', 'İndirim:', `KDV (${quote.taxRate || 0}%):`, 'Genel Toplam:']
        : ['Subtotal:', 'Discount:', `Tax (${quote.taxRate || 0}%):`, 'Total:'])

    doc.fillColor(colors.muted).fontSize(9).font('Helvetica')
    ;[
      [totalsLabels[0], Number(quote.subtotal).toLocaleString()],
      [totalsLabels[1], `- ${Number(quote.discountAmount || 0).toLocaleString()}`],
      [totalsLabels[2], Number(quote.taxAmount || 0).toLocaleString()],
    ].forEach(([label, value]) => {
      doc.text(label as string, totalsX, tableY, { width: 120 })
      doc.text(`${value} ${quote.currency}`, totalsX + 120, tableY, { width: 75, align: 'right' })
      tableY += 16
    })

    // Total row — highlighted
    doc.rect(totalsX - 5, tableY - 3, 175, 24).fill(colors.primary)
    doc.fillColor('#FFFFFF').fontSize(12).font('Helvetica-Bold')
    doc.text(totalsLabels[3], totalsX, tableY + 4, { width: 120 })
    doc.text(`${Number(quote.total).toLocaleString()} ${quote.currency}`, totalsX + 120, tableY + 4, { width: 75, align: 'right' })
    tableY += 30

    // ── Notes / Terms ─────────────────────────────────────────
    if (quote.headerNote || quote.footerNote || quote.terms) {
      tableY += 10
      doc.moveTo(50, tableY).lineTo(545, tableY).strokeColor(colors.border).lineWidth(1).stroke()
      tableY += 10

      const notesLabel = isRtl ? 'ملاحظات:' : (quote.language === 'TR' ? 'Notlar:' : 'Notes:')
      const termsLabel = isRtl ? 'الشروط والأحكام:' : (quote.language === 'TR' ? 'Şartlar:' : 'Terms & Conditions:')

      if (quote.footerNote || quote.headerNote) {
        doc.fillColor(colors.primary).fontSize(9).font('Helvetica-Bold').text(notesLabel, 50, tableY)
        tableY += 14
        doc.fillColor(colors.muted).fontSize(9).font('Helvetica')
           .text(quote.footerNote || quote.headerNote, 50, tableY, { width: 495 })
        tableY += 30
      }
      if (quote.terms) {
        doc.fillColor(colors.primary).fontSize(9).font('Helvetica-Bold').text(termsLabel, 50, tableY)
        tableY += 14
        doc.fillColor(colors.muted).fontSize(9).font('Helvetica')
           .text(quote.terms, 50, tableY, { width: 495 })
      }
    }

    // ── Footer ────────────────────────────────────────────────
    doc.rect(0, 815, 595, 27).fill(colors.primary)
    doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica')
       .text(
         isRtl
           ? 'شكراً لثقتكم — هذا العرض صادر بواسطة منصة Zyrix'
           : (quote.language === 'TR'
             ? 'İlginiz için teşekkürler — Zyrix platformu tarafından oluşturuldu'
             : 'Thank you for your business — Generated by Zyrix Platform'),
         50, 821, { align: 'center', width: 495 }
       )

    doc.end()
  })
}
