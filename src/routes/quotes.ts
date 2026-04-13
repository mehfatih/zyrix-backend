// ─────────────────────────────────────────────────────────────
// app/(merchant)/quotes.tsx
// Zyrix App AR — Quotes & Proposals
// Color: #0D9488 (Teal)
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Alert, FlatList,
  Dimensions, Platform, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ── Constants ─────────────────────────────────────────────────
const COLOR        = '#0D9488'
const COLOR_BG     = '#F0FDFA'
const COLOR_BORDER = '#99F6E4'
const API_BASE     = 'https://zyrix-backend-production.up.railway.app'
const { width: SW } = Dimensions.get('window')

type QuoteStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'

const STATUS_CONFIG: Record<QuoteStatus, { label: string; color: string; bg: string }> = {
  DRAFT:    { label: 'مسودة',  color: '#64748B', bg: '#F1F5F9' },
  SENT:     { label: 'مُرسَل', color: '#2563EB', bg: '#EFF6FF' },
  VIEWED:   { label: 'مشاهَد', color: '#7C3AED', bg: '#F5F3FF' },
  ACCEPTED: { label: 'مقبول',  color: '#059669', bg: '#ECFDF5' },
  REJECTED: { label: 'مرفوض', color: '#E11D48', bg: '#FFF1F2' },
  EXPIRED:  { label: 'منتهي', color: '#D97706', bg: '#FFFBEB' },
}

interface QuoteItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  unit?: string
  discount?: number
  total: number
}

interface Quote {
  id: string
  quoteId: string
  status: QuoteStatus
  customerName: string
  customerEmail?: string
  customerPhone?: string
  customerCompany?: string
  title: string
  currency: string
  items: QuoteItem[]
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  taxRate?: number
  viewCount: number
  expiryDate?: string
  sentAt?: string
  acceptedAt?: string
  convertedToInvoiceId?: string
  createdAt: string
}

interface Reports {
  kpis: {
    total: number
    byStatus: Record<QuoteStatus, number>
    totalValue: number
    wonValue: number
    conversionRate: string
    avgQuoteValue: string
    avgTimeToAccept: number
  }
}

// ── API ───────────────────────────────────────────────────────
async function apiFetch(path: string, opts?: RequestInit) {
  const token = await AsyncStorage.getItem('token')
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers as any || {}) },
  })
  return res.json()
}

// ── KPI Card ──────────────────────────────────────────────────
function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={[s.kpiCard, { backgroundColor: `${color}0F`, borderColor: `${color}33`, borderTopColor: color }]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, { color: '#0F172A' }]}>{value}</Text>
    </View>
  )
}

// ── Status Badge ──────────────────────────────────────────────
function StatusBadge({ status }: { status: QuoteStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <View style={[s.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  )
}

// ── Quote Card (list item) ────────────────────────────────────
function QuoteCard({ quote, onPress }: { quote: Quote; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.quoteCard}>
      <View style={[s.quoteCardAccent, { backgroundColor: COLOR }]} />
      <View style={s.quoteCardContent}>
        <View style={s.quoteCardRow}>
          <Text style={s.quoteCardId}>{quote.quoteId}</Text>
          <StatusBadge status={quote.status} />
        </View>
        <Text style={s.quoteCardCustomer}>{quote.customerName}</Text>
        {quote.customerCompany ? <Text style={s.quoteCardCompany}>{quote.customerCompany}</Text> : null}
        <Text style={s.quoteCardTitle} numberOfLines={1}>{quote.title}</Text>
        <View style={s.quoteCardFooter}>
          <Text style={s.quoteCardTotal}>{Number(quote.total).toLocaleString('ar-SA')} {quote.currency}</Text>
          <View style={s.quoteCardMeta}>
            <Text style={s.quoteCardMetaText}>👁 {quote.viewCount}</Text>
            <Text style={[s.quoteCardMetaText, { marginRight: 10 }]}>
              {new Date(quote.createdAt).toLocaleDateString('ar-SA')}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ── Quote Detail Modal ────────────────────────────────────────
function QuoteDetailModal({ quote, onClose, onRefresh }: { quote: Quote; onClose: () => void; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false)
  const insets = useSafeAreaInsets()

  async function handleSend() {
    if (!quote.customerEmail) { Alert.alert('تنبيه', 'لا يوجد بريد إلكتروني للعميل'); return }
    setLoading(true)
    const res = await apiFetch(`/api/merchant/quotes/${quote.id}/send`, { method: 'POST', body: JSON.stringify({}) })
    setLoading(false)
    if (res.success) { Alert.alert('✅', 'تم إرسال العرض بنجاح'); onRefresh(); onClose() }
    else Alert.alert('خطأ', res.message)
  }

  async function handleConvert() {
    if (quote.convertedToInvoiceId) { Alert.alert('تنبيه', 'تم تحويل هذا العرض مسبقاً'); return }
    setLoading(true)
    const res = await apiFetch(`/api/merchant/quotes/${quote.id}/convert-invoice`, { method: 'POST', body: JSON.stringify({}) })
    setLoading(false)
    if (res.success) {
      Alert.alert('✅ تم', `رقم الفاتورة: ${res.data?.invoice?.invoiceId}`)
      onRefresh(); onClose()
    } else Alert.alert('خطأ', res.message)
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.detailContainer, { paddingTop: insets.top || 16 }]}>
        {/* Header */}
        <View style={[s.detailHeader, { backgroundColor: COLOR }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.detailHeaderSub}>{quote.quoteId}</Text>
            <Text style={s.detailHeaderTitle} numberOfLines={2}>{quote.title}</Text>
            <View style={{ marginTop: 8 }}><StatusBadge status={quote.status} /></View>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={{ color: '#fff', fontSize: 20 }}>×</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {/* Total */}
          <View style={[s.detailTotalBox, { backgroundColor: `${COLOR}0F`, borderColor: `${COLOR}33` }]}>
            <View>
              <Text style={s.detailTotalLabel}>الإجمالي</Text>
              <Text style={[s.detailTotalValue, { color: COLOR }]}>
                {Number(quote.total).toLocaleString('ar-SA')} {quote.currency}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.detailTotalLabel}>المشاهدات</Text>
              <Text style={s.detailTotalViews}>{quote.viewCount}</Text>
            </View>
          </View>

          {/* Actions */}
          {loading ? <ActivityIndicator color={COLOR} style={{ marginVertical: 16 }} /> : (
            <View style={s.actionsRow}>
              {(quote.status === 'DRAFT' || quote.status === 'VIEWED') && (
                <TouchableOpacity onPress={handleSend} style={[s.actionBtn, { backgroundColor: '#2563EB' }]}>
                  <Text style={s.actionBtnText}>📤 إرسال</Text>
                </TouchableOpacity>
              )}
              {(quote.status === 'ACCEPTED' || quote.status === 'VIEWED') && !quote.convertedToInvoiceId && (
                <TouchableOpacity onPress={handleConvert} style={[s.actionBtn, { backgroundColor: '#059669' }]}>
                  <Text style={s.actionBtnText}>🧾 فاتورة</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Customer */}
          <Text style={s.sectionTitle}>بيانات العميل</Text>
          <View style={s.infoBox}>
            {[
              { label: 'الاسم', val: quote.customerName },
              { label: 'الشركة', val: quote.customerCompany },
              { label: 'البريد', val: quote.customerEmail },
              { label: 'الهاتف', val: quote.customerPhone },
            ].filter(r => r.val).map(row => (
              <View key={row.label} style={s.infoRow}>
                <Text style={s.infoLabel}>{row.label}</Text>
                <Text style={s.infoValue}>{row.val}</Text>
              </View>
            ))}
          </View>

          {/* Items */}
          <Text style={s.sectionTitle}>البنود ({quote.items.length})</Text>
          {quote.items.map((item, i) => (
            <View key={item.id || i} style={[s.itemRow, { backgroundColor: i % 2 ? '#F8FAFC' : '#fff' }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemDesc}>{item.description}</Text>
                <Text style={s.itemMeta}>{item.quantity} × {Number(item.unitPrice).toLocaleString('ar-SA')}</Text>
              </View>
              <Text style={[s.itemTotal, { color: COLOR }]}>{Number(item.total).toLocaleString('ar-SA')}</Text>
            </View>
          ))}

          {/* Totals */}
          <View style={s.totalsBox}>
            {[
              { label: 'المجموع الفرعي', val: quote.subtotal },
              { label: 'الخصم', val: -Number(quote.discountAmount || 0) },
              { label: `الضريبة (${quote.taxRate || 0}%)`, val: quote.taxAmount },
            ].map(row => (
              <View key={row.label} style={s.totalRow}>
                <Text style={s.totalLabel}>{row.label}</Text>
                <Text style={s.totalVal}>{row.val < 0 ? '- ' : ''}{Math.abs(row.val).toLocaleString('ar-SA')} {quote.currency}</Text>
              </View>
            ))}
            <View style={[s.totalRow, s.totalFinalRow]}>
              <Text style={s.totalFinalLabel}>الإجمالي</Text>
              <Text style={[s.totalFinalVal, { color: COLOR }]}>{Number(quote.total).toLocaleString('ar-SA')} {quote.currency}</Text>
            </View>
          </View>

          {/* Dates */}
          <Text style={s.sectionTitle}>المتابعة</Text>
          <View style={s.infoBox}>
            {[
              { label: 'تاريخ الإنشاء', val: new Date(quote.createdAt).toLocaleDateString('ar-SA') },
              { label: 'تاريخ الإرسال', val: quote.sentAt ? new Date(quote.sentAt).toLocaleDateString('ar-SA') : '—' },
              { label: 'تاريخ القبول', val: quote.acceptedAt ? new Date(quote.acceptedAt).toLocaleDateString('ar-SA') : '—' },
              { label: 'تاريخ الانتهاء', val: quote.expiryDate ? new Date(quote.expiryDate).toLocaleDateString('ar-SA') : '—' },
            ].map(row => (
              <View key={row.label} style={s.infoRow}>
                <Text style={s.infoLabel}>{row.label}</Text>
                <Text style={s.infoValue}>{row.val}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

// ── Create Quote Modal ────────────────────────────────────────
function CreateQuoteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    customerName: '', customerEmail: '', customerPhone: '',
    customerCompany: '', title: '', currency: 'SAR', taxRate: 15,
    discountType: 'percent', discountValue: 0, terms: '', headerNote: '',
  })
  const [items, setItems] = useState<QuoteItem[]>([])

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  function addItem() {
    setItems(p => [...p, { id: Math.random().toString(), description: '', quantity: 1, unitPrice: 0, discount: 0, total: 0 }])
  }

  function updateItem(id: string, k: string, v: any) {
    setItems(p => p.map(item => {
      if (item.id !== id) return item
      const u = { ...item, [k]: v }
      u.total = parseFloat((u.quantity * u.unitPrice * (1 - (u.discount || 0) / 100)).toFixed(2))
      return u
    }))
  }

  const subtotal = items.reduce((s, i) => s + i.total, 0)
  const discAmt  = form.discountType === 'percent' ? subtotal * (form.discountValue / 100) : form.discountValue
  const taxAmt   = (subtotal - discAmt) * (form.taxRate / 100)
  const total    = subtotal - discAmt + taxAmt

  async function handleSave() {
    if (!form.customerName || !form.title) { Alert.alert('تنبيه', 'يرجى ملء اسم العميل وعنوان العرض'); return }
    if (!items.length) { Alert.alert('تنبيه', 'يرجى إضافة بند واحد على الأقل'); return }
    setSaving(true)
    const res = await apiFetch('/api/merchant/quotes', {
      method: 'POST',
      body: JSON.stringify({ ...form, items, subtotal, discountAmount: discAmt, taxAmount: taxAmt, total }),
    })
    setSaving(false)
    if (res.success) { onCreated(); onClose() }
    else Alert.alert('خطأ', res.message || 'حدث خطأ')
  }

  const inp = (k: string, label: string, ph: string, kb?: any) => (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.fieldInput}
        placeholder={ph}
        placeholderTextColor="#94A3B8"
        value={String(form[k as keyof typeof form] ?? '')}
        onChangeText={v => set(k, v)}
        keyboardType={kb}
      />
    </View>
  )

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.detailContainer, { paddingTop: insets.top || 16 }]}>
        <View style={[s.detailHeader, { backgroundColor: COLOR }]}>
          <Text style={s.detailHeaderTitle}>عرض سعر جديد</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={{ color: '#fff', fontSize: 20 }}>×</Text>
          </TouchableOpacity>
        </View>

        {/* Step Tabs */}
        <View style={s.stepTabs}>
          {([1, 2] as const).map(n => (
            <TouchableOpacity key={n} onPress={() => setStep(n)} style={[s.stepTab, step === n && { borderBottomColor: COLOR, borderBottomWidth: 2 }]}>
              <Text style={[s.stepTabText, { color: step === n ? COLOR : '#94A3B8' }]}>
                {n === 1 ? 'البيانات' : 'البنود'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {step === 1 ? (
            <View>
              <Text style={s.sectionTitle}>بيانات العميل</Text>
              {inp('customerName', 'اسم العميل *', 'مثال: أحمد محمد')}
              {inp('customerCompany', 'الشركة', 'اسم الشركة')}
              {inp('customerEmail', 'البريد الإلكتروني', 'email@example.com', 'email-address')}
              {inp('customerPhone', 'رقم الهاتف', '+966501234567', 'phone-pad')}

              <Text style={[s.sectionTitle, { marginTop: 20 }]}>تفاصيل العرض</Text>
              {inp('title', 'عنوان العرض *', 'عنوان مختصر')}

              <View style={s.field}>
                <Text style={s.fieldLabel}>العملة</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {['SAR', 'AED', 'TRY', 'USD', 'EUR', 'KWD'].map(c => (
                    <TouchableOpacity key={c} onPress={() => set('currency', c)}
                      style={[s.currencyBtn, form.currency === c && { backgroundColor: COLOR, borderColor: COLOR }]}>
                      <Text style={[s.currencyBtnText, form.currency === c && { color: '#fff' }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>نسبة الضريبة %</Text>
                <TextInput style={s.fieldInput} value={String(form.taxRate)} onChangeText={v => set('taxRate', parseFloat(v) || 0)} keyboardType="numeric" />
              </View>

              <TouchableOpacity onPress={() => setStep(2)} style={[s.primaryBtn, { marginTop: 24 }]}>
                <Text style={s.primaryBtnText}>التالي: إضافة البنود ←</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={s.sectionTitle}>البنود والخدمات</Text>
                <TouchableOpacity onPress={addItem} style={[s.primaryBtn, { paddingHorizontal: 16, paddingVertical: 8 }]}>
                  <Text style={s.primaryBtnText}>+ إضافة</Text>
                </TouchableOpacity>
              </View>

              {items.length === 0 && (
                <View style={s.emptyItems}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>📋</Text>
                  <Text style={{ color: '#94A3B8', textAlign: 'center' }}>لا توجد بنود بعد</Text>
                </View>
              )}

              {items.map((item, idx) => (
                <View key={item.id} style={[s.itemEditCard, { backgroundColor: idx % 2 ? '#F8FAFC' : '#fff' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ fontWeight: '700', color: COLOR, fontSize: 13 }}>بند {idx + 1}</Text>
                    <TouchableOpacity onPress={() => setItems(p => p.filter(i => i.id !== item.id))}
                      style={{ backgroundColor: '#FFF1F2', width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#E11D48', fontSize: 16 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput style={[s.fieldInput, { marginBottom: 10 }]} placeholder="وصف الخدمة أو المنتج" placeholderTextColor="#94A3B8"
                    value={item.description} onChangeText={v => updateItem(item.id, 'description', v)} />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>الكمية</Text>
                      <TextInput style={s.fieldInput} value={String(item.quantity)} keyboardType="numeric"
                        onChangeText={v => updateItem(item.id, 'quantity', parseFloat(v) || 1)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>سعر الوحدة</Text>
                      <TextInput style={s.fieldInput} value={String(item.unitPrice)} keyboardType="numeric"
                        onChangeText={v => updateItem(item.id, 'unitPrice', parseFloat(v) || 0)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>خصم %</Text>
                      <TextInput style={s.fieldInput} value={String(item.discount || 0)} keyboardType="numeric"
                        onChangeText={v => updateItem(item.id, 'discount', parseFloat(v) || 0)} />
                    </View>
                  </View>
                  <View style={[s.itemTotalChip, { backgroundColor: `${COLOR}0F`, borderColor: `${COLOR}33` }]}>
                    <Text style={{ fontSize: 12, color: '#64748B' }}>الإجمالي:</Text>
                    <Text style={{ fontWeight: '700', color: COLOR }}>{item.total.toLocaleString()} {form.currency}</Text>
                  </View>
                </View>
              ))}

              {items.length > 0 && (
                <View style={s.totalsBox}>
                  {[
                    { label: 'المجموع الفرعي', val: subtotal },
                    { label: 'الخصم', val: -discAmt },
                    { label: `الضريبة (${form.taxRate}%)`, val: taxAmt },
                  ].map(row => (
                    <View key={row.label} style={s.totalRow}>
                      <Text style={s.totalLabel}>{row.label}</Text>
                      <Text style={s.totalVal}>{row.val < 0 ? '- ' : ''}{Math.abs(row.val).toLocaleString()} {form.currency}</Text>
                    </View>
                  ))}
                  <View style={[s.totalRow, s.totalFinalRow]}>
                    <Text style={s.totalFinalLabel}>الإجمالي</Text>
                    <Text style={[s.totalFinalVal, { color: COLOR }]}>{total.toLocaleString()} {form.currency}</Text>
                  </View>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                <TouchableOpacity onPress={() => setStep(1)} style={[s.secondaryBtn, { flex: 1 }]}>
                  <Text style={s.secondaryBtnText}>← السابق</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSave} disabled={saving} style={[s.primaryBtn, { flex: 2 }]}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>✅ حفظ العرض</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

// ── Main Screen ───────────────────────────────────────────────
export default function QuotesScreen() {
  const insets = useSafeAreaInsets()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [reports, setReports] = useState<Reports | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [activeFilter, setActiveFilter] = useState<QuoteStatus | ''>('')
  const [activeTab, setActiveTab] = useState<'list' | 'reports'>('list')
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    const [qRes, rRes] = await Promise.all([
      apiFetch(`/api/merchant/quotes?status=${activeFilter}&search=${search}&limit=50`),
      apiFetch('/api/merchant/quotes/reports'),
    ])
    if (qRes.success) setQuotes(qRes.data)
    if (rRes.success) setReports(rRes.data)
    setLoading(false)
    setRefreshing(false)
  }, [activeFilter, search])

  useEffect(() => { setLoading(true); fetchData() }, [fetchData])

  const onRefresh = () => { setRefreshing(true); fetchData() }

  const filters: (QuoteStatus | '')[] = ['', 'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED']
  const filterLabels: Record<string, string> = { '': 'الكل', DRAFT: 'مسودة', SENT: 'مُرسَل', VIEWED: 'مشاهَد', ACCEPTED: 'مقبول', REJECTED: 'مرفوض', EXPIRED: 'منتهي' }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={s.headerIcon}>
            <Text style={{ fontSize: 18 }}>📄</Text>
          </View>
          <View>
            <Text style={s.headerTitle}>عروض الأسعار</Text>
            <Text style={s.headerSub}>Quotes & Proposals</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => setShowCreate(true)} style={s.newBtn}>
          <Text style={s.newBtnText}>+ جديد</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(['list', 'reports'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setActiveTab(t)} style={[s.tab, activeTab === t && { borderBottomColor: COLOR, borderBottomWidth: 2 }]}>
            <Text style={[s.tabText, { color: activeTab === t ? COLOR : '#94A3B8' }]}>
              {t === 'list' ? 'القائمة' : 'التقارير'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* KPI Strip */}
      {reports && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.kpiStrip}>
          <KpiCard label="إجمالي العروض" value={reports.kpis.total} color={COLOR} />
          <KpiCard label="معدل التحويل" value={`${reports.kpis.conversionRate}%`} color="#059669" />
          <KpiCard label="قيمة الإجمالية" value={Number(reports.kpis.totalValue).toLocaleString()} color="#2563EB" />
          <KpiCard label="المُكسَبة" value={Number(reports.kpis.wonValue).toLocaleString()} color="#D97706" />
          <KpiCard label="متوسط القيمة" value={Number(reports.kpis.avgQuoteValue).toLocaleString()} color="#7C3AED" />
        </ScrollView>
      )}

      {activeTab === 'list' ? (
        <>
          {/* Search */}
          <View style={s.searchBox}>
            <TextInput
              style={s.searchInput}
              placeholder="بحث بالاسم أو رقم العرض..."
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterStrip}>
            {filters.map(f => (
              <TouchableOpacity key={f || 'all'} onPress={() => setActiveFilter(f)}
                style={[s.filterChip, activeFilter === f && { backgroundColor: COLOR, borderColor: COLOR }]}>
                <Text style={[s.filterChipText, activeFilter === f && { color: '#fff' }]}>
                  {filterLabels[f]}
                  {f && reports ? ` (${reports.kpis.byStatus[f as QuoteStatus] || 0})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* List */}
          {loading ? (
            <View style={s.loadingCenter}><ActivityIndicator size="large" color={COLOR} /></View>
          ) : (
            <FlatList
              data={quotes}
              keyExtractor={q => q.id}
              renderItem={({ item }) => <QuoteCard quote={item} onPress={() => setSelectedQuote(item)} />}
              contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR} />}
              ListEmptyComponent={
                <View style={s.emptyState}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>📋</Text>
                  <Text style={s.emptyTitle}>لا توجد عروض أسعار</Text>
                  <Text style={s.emptySub}>اضغط "+ جديد" لإنشاء أول عرض</Text>
                  <TouchableOpacity onPress={() => setShowCreate(true)} style={[s.primaryBtn, { marginTop: 20 }]}>
                    <Text style={s.primaryBtnText}>+ إنشاء عرض</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}
        </>
      ) : (
        /* Reports Tab */
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR} />}>
          {reports && (
            <>
              <Text style={s.sectionTitle}>توزيع حالات العروض</Text>
              {(['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as QuoteStatus[]).map(st => {
                const count = reports.kpis.byStatus[st] || 0
                const pct = reports.kpis.total > 0 ? (count / reports.kpis.total) * 100 : 0
                const cfg = STATUS_CONFIG[st]
                return (
                  <View key={st} style={s.reportRow}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <View style={[s.badge, { backgroundColor: cfg.bg }]}>
                        <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      <Text style={{ fontWeight: '700', color: '#0F172A' }}>{count}</Text>
                    </View>
                    <View style={s.progressBg}>
                      <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: cfg.color }]} />
                    </View>
                  </View>
                )
              })}

              <Text style={[s.sectionTitle, { marginTop: 24 }]}>ملخص مالي</Text>
              <View style={s.infoBox}>
                {[
                  { label: 'إجمالي قيمة العروض', val: `${Number(reports.kpis.totalValue).toLocaleString()} SAR` },
                  { label: 'قيمة العروض المكسوبة', val: `${Number(reports.kpis.wonValue).toLocaleString()} SAR` },
                  { label: 'معدل التحويل', val: `${reports.kpis.conversionRate}%` },
                  { label: 'متوسط قيمة العرض', val: `${Number(reports.kpis.avgQuoteValue).toLocaleString()} SAR` },
                  { label: 'متوسط وقت القبول', val: `${reports.kpis.avgTimeToAccept} يوم` },
                ].map(row => (
                  <View key={row.label} style={s.infoRow}>
                    <Text style={s.infoLabel}>{row.label}</Text>
                    <Text style={s.infoValue}>{row.val}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {showCreate && <CreateQuoteModal onClose={() => setShowCreate(false)} onCreated={fetchData} />}
      {selectedQuote && <QuoteDetailModal quote={selectedQuote} onClose={() => setSelectedQuote(null)} onRefresh={fetchData} />}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F8FAFC' },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerIcon:       { width: 38, height: 38, backgroundColor: `${COLOR}15`, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle:      { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  headerSub:        { fontSize: 11, color: '#94A3B8' },
  newBtn:           { backgroundColor: COLOR, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  newBtnText:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  tabs:             { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tab:              { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabText:          { fontSize: 14, fontWeight: '600' },
  kpiStrip:         { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  kpiCard:          { padding: 14, borderRadius: 12, borderWidth: 1, borderTopWidth: 3, minWidth: 120 },
  kpiLabel:         { fontSize: 11, color: '#64748B', fontWeight: '500', marginBottom: 4 },
  kpiValue:         { fontSize: 18, fontWeight: '800' },
  searchBox:        { paddingHorizontal: 16, paddingBottom: 8 },
  searchInput:      { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 11, fontSize: 14, color: '#0F172A', textAlign: 'right' },
  filterStrip:      { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  filterChipText:   { fontSize: 13, color: '#475569', fontWeight: '500' },
  loadingCenter:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  quoteCard:        { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, flexDirection: 'row', borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  quoteCardAccent:  { width: 4 },
  quoteCardContent: { flex: 1, padding: 14 },
  quoteCardRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  quoteCardId:      { fontSize: 13, fontWeight: '700', color: COLOR },
  quoteCardCustomer:{ fontSize: 15, fontWeight: '700', color: '#0F172A' },
  quoteCardCompany: { fontSize: 12, color: '#94A3B8', marginBottom: 2 },
  quoteCardTitle:   { fontSize: 13, color: '#475569', marginTop: 3 },
  quoteCardFooter:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  quoteCardTotal:   { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  quoteCardMeta:    { flexDirection: 'row', alignItems: 'center' },
  quoteCardMetaText:{ fontSize: 12, color: '#94A3B8' },
  badge:            { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText:        { fontSize: 12, fontWeight: '600' },
  emptyState:       { alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyTitle:       { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  emptySub:         { fontSize: 13, color: '#94A3B8', textAlign: 'center' },

  // Detail Modal
  detailContainer:  { flex: 1, backgroundColor: '#F8FAFC' },
  detailHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20 },
  detailHeaderSub:  { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  detailHeaderTitle:{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 4, flex: 1 },
  closeBtn:         { backgroundColor: 'rgba(255,255,255,0.2)', width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detailTotalBox:   { borderRadius: 12, borderWidth: 1, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  detailTotalLabel: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  detailTotalValue: { fontSize: 24, fontWeight: '800' },
  detailTotalViews: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  actionsRow:       { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  actionBtn:        { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  actionBtnText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionTitle:     { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoBox:          { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', marginBottom: 20 },
  infoRow:          { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel:        { fontSize: 13, color: '#64748B' },
  infoValue:        { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  itemRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 4 },
  itemDesc:         { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  itemMeta:         { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  itemTotal:        { fontSize: 14, fontWeight: '700' },
  totalsBox:        { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginTop: 8 },
  totalRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  totalLabel:       { fontSize: 13, color: '#64748B' },
  totalVal:         { fontSize: 13, color: '#0F172A' },
  totalFinalRow:    { borderTopWidth: 2, borderTopColor: '#E2E8F0', marginTop: 6, paddingTop: 10 },
  totalFinalLabel:  { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  totalFinalVal:    { fontSize: 17, fontWeight: '800' },

  // Create Modal
  stepTabs:         { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  stepTab:          { flex: 1, paddingVertical: 14, alignItems: 'center' },
  stepTabText:      { fontSize: 15, fontWeight: '600' },
  field:            { marginBottom: 16 },
  fieldLabel:       { fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 6 },
  fieldInput:       { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 14, color: '#0F172A', textAlign: 'right' },
  currencyBtn:      { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff', marginRight: 8 },
  currencyBtnText:  { fontWeight: '600', color: '#475569' },
  primaryBtn:       { backgroundColor: COLOR, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn:     { backgroundColor: '#fff', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  secondaryBtnText: { color: '#475569', fontWeight: '600', fontSize: 15 },
  emptyItems:       { alignItems: 'center', padding: 32, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', marginBottom: 16 },
  itemEditCard:     { borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 10 },
  itemTotalChip:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 8, borderRadius: 8, borderWidth: 1 },

  // Reports
  reportRow:        { marginBottom: 16 },
  progressBg:       { height: 8, backgroundColor: '#F1F5F9', borderRadius: 10 },
  progressFill:     { height: 8, borderRadius: 10 },
})
