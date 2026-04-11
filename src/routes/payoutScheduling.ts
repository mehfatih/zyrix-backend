// ─────────────────────────────────────────────────────────────
// app/(merchant)/payout-scheduling.tsx
// جدولة المدفوعات + Smart Cashflow + History
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, I18nManager, ActivityIndicator, RefreshControl,
  Modal, ListRenderItemInfo, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { COLORS } from '../../constants/colors'
import { useTranslation } from '../../hooks/useTranslation'
import { useTabBarHeight } from '../../hooks/useTabBarHeight'
import { payoutSchedulingApi } from '../../services/api'
import { InnerHeader } from '../../components/InnerHeader'
import { useToast } from '../../hooks/useToast'

const isRTL = I18nManager.isRTL

// ─── Types ────────────────────────────────────────────────────

interface Schedule {
  id: string
  name: string
  frequency: string
  dayOfWeek: number | null
  dayOfMonth: number | null
  amount: number | null
  currency: string
  bankName: string | null
  bankIban: string | null
  isActive: boolean
  nextPayoutAt: string | null
  lastPayoutAt: string | null
  totalPaid: number
  payoutCount: number
}

interface PayoutHistory {
  id: string
  scheduleId: string
  scheduleName: string
  frequency: string
  amount: number
  currency: string
  status: string
  bankName: string | null
  reference: string | null
  scheduledAt: string
  executedAt: string | null
}

interface CashflowInsights {
  bestDayOfWeek: number | null
  bestDayOfWeekAr: string | null
  bestDayOfMonth: number | null
  avgDailyRevenue: number
  avgWeeklyRevenue: number
  recommendedFrequency: string
  recommendation: string | null
  calculatedAt: string
}

// ─── Constants ────────────────────────────────────────────────

const FREQ_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  DAILY:   { label: 'يومي',      icon: '📅', color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  WEEKLY:  { label: 'أسبوعي',   icon: '📆', color: '#6366F1', bg: 'rgba(99,102,241,0.15)' },
  MONTHLY: { label: 'شهري',     icon: '🗓️', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  PENDING:    { color: '#6366F1', bg: 'rgba(99,102,241,0.15)',  label: 'معلّق' },
  PROCESSING: { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)',  label: 'جاري' },
  COMPLETED:  { color: '#10B981', bg: 'rgba(16,185,129,0.15)',  label: 'مكتمل' },
  FAILED:     { color: '#EF4444', bg: 'rgba(239,68,68,0.15)',   label: 'فشل' },
}

const DAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

// ─── Insights Card ────────────────────────────────────────────

function InsightsCard({ insights, loading }: { insights: CashflowInsights | null; loading: boolean }) {
  if (loading) return (
    <View style={inS.wrap}>
      <ActivityIndicator color="#F59E0B" size="small" />
    </View>
  )
  if (!insights) return null

  const freqCfg = FREQ_CONFIG[insights.recommendedFrequency] ?? FREQ_CONFIG.WEEKLY

  return (
    <View style={inS.wrap}>
      <View style={[inS.head, isRTL && { flexDirection: 'row-reverse' }]}>
        <View style={[inS.dot, { backgroundColor: '#F59E0B' }]} />
        <Text style={inS.title}>Smart Cashflow — توصية ذكية</Text>
      </View>

      <View style={[inS.recRow, { backgroundColor: freqCfg.bg, borderColor: freqCfg.color + '50' }]}>
        <Text style={inS.recIcon}>{freqCfg.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[inS.recFreq, { color: freqCfg.color }]}>
            التوتير الموصى به: {freqCfg.label}
          </Text>
          {insights.recommendation && (
            <Text style={inS.recDesc}>{insights.recommendation}</Text>
          )}
        </View>
      </View>

      <View style={inS.metrics}>
        {[
          { label: 'متوسط اليومي',   value: `${insights.avgDailyRevenue.toLocaleString()} ر.س`,  color: '#10B981' },
          { label: 'متوسط الأسبوعي', value: `${insights.avgWeeklyRevenue.toLocaleString()} ر.س`, color: '#6366F1' },
          { label: 'أفضل يوم أسبوعي', value: insights.bestDayOfWeekAr ?? '—',                  color: '#F59E0B' },
          { label: 'أفضل يوم شهري',   value: insights.bestDayOfMonth ? `اليوم ${insights.bestDayOfMonth}` : '—', color: '#06B6D4' },
        ].map((m, i) => (
          <View key={i} style={inS.metric}>
            <Text style={inS.metricLabel}>{m.label}</Text>
            <Text style={[inS.metricVal, { color: m.color }]}>{m.value}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
const inS = StyleSheet.create({
  wrap:       { marginHorizontal: 12, marginBottom: 10, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.4)', backgroundColor: COLORS.cardBg, padding: 12 },
  head:       { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  dot:        { width: 7, height: 7, borderRadius: 4 },
  title:      { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary },
  recRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 12 },
  recIcon:    { fontSize: 22, marginTop: 2 },
  recFreq:    { fontSize: 13, fontWeight: '800', marginBottom: 3 },
  recDesc:    { fontSize: 11, color: COLORS.textSecondary, lineHeight: 16, textAlign: 'right' },
  metrics:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric:     { width: '47%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 8, gap: 3 },
  metricLabel:{ fontSize: 9, color: COLORS.textMuted, fontWeight: '600', textAlign: 'right' },
  metricVal:  { fontSize: 13, fontWeight: '800', textAlign: 'right' },
})

// ─── Schedule Card ────────────────────────────────────────────

function ScheduleCard({ schedule, onExecute, onDelete, executing }: {
  schedule: Schedule
  onExecute: (id: string) => void
  onDelete: (id: string) => void
  executing: boolean
}) {
  const cfg = FREQ_CONFIG[schedule.frequency] ?? FREQ_CONFIG.WEEKLY
  const sym = schedule.currency === 'SAR' ? 'ر.س' : schedule.currency

  const nextDate = schedule.nextPayoutAt
    ? new Date(schedule.nextPayoutAt).toLocaleDateString('ar-SA')
    : '—'

  const daysUntil = schedule.nextPayoutAt
    ? Math.max(0, Math.floor((new Date(schedule.nextPayoutAt).getTime() - Date.now()) / 86400000))
    : null

  return (
    <View style={[scC.card, { backgroundColor: cfg.color + '12', borderColor: cfg.color + '35' }]}>
      {/* Header */}
      <View style={[scC.topRow, isRTL && scC.rowRTL]}>
        <View style={{ flex: 1 }}>
          <Text style={[scC.name, { color: cfg.color }]}>{schedule.name}</Text>
          <View style={[scC.freqBadge, { backgroundColor: cfg.bg, borderColor: cfg.color + '50' }]}>
            <Text style={[scC.freqTxt, { color: cfg.color }]}>{cfg.icon} {cfg.label}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[scC.amount, { color: cfg.color }]}>
            {schedule.amount ? `${schedule.amount.toLocaleString()} ${sym}` : 'كل الرصيد'}
          </Text>
          <View style={[scC.activeBadge, { backgroundColor: schedule.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)' }]}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: schedule.isActive ? '#10B981' : '#6B7280' }}>
              {schedule.isActive ? 'نشط' : 'متوقف'}
            </Text>
          </View>
        </View>
      </View>

      {/* Details */}
      <View style={scC.details}>
        {[
          { label: 'الدفع التالي', value: nextDate + (daysUntil !== null ? ` (${daysUntil} يوم)` : '') },
          { label: 'إجمالي المدفوع', value: `${schedule.totalPaid.toLocaleString()} ${sym}` },
          { label: 'عدد المدفوعات', value: String(schedule.payoutCount) },
        ].map((row, i) => (
          <View key={i} style={[scC.detailRow, isRTL && scC.rowRTL]}>
            <Text style={scC.detailLabel}>{row.label}</Text>
            <Text style={[scC.detailVal, { color: cfg.color }]}>{row.value}</Text>
          </View>
        ))}
        {schedule.bankName && (
          <View style={[scC.detailRow, isRTL && scC.rowRTL]}>
            <Text style={scC.detailLabel}>البنك</Text>
            <Text style={scC.detailVal}>{schedule.bankName}</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={[scC.actions, isRTL && scC.rowRTL]}>
        {schedule.isActive && (
          <TouchableOpacity
            style={[scC.btn, { backgroundColor: cfg.color + '20', borderColor: cfg.color + '50' }]}
            onPress={() => onExecute(schedule.id)}
            disabled={executing}
          >
            <Text style={[scC.btnTxt, { color: cfg.color }]}>
              {executing ? 'جاري...' : '▶ تنفيذ الآن'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[scC.btn, { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.3)' }]}
          onPress={() => onDelete(schedule.id)}
        >
          <Text style={[scC.btnTxt, { color: '#EF4444' }]}>🗑 حذف</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
const scC = StyleSheet.create({
  card:        { marginHorizontal: 12, marginBottom: 10, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  topRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  rowRTL:      { flexDirection: 'row-reverse' },
  name:        { fontSize: 15, fontWeight: '800', marginBottom: 6, textAlign: 'right' },
  freqBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-end' },
  freqTxt:     { fontSize: 10, fontWeight: '700' },
  amount:      { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  details:     { gap: 7, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10 },
  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  detailVal:   { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary },
  actions:     { flexDirection: 'row', gap: 8 },
  btn:         { flex: 1, paddingVertical: 9, borderRadius: 9, borderWidth: 1, alignItems: 'center' },
  btnTxt:      { fontSize: 12, fontWeight: '700' },
})

// ─── History Item ─────────────────────────────────────────────

function HistoryItem({ item }: { item: PayoutHistory }) {
  const st = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.PENDING
  const sym = item.currency === 'SAR' ? 'ر.س' : item.currency

  return (
    <View style={hiS.row}>
      <View style={[hiS.dot, { backgroundColor: st.color }]} />
      <View style={{ flex: 1 }}>
        <Text style={hiS.name}>{item.scheduleName}</Text>
        <Text style={hiS.ref}>{item.reference ?? '—'} · {new Date(item.createdAt ?? item.scheduledAt).toLocaleDateString('ar-SA')}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[hiS.amount, { color: '#10B981' }]}>
          {item.amount.toLocaleString()} {sym}
        </Text>
        <View style={[hiS.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[hiS.statusTxt, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>
    </View>
  )
}
const hiS = StyleSheet.create({
  row:         { flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dot:         { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  name:        { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'right', marginBottom: 2 },
  ref:         { fontSize: 10, color: COLORS.textMuted, textAlign: 'right' },
  amount:      { fontSize: 14, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  statusTxt:   { fontSize: 9, fontWeight: '700' },
})

// ─── Create Modal ─────────────────────────────────────────────

function CreateModal({ visible, onClose, onCreate, loading, insights }: {
  visible: boolean; onClose: () => void
  onCreate: (data: any) => void; loading: boolean
  insights: CashflowInsights | null
}) {
  const [name, setName]           = useState('')
  const [frequency, setFrequency] = useState('WEEKLY')
  const [dayOfWeek, setDayOfWeek] = useState(0)
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [amount, setAmount]       = useState('')
  const [bankName, setBankName]   = useState('')
  const [bankIban, setBankIban]   = useState('')

  const reset = () => {
    setName(''); setFrequency('WEEKLY'); setDayOfWeek(0)
    setDayOfMonth(1); setAmount(''); setBankName(''); setBankIban('')
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    onCreate({
      name: name.trim(),
      frequency,
      dayOfWeek: frequency === 'WEEKLY' ? dayOfWeek : undefined,
      dayOfMonth: frequency === 'MONTHLY' ? dayOfMonth : undefined,
      amount: amount ? parseFloat(amount) : undefined,
      bankName: bankName.trim() || undefined,
      bankIban: bankIban.trim() || undefined,
    })
    reset()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { onClose(); reset() }}>
      <View style={mdS.overlay}>
        <View style={[mdS.container, { maxHeight: '88%' }]}>
          <View style={mdS.head}>
            <Text style={mdS.title}>+ جدولة دفع جديدة</Text>
            <TouchableOpacity onPress={() => { onClose(); reset() }} style={mdS.closeBtn}>
              <Text style={mdS.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={mdS.body} showsVerticalScrollIndicator={false}>

            {/* Smart suggestion */}
            {insights?.recommendedFrequency && (
              <TouchableOpacity
                style={mdS.suggestion}
                onPress={() => {
                  setFrequency(insights.recommendedFrequency)
                  if (insights.bestDayOfWeek !== null) setDayOfWeek(insights.bestDayOfWeek)
                  if (insights.bestDayOfMonth !== null) setDayOfMonth(insights.bestDayOfMonth)
                }}
              >
                <Text style={mdS.suggestionTxt}>
                  💡 تطبيق التوصية الذكية: {FREQ_CONFIG[insights.recommendedFrequency]?.label}
                </Text>
              </TouchableOpacity>
            )}

            <TextInput
              placeholder="اسم الجدولة *"
              value={name} onChangeText={setName}
              style={mdS.input} placeholderTextColor={COLORS.textMuted}
              textAlign={isRTL ? 'right' : 'left'}
            />

            <Text style={mdS.label}>التكرار</Text>
            <View style={mdS.freqRow}>
              {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map(f => {
                const cfg = FREQ_CONFIG[f]
                return (
                  <TouchableOpacity
                    key={f}
                    style={[mdS.freqBtn, frequency === f && { backgroundColor: cfg.color + '25', borderColor: cfg.color }]}
                    onPress={() => setFrequency(f)}
                  >
                    <Text style={mdS.freqIcon}>{cfg.icon}</Text>
                    <Text style={[mdS.freqTxt, frequency === f && { color: cfg.color }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {frequency === 'WEEKLY' && (
              <>
                <Text style={mdS.label}>يوم الأسبوع</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  <View style={mdS.dayRow}>
                    {DAY_AR.map((day, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[mdS.dayBtn, dayOfWeek === i && mdS.dayActive]}
                        onPress={() => setDayOfWeek(i)}
                      >
                        <Text style={[mdS.dayTxt, dayOfWeek === i && mdS.dayActiveTxt]}>{day.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {frequency === 'MONTHLY' && (
              <>
                <Text style={mdS.label}>يوم الشهر (1-28)</Text>
                <TextInput
                  value={String(dayOfMonth)}
                  onChangeText={v => setDayOfMonth(Math.min(28, Math.max(1, parseInt(v) || 1)))}
                  style={mdS.input} keyboardType="number-pad"
                  placeholderTextColor={COLORS.textMuted}
                  textAlign={isRTL ? 'right' : 'left'}
                />
              </>
            )}

            <TextInput
              placeholder="المبلغ (اتركه فارغاً = كل الرصيد)"
              value={amount} onChangeText={setAmount}
              style={mdS.input} keyboardType="decimal-pad"
              placeholderTextColor={COLORS.textMuted}
              textAlign={isRTL ? 'right' : 'left'}
            />

            <TextInput
              placeholder="اسم البنك"
              value={bankName} onChangeText={setBankName}
              style={mdS.input} placeholderTextColor={COLORS.textMuted}
              textAlign={isRTL ? 'right' : 'left'}
            />

            <TextInput
              placeholder="رقم IBAN"
              value={bankIban} onChangeText={setBankIban}
              style={mdS.input} placeholderTextColor={COLORS.textMuted}
              textAlign={isRTL ? 'right' : 'left'}
            />

            <View style={[mdS.actions, isRTL && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity style={mdS.cancelBtn} onPress={() => { onClose(); reset() }}>
                <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[mdS.submitBtn, loading && { opacity: 0.6 }]}
                onPress={handleSubmit} disabled={loading}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {loading ? 'جاري الإنشاء...' : 'إنشاء الجدولة'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const mdS = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  container:  { backgroundColor: COLORS.cardBg, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  head:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title:      { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  closeBtn:   { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeTxt:   { fontSize: 13, color: COLORS.textSecondary, fontWeight: '700' },
  body:       { padding: 16, gap: 10 },
  suggestion: { backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 9, borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)', padding: 10 },
  suggestionTxt: { fontSize: 12, color: '#F59E0B', fontWeight: '700', textAlign: 'right' },
  label:      { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'right' },
  input:      { backgroundColor: COLORS.surfaceBg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: COLORS.textPrimary, fontSize: 14 },
  freqRow:    { flexDirection: 'row', gap: 7 },
  freqBtn:    { flex: 1, paddingVertical: 10, borderRadius: 9, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', gap: 4 },
  freqIcon:   { fontSize: 18 },
  freqTxt:    { fontSize: 11, color: COLORS.textMuted, fontWeight: '700' },
  dayRow:     { flexDirection: 'row', gap: 6, paddingHorizontal: 2 },
  dayBtn:     { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.border },
  dayActive:  { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayTxt:     { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  dayActiveTxt: { color: '#fff' },
  actions:    { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn:  { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center', backgroundColor: COLORS.surfaceBg },
  submitBtn:  { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center', backgroundColor: COLORS.primary },
})

// ─── Main Screen ──────────────────────────────────────────────

export default function PayoutSchedulingScreen() {
  const { t } = useTranslation()
  const tabBarHeight = useTabBarHeight()
  const { showToast } = useToast()

  const [schedules, setSchedules]   = useState<Schedule[]>([])
  const [history, setHistory]       = useState<PayoutHistory[]>([])
  const [insights, setInsights]     = useState<CashflowInsights | null>(null)
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating]     = useState(false)
  const [executingId, setExecutingId] = useState<string | null>(null)
  const [activeTab, setActiveTab]   = useState<'schedules' | 'history'>('schedules')

  // ─── Fetch ──────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [schRes, histRes] = await Promise.allSettled([
        payoutSchedulingApi.list(),
        payoutSchedulingApi.getHistory(),
      ])
      if (schRes.status === 'fulfilled')  setSchedules(schRes.value?.data ?? [])
      if (histRes.status === 'fulfilled') setHistory(histRes.value?.data ?? [])
    } catch (_e) {}
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true)
    try {
      const res = await payoutSchedulingApi.getCashflowInsights()
      setInsights(res?.data ?? null)
    } catch (_e) {}
    setInsightsLoading(false)
  }, [])

  useEffect(() => { fetchData(); fetchInsights() }, [fetchData, fetchInsights])

  // ─── Handlers ───────────────────────────────────
  const handleCreate = async (data: any) => {
    setCreating(true)
    try {
      await payoutSchedulingApi.create(data)
      setShowCreate(false)
      showToast('تم إنشاء الجدولة بنجاح', 'success')
      fetchData()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'حدث خطأ', 'error')
    }
    setCreating(false)
  }

  const handleExecute = async (id: string) => {
    setExecutingId(id)
    try {
      const res = await payoutSchedulingApi.execute(id)
      showToast(res?.message ?? 'تم تنفيذ الدفع', 'success')
      fetchData()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'حدث خطأ', 'error')
    }
    setExecutingId(null)
  }

  const handleDelete = async (id: string) => {
    try {
      await payoutSchedulingApi.delete(id)
      showToast('تم حذف الجدولة', 'success')
      fetchData()
    } catch {
      showToast('حدث خطأ في الحذف', 'error')
    }
  }

  // ─── KPI ────────────────────────────────────────
  const totalPaid     = schedules.reduce((s, sc) => s + sc.totalPaid, 0)
  const activeCount   = schedules.filter(s => s.isActive).length
  const completedCount = history.filter(h => h.status === 'COMPLETED').length

  // ─── Render ─────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={sc.safe} edges={['top']}>
        <InnerHeader title="جدولة المدفوعات" accentColor="#6366F1" />
        <View style={sc.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      </SafeAreaView>
    )
  }

  const renderHeader = () => (
    <>
      {/* KPI */}
      <View style={[sc.kpiRow, isRTL && sc.rowRTL]}>
        {[
          { label: 'جداول نشطة',    value: String(activeCount),              color: '#6366F1' },
          { label: 'إجمالي المدفوع', value: `${(totalPaid/1000).toFixed(1)}k`, color: '#10B981' },
          { label: 'مدفوعات منجزة',  value: String(completedCount),           color: '#F59E0B' },
        ].map((k, i) => (
          <View key={i} style={[sc.kpiCard, { backgroundColor: k.color + '18', borderColor: k.color + '40' }]}>
            <Text style={[sc.kpiLabel, { color: k.color }]}>{k.label}</Text>
            <Text style={[sc.kpiValue, { color: k.color }]}>{k.value}</Text>
          </View>
        ))}
      </View>

      {/* Insights */}
      <InsightsCard insights={insights} loading={insightsLoading} />

      {/* Tabs */}
      <View style={sc.tabs}>
        <TouchableOpacity
          style={[sc.tab, activeTab === 'schedules' && sc.tabActive]}
          onPress={() => setActiveTab('schedules')}
        >
          <Text style={[sc.tabTxt, activeTab === 'schedules' && sc.tabActiveTxt]}>📅 الجداول ({schedules.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[sc.tab, activeTab === 'history' && sc.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[sc.tabTxt, activeTab === 'history' && sc.tabActiveTxt]}>📋 السجل ({history.length})</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'schedules' && (
        <View style={[sc.listHeader, isRTL && sc.rowRTL]}>
          <Text style={sc.listTitle}>الجداول</Text>
          <TouchableOpacity style={sc.createBtn} onPress={() => setShowCreate(true)}>
            <Text style={sc.createBtnTxt}>+ جدولة جديدة</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'history' && history.length > 0 && (
        <View style={sc.historyBox}>
          {history.map(item => <HistoryItem key={item.id} item={item} />)}
        </View>
      )}

      {activeTab === 'history' && history.length === 0 && (
        <View style={sc.empty}>
          <Text style={sc.emptyIcon}>📋</Text>
          <Text style={sc.emptyTxt}>لا يوجد سجل مدفوعات بعد</Text>
        </View>
      )}
    </>
  )

  const renderEmpty = () => activeTab === 'schedules' ? (
    <View style={sc.empty}>
      <Text style={sc.emptyIcon}>📅</Text>
      <Text style={sc.emptyTxt}>لا توجد جداول دفع بعد</Text>
      <TouchableOpacity style={[sc.createBtn, { marginTop: 8 }]} onPress={() => setShowCreate(true)}>
        <Text style={sc.createBtnTxt}>+ إنشاء جدولة</Text>
      </TouchableOpacity>
    </View>
  ) : null

  return (
    <SafeAreaView style={sc.safe} edges={['top']}>
      <InnerHeader title="جدولة المدفوعات" accentColor="#6366F1" />

      <FlatList
        data={activeTab === 'schedules' ? schedules : []}
        keyExtractor={item => item.id}
        renderItem={({ item }: ListRenderItemInfo<Schedule>) => (
          <ScheduleCard
            schedule={item}
            onExecute={handleExecute}
            onDelete={handleDelete}
            executing={executingId === item.id}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[sc.listContent, { paddingBottom: tabBarHeight }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }}
            tintColor={COLORS.primary} colors={[COLORS.primary]} />
        }
      />

      <CreateModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
        loading={creating}
        insights={insights}
      />
    </SafeAreaView>
  )
}

const sc = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: COLORS.darkBg },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingTop: 4 },
  kpiRow:      { flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingTop: 10 },
  rowRTL:      { flexDirection: 'row-reverse' },
  kpiCard:     { flex: 1, borderRadius: 11, borderWidth: 1.5, padding: 10, alignItems: 'center' },
  kpiLabel:    { fontSize: 9, fontWeight: '600', marginBottom: 4, textAlign: 'center' },
  kpiValue:    { fontSize: 17, fontWeight: '800' },
  tabs:        { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border, marginTop: 10 },
  tab:         { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:   { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabTxt:      { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  tabActiveTxt:{ color: COLORS.primary },
  listHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  listTitle:   { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  createBtn:   { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9 },
  createBtnTxt:{ color: COLORS.white, fontSize: 12, fontWeight: '700' },
  historyBox:  { marginHorizontal: 16, marginTop: 8 },
  empty:       { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyIcon:   { fontSize: 36 },
  emptyTxt:    { fontSize: 14, color: COLORS.textMuted, fontWeight: '500' },
})
