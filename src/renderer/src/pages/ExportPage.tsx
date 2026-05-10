/**
 * ExportPage.tsx — Excel 匯出設定頁
 *
 * 提供兩種匯出格式（對應 excelExport.ts）：
 *
 *  1. 段考期小組加分表（依老師提供的圖三格式）
 *     - 預設用「目前段考期」，可切換為其他段考期
 *     - 每組一張工作表
 *
 *  2. 加分明細表（所有 ScoreEvent）
 *     - 可選依段考期或全期間匯出
 *
 * 注意：需要先選班級+段考期才能匯出。
 */

import React from 'react'
import { useLiveQuery }     from 'dexie-react-hooks'
import { db }               from '../db/schema'
import type { ScoreEvent }  from '../db/schema'
import { useAppStore }      from '../store/useAppStore'
import { listByPeriod }     from '../db/groupRepo'
import { listByClass as listPeriods } from '../db/examPeriodRepo'
import {
  exportWeeklyGroupSheet,
  exportScoreLog
}                           from '../utils/excelExport'
import Button               from '../components/shared/Button'
import RuleSection          from '../components/rules/RuleSection'

// ── 主元件 ───────────────────────────────────────────────────

const ExportPage: React.FC = () => {
  const classId       = useAppStore(s => s.currentClassId)
  const currentPeriod = useAppStore(s => s.currentExamPeriodId)

  const [selectedPeriodId, setSelectedPeriodId] = React.useState<string | null>(currentPeriod)
  const [weeksCount,  setWeeksCount]  = React.useState(8)
  const [exporting1,  setExporting1]  = React.useState(false)
  const [exporting2,  setExporting2]  = React.useState(false)
  const [logScope, setLogScope]       = React.useState<'period' | 'all'>('period')

  // 同步預設選擇
  React.useEffect(() => {
    if (!selectedPeriodId && currentPeriod) setSelectedPeriodId(currentPeriod)
  }, [currentPeriod, selectedPeriodId])

  // ── DB 資料 ──
  const cls = useLiveQuery(
    () => classId ? db.classes.get(classId) : undefined,
    [classId]
  )

  const periods = useLiveQuery(
    () => classId ? listPeriods(classId) : Promise.resolve([]),
    [classId], []
  ) ?? []

  const groups = useLiveQuery(
    () => selectedPeriodId ? listByPeriod(selectedPeriodId) : Promise.resolve([]),
    [selectedPeriodId], []
  ) ?? []

  const students = useLiveQuery(
    () => classId ? db.students.where('classId').equals(classId).toArray() : [],
    [classId], []
  ) ?? []

  // 取得「該段考期內」所有事件
  const periodEvents: ScoreEvent[] = useLiveQuery(
    async (): Promise<ScoreEvent[]> => {
      if (!classId || !selectedPeriodId) return []
      return db.scoreEvents
        .where('[classId+examPeriodId]').equals([classId, selectedPeriodId])
        .toArray()
    },
    [classId, selectedPeriodId]
  ) ?? []

  // 取得「全期間」所有事件
  const allEvents: ScoreEvent[] = useLiveQuery(
    async (): Promise<ScoreEvent[]> => {
      if (!classId) return []
      return db.scoreEvents.where('classId').equals(classId).toArray()
    },
    [classId]
  ) ?? []

  // ── 無班級 ──
  if (!classId || !cls) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-center">
        <div className="text-5xl mb-4">📥</div>
        <p className="text-gray-500 text-sm">請先在標題列選擇班級，才能使用匯出功能。</p>
      </div>
    )
  }

  const selectedPeriod = periods.find(p => p.id === selectedPeriodId)

  // ── 匯出 1：段考期小組加分表 ──
  const handleExportWeekly = async () => {
    if (!selectedPeriod) {
      window.alert('請先選擇要匯出的段考期。')
      return
    }
    if (groups.length === 0) {
      window.alert('此段考期尚無小組資料。')
      return
    }
    setExporting1(true)
    try {
      await exportWeeklyGroupSheet({
        cls,
        groups,
        students,
        events:     periodEvents,
        weeksCount,
        examNumber: selectedPeriod.number,
        fileName:   `${selectedPeriod.name}_${cls.name}班_小組加分表.xlsx`
      })
    } catch (e) {
      console.error(e)
      window.alert('匯出失敗：' + String(e))
    } finally {
      setExporting1(false)
    }
  }

  // ── 匯出 2：加分明細 ──
  const handleExportLog = async () => {
    const evs = logScope === 'period' ? periodEvents : allEvents
    if (evs.length === 0) {
      window.alert(logScope === 'period'
        ? '此段考期尚無加分記錄。'
        : '此班級尚無任何加分記錄。')
      return
    }
    setExporting2(true)
    try {
      await exportScoreLog({
        cls,
        students,
        events: evs,
        fileName: logScope === 'period' && selectedPeriod
          ? `加分明細_${selectedPeriod.name}_${cls.name}班.xlsx`
          : `加分明細_全期間_${cls.name}班.xlsx`
      })
    } catch (e) {
      console.error(e)
      window.alert('匯出失敗：' + String(e))
    } finally {
      setExporting2(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl">

      {/* ── 標題 ── */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-800">📥 匯出 Excel</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          目前班級：<span className="font-medium text-gray-700">{cls.grade} 年 {cls.name} 班</span>
          ／共 {periods.length} 期段考、{students.length} 名學生
        </p>
      </div>

      {/* ── 段考期選擇 ── */}
      <RuleSection
        icon="📅"
        title="選擇段考期"
        description="不同段考期會有獨立的小組分組與分數統計。匯出時只會包含該期間的資料。"
      >
        {periods.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            ⚠ 此班尚無段考期，請先在標題列建立。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {periods.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPeriodId(p.id)}
                className={`
                  h-10 px-4 rounded-lg text-sm font-semibold transition-all
                  ${selectedPeriodId === p.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-400'}
                `}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </RuleSection>

      {/* ── 格式 1：段考期小組加分表 ── */}
      <RuleSection
        icon="📋"
        title="格式一：段考期小組加分表"
        description="依您提供的圖三格式，每組一張工作表，欄為週次，列為角色（組長/助教/員A~D）。適合學期末向學校繳交。"
      >
        {/* 選項 */}
        <div className="bg-gray-50 rounded-xl p-4 mb-5">
          <p className="text-xs text-gray-500 mb-2">匯出最近幾週（週一~週日）</p>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={2} max={20} step={1}
              value={weeksCount}
              onChange={e => setWeeksCount(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm font-bold text-gray-700 w-12 text-center">
              {weeksCount} 週
            </span>
          </div>
        </div>

        {/* 預覽說明 */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
          <p className="text-xs text-blue-700 font-medium mb-1">📌 匯出內容預覽</p>
          <ul className="text-xs text-blue-600 space-y-0.5 list-disc list-inside">
            <li>段考期：{selectedPeriod?.name ?? '—'}</li>
            <li>工作表數：{groups.length} 張（每組一張）</li>
            <li>週次範圍：最近 {weeksCount} 週</li>
            <li>包含資料：{periodEvents.length} 筆加分記錄</li>
            <li>每週名次：依各組該週加分總和，分數低者排第 1 名</li>
          </ul>
        </div>

        <Button
          variant="primary"
          loading={exporting1}
          disabled={exporting1 || !selectedPeriod || groups.length === 0}
          onClick={handleExportWeekly}
          icon={<span>⬇️</span>}
        >
          {!selectedPeriod ? '請先選擇段考期'
            : groups.length === 0 ? '尚無小組資料'
            : '下載段考期小組加分表'}
        </Button>
      </RuleSection>

      {/* ── 格式 2：加分明細 ── */}
      <RuleSection
        icon="📃"
        title="格式二：加分明細表"
        description="將所有加分扣分記錄逐筆列出，包含時間、座號、姓名、事件類型、分數、備註，適合對帳或備查。"
      >
        {/* 範圍選擇 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setLogScope('period')}
            className={`
              flex-1 h-10 rounded-lg text-sm font-semibold transition-all
              ${logScope === 'period'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-400'}
            `}
          >
            僅本段考期（{periodEvents.length} 筆）
          </button>
          <button
            onClick={() => setLogScope('all')}
            className={`
              flex-1 h-10 rounded-lg text-sm font-semibold transition-all
              ${logScope === 'all'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-400'}
            `}
          >
            全期間（{allEvents.length} 筆）
          </button>
        </div>

        <Button
          variant="secondary"
          loading={exporting2}
          disabled={exporting2 || (logScope === 'period' ? periodEvents.length === 0 : allEvents.length === 0)}
          onClick={handleExportLog}
          icon={<span>⬇️</span>}
        >
          下載加分明細表
        </Button>
      </RuleSection>

      {/* ── 提示 ── */}
      <div className="mt-2 bg-amber-50 border border-amber-100 rounded-xl p-4">
        <p className="text-xs text-amber-700">
          <span className="font-semibold">💡 提示：</span>
          每段考期都有獨立的小組分組與分數統計。如果想看不同段考期的競賽名次，
          請到「加分總覽」頁切換段考期；或於本頁切換上方的「段考期」按鈕後再下載。
        </p>
      </div>

      <div className="h-6" />
    </div>
  )
}

export default ExportPage
