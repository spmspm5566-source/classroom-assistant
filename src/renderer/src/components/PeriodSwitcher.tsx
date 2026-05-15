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
  const [clearOldData, setClearOldData]         = React.useState(true)

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
  const openCreateDialog = (): void => {
    setClearOldData(true)   // 預設勾選「清空舊資料」
    setShowCreateDialog(true)
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
        disabled={creating}
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

      {/* ── 建立新段考期對話框 ── */}
      {showCreateDialog && (
        <CreatePeriodDialog
          nextNumber={nextNum}
          clearOldData={clearOldData}
          setClearOldData={setClearOldData}
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
  creating:         boolean
  onConfirm:        () => void
  onCancel:         () => void
}

const CreatePeriodDialog: React.FC<CreateDialogProps> = ({
  nextNumber, clearOldData, setClearOldData, creating, onConfirm, onCancel
}) => {
  const name = `第${chineseNum(nextNumber)}次段考`
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

        {/* 清舊資料 checkbox */}
        <label className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={clearOldData}
            onChange={e => setClearOldData(e.target.checked)}
            className="mt-0.5 w-4 h-4"
          />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              同時清空舊段考期的「加分記錄」與「考試成績」
            </p>
            <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
              ✅ 勾選（建議）：重新分組 = 重新計分。舊段考期的加分歷史會清掉，乾淨開始新一輪競賽。<br/>
              ❌ 取消：保留所有歷史加分（可在加分總覽切回舊段考期查看）。
            </p>
          </div>
        </label>

        {clearOldData && (
          <p className="text-[11px] text-red-700 mb-3 leading-relaxed">
            ⚠ 清空後無法復原；建議先到「加分規則 → 資料備份」做一份完整備份。
          </p>
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
            disabled={creating}
            className="h-10 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {creating ? '建立中…' : '建立'}
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
