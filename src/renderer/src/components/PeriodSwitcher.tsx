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
import { getClass } from '../db/classRepo'

const PeriodSwitcher: React.FC = () => {
  const classId            = useAppStore(s => s.currentClassId)
  const periodId           = useAppStore(s => s.currentExamPeriodId)
  const setCurrentPeriod   = useAppStore(s => s.setCurrentExamPeriod)

  const periods = useLiveQuery(
    () => classId ? listPeriods(classId) : Promise.resolve([]),
    [classId],
    []
  ) ?? []

  const [creating, setCreating] = React.useState(false)

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

  // ── 建立下一次段考 ──
  const handleCreateNext = async () => {
    if (!classId) return
    const nextNumber   = await getNextNumber(classId)
    const cls          = await getClass(classId)
    const groupCount   = cls?.defaultGroupCount ?? 6
    // 找目前最新一期（作為複製來源）
    const latestPeriod = periods.length > 0 ? periods[periods.length - 1] : null
    const ok = window.confirm(
      `要建立「第${chineseNum(nextNumber)}次段考」嗎？\n` +
      `會自動建立 ${groupCount} 個新小組，並保留目前的學生分組設定。\n\n` +
      `若需要調整分組，可到「學生與分組」頁面手動拖曳，或重新匯入 Excel。`
    )
    if (!ok) return
    setCreating(true)
    try {
      const { period } = await createExamPeriod({
        classId,
        number:     nextNumber,
        name:       `第${chineseNum(nextNumber)}次段考`,
        groupCount,
        copyAssignmentsFromPeriodId: latestPeriod?.id
      })
      setCurrentPeriod(period.id)
    } catch (e) {
      console.error(e)
      window.alert('建立段考期失敗：' + e)
    } finally {
      setCreating(false)
    }
  }

  // ── 沒有段考期：建立第一次段考的引導 ──
  if (periods.length === 0) {
    return (
      <button
        onClick={handleCreateNext}
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
        onClick={handleCreateNext}
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
