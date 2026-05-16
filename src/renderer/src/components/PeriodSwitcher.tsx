/**
 * PeriodSwitcher.tsx — 段考期切換下拉選單
 *
 * 顯示在標題列班級切換器旁邊。
 * 切換後 useAppStore.currentExamPeriodId 改變，
 * 所有頁面（學生分組、加分總覽、抽籤器、Excel 匯出）會跟著切換到該段考期。
 *
 * 沒有段考期時：自動觸發 PeriodSwitcher 顯示「建立第一次段考」按鈕。
 */

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAppStore } from '../store/useAppStore'
import {
  listByClass as listPeriods,
  createExamPeriod,
  deleteExamPeriod,
  getNextNumber
} from '../db/examPeriodRepo'
import { db } from '../db/schema'

const PeriodSwitcher: React.FC = () => {
  const classId            = useAppStore(s => s.currentClassId)
  const periodId           = useAppStore(s => s.currentExamPeriodId)
  const setCurrentPeriod   = useAppStore(s => s.setCurrentExamPeriod)

  const periods = useLiveQuery(
    () => classId ? listPeriods(classId) : Promise.resolve([]),
    [classId],
    []
  ) ?? []

  const [creating, setCreating]               = React.useState(false)
  // 建立新段考期對話框
  const [showCreateDialog, setShowCreateDialog] = React.useState(false)
  // 預設「保留」（安全優先，避免誤刪）；只有使用者主動選清空才清
  const [clearOldData, setClearOldData]         = React.useState(false)
  // 該班目前有多少加分/成績資料（決定要不要跳保留/清空選項）
  const [oldData, setOldData] =
    React.useState<{ events: number; scores: number } | null>(null)

  // 自動選取一期：若 periodId 不在 periods 中，預設選最新一期
  // 用 ref 確保每班只跑一次，避免 useLiveQuery 回傳新陣列 ref 導致 useEffect 反覆觸發。
  const autoSelectedClassRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!classId) return
    if (periods.length === 0) return
    if (autoSelectedClassRef.current === classId) return
    const exists = periodId && periods.some(p => p.id === periodId)
    if (exists) {
      autoSelectedClassRef.current = classId
      return
    }
    setCurrentPeriod(periods[periods.length - 1].id)
    autoSelectedClassRef.current = classId
  }, [periods, periodId, classId, setCurrentPeriod])

  // 沒有班級就不顯示
  if (!classId) return null

  // ── 開啟「建立下一次段考」對話框 ──
  // 先查該班有沒有加分/成績資料，有的話對話框才會跳「保留 / 清空」選項
  const openCreateDialog = async (): Promise<void> => {
    setClearOldData(false)        // 預設保留（安全）
    setOldData(null)
    setShowCreateDialog(true)
    if (!classId) return
    try {
      const events = await db.scoreEvents.where('classId').equals(classId).count()
      const exams  = await db.exams.where('classId').equals(classId).toArray()
      const examIds = exams.map(e => e.id)
      const scores = examIds.length > 0
        ? await db.examScores.where('examId').anyOf(examIds).count()
        : 0
      setOldData({ events, scores })
    } catch {
      setOldData({ events: 0, scores: 0 })
    }
  }

  // ── 刪除目前選中的段考期 ──
  const [deleting, setDeleting] = React.useState(false)
  const handleDeleteCurrent = async (): Promise<void> => {
    if (!periodId) return
    const cur = periods.find(p => p.id === periodId)
    if (!cur) return
    if (periods.length <= 1) {
      window.alert('每班至少保留一個段考期，無法刪除唯一一個。\n（可先建立另一個再刪這個）')
      return
    }
    const ok = window.confirm(
      `確定刪除「${cur.name}」？\n\n` +
      `會一併刪除這個段考期的小組與該期的加分記錄。\n` +
      `其他段考期不受影響。此動作無法復原。`
    )
    if (!ok) return
    setDeleting(true)
    try {
      await deleteExamPeriod(periodId)
      // 切到剩下段考期中最新的一個
      const remaining = periods.filter(p => p.id !== periodId)
      setCurrentPeriod(remaining[remaining.length - 1]?.id ?? null)
    } catch (e) {
      console.error(e)
      window.alert('刪除失敗：' + e)
    } finally {
      setDeleting(false)
    }
  }

  // ── 執行建立 + （可選）清舊資料 ──
  const handleCreateConfirm = async (): Promise<void> => {
    if (!classId) return
    setCreating(true)
    try {
      const nextNumber = await getNextNumber(classId)

      // 清空目前班的「全部段考期」的加分與考試成績（不刪段考期/小組結構）
      // 等於「學期中重新分組 = 從零累積新一輪」的語意
      if (clearOldData) {
        await db.transaction(
          'rw',
          [db.scoreEvents, db.exams, db.examScores],
          async () => {
            const exams = await db.exams.where('classId').equals(classId).toArray()
            const examIds = exams.map(e => e.id)
            if (examIds.length > 0) {
              await db.examScores.where('examId').anyOf(examIds).delete()
            }
            await db.exams.where('classId').equals(classId).delete()
            await db.scoreEvents.where('classId').equals(classId).delete()
          }
        )
      }

      const { period } = await createExamPeriod({
        classId,
        number: nextNumber,
        name:   `第${chineseNum(nextNumber)}次段考`
      })
      setCurrentPeriod(period.id)
      setShowCreateDialog(false)
    } catch (e) {
      console.error(e)
      window.alert('建立段考期失敗：' + e)
    } finally {
      setCreating(false)
    }
  }

  // 計算下一段考期編號（用於對話框顯示，不修改 DB）
  const [nextNum, setNextNum] = React.useState<number>(1)
  React.useEffect(() => {
    if (!showCreateDialog || !classId) return
    getNextNumber(classId).then(setNextNum).catch(() => setNextNum(1))
  }, [showCreateDialog, classId])

  // ── 沒有段考期：建立第一次段考的引導 ──
  if (periods.length === 0) {
    return (
      <button
        onClick={openCreateDialog}
        disabled={creating}
        className="
          flex items-center gap-2 px-3 h-9 rounded-lg
          bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200
          hover:bg-amber-100 disabled:opacity-50
        "
      >
        ⚠ 尚未建立段考期，點此建立第一次段考
      </button>
    )
  }

  // ── 一般狀態：下拉選單 + 建立下一次段考 ──
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-gray-500">段考期</span>
      <select
        value={periodId ?? ''}
        onChange={(e) => setCurrentPeriod(e.target.value || null)}
        className="
          appearance-none h-9 pl-2.5 pr-7 rounded-lg
          bg-white border border-gray-200
          text-xs font-medium text-gray-800
          hover:border-gray-300
          focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20
          bg-no-repeat
        "
        style={{
          backgroundImage:    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundPosition: 'right 6px center'
        }}
      >
        {periods.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <button
        onClick={openCreateDialog}
        disabled={creating || deleting}
        title="建立下一次段考"
        className="
          h-9 w-7 rounded-lg flex items-center justify-center
          text-brand-600 hover:bg-brand-50
          text-base font-bold
          disabled:opacity-50
        "
      >
        ＋
      </button>
      {periods.length > 1 && (
        <button
          onClick={handleDeleteCurrent}
          disabled={creating || deleting}
          title="刪除目前段考期"
          className="
            h-9 w-7 rounded-lg flex items-center justify-center
            text-red-500 hover:bg-red-50
            text-sm
            disabled:opacity-50
          "
        >
          🗑
        </button>
      )}

      {/* ── 建立新段考期對話框 ── */}
      {showCreateDialog && (
        <CreatePeriodDialog
          nextNumber={nextNum}
          clearOldData={clearOldData}
          setClearOldData={setClearOldData}
          oldData={oldData}
          creating={creating}
          onConfirm={handleCreateConfirm}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  )
}

// ── 子元件：建立新段考期對話框 ────────────────────────────

interface CreateDialogProps {
  nextNumber:       number
  clearOldData:     boolean
  setClearOldData:  (v: boolean) => void
  /** 該班目前加分/成績筆數；null = 查詢中 */
  oldData:          { events: number; scores: number } | null
  creating:         boolean
  onConfirm:        () => void
  onCancel:         () => void
}

const CreatePeriodDialog: React.FC<CreateDialogProps> = ({
  nextNumber, clearOldData, setClearOldData, oldData, creating, onConfirm, onCancel
}) => {
  const name = `第${chineseNum(nextNumber)}次段考`
  const loading = oldData === null
  const hasOldData = !!oldData && (oldData.events > 0 || oldData.scores > 0)

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">📅 建立新段考期</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <p className="text-sm text-gray-700 mb-4">
          將建立 <span className="font-bold text-brand-700">{name}</span>，
          並自動產生 6 個新小組（學生需重新分組）。
        </p>

        {loading && (
          <p className="text-xs text-gray-400 mb-3">檢查舊資料中…</p>
        )}

        {/* 沒有舊加分/成績 → 不需選擇，直接告知 */}
        {!loading && !hasOldData && (
          <p className="text-[12px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
            目前這個班沒有任何加分或考試成績，直接建立即可。
          </p>
        )}

        {/* 有舊加分/成績 → 跳明確二選一 */}
        {!loading && hasOldData && (
          <div className="mb-3">
            <p className="text-sm font-semibold text-gray-800 mb-2">
              偵測到舊資料：加分 {oldData!.events} 筆、考試成績 {oldData!.scores} 筆。<br/>
              新段考期要如何處理？
            </p>

            <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer mb-2 ${
              !clearOldData ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'
            }`}>
              <input
                type="radio"
                name="oldDataChoice"
                checked={!clearOldData}
                onChange={() => setClearOldData(false)}
                className="mt-0.5 w-4 h-4"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-900">
                  ✅ 保留舊加分成績（建議）
                </p>
                <p className="text-[11px] text-green-700 mt-1 leading-relaxed">
                  舊段考期的加分與成績完整保留，可在加分總覽切回舊期查看。新段考期從 0 開始累積。
                </p>
              </div>
            </label>

            <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer ${
              clearOldData ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'
            }`}>
              <input
                type="radio"
                name="oldDataChoice"
                checked={clearOldData}
                onChange={() => setClearOldData(true)}
                className="mt-0.5 w-4 h-4"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-900">
                  🗑 清空舊加分成績
                </p>
                <p className="text-[11px] text-red-700 mt-1 leading-relaxed">
                  清掉這個班「所有段考期」的加分與考試成績，乾淨開始新一輪競賽。
                  <br/>⚠ 無法復原；建議先到「加分規則 → 資料備份」備份。
                </p>
              </div>
            </label>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={creating}
            className="h-10 px-4 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={creating || loading}
            className={`h-10 px-4 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${
              clearOldData
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {creating ? '建立中…' : clearOldData ? '清空並建立' : '建立'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 工具 ──
function chineseNum(n: number): string {
  const map = ['零','一','二','三','四','五','六','七','八','九','十']
  if (n <= 10) return map[n] ?? String(n)
  if (n < 20) return `十${map[n - 10] ?? ''}`
  return String(n)
}

export default PeriodSwitcher
