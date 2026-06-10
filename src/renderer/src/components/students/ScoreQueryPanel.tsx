/**
 * ScoreQueryPanel.tsx — 加分查詢浮動面板
 *
 * 直接浮在座位表上，依時間範圍（本節課 / 本日 / 本週 / 本段考期）即時統計：
 *  - 小組總分排名（列出全部小組）
 *  - 個人加分前 5 名
 *  - 個人扣分最多 5 名
 *
 * 資料源：ScoreEvent 表，透過 examPeriodId 過濾段考期，再依時間範圍篩選。
 */

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/schema'
import type { ScoreEvent } from '../../db/schema'
import { useAppStore } from '../../store/useAppStore'
import { listByPeriod } from '../../db/groupRepo'
import { getRangeForPreset } from '../../utils/period'
import type { RangePreset } from '../../utils/period'
import { GROUP_EVENT_STUDENT_ID } from '../../hooks/useStudentScores'

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: 'session', label: '本節課' },
  { value: 'today',   label: '本日' },
  { value: 'week',    label: '本週' },
  { value: 'all',     label: '本段考期' }
]

interface Props {
  onClose: () => void
}

const ScoreQueryPanel: React.FC<Props> = ({ onClose }) => {
  const classId   = useAppStore(s => s.currentClassId)
  const periodId  = useAppStore(s => s.currentExamPeriodId)
  const sessionId = useAppStore(s => s.currentSessionId)
  const [range, setRange] = React.useState<RangePreset>('session')

  const students = useLiveQuery(
    () => classId ? db.students.where('classId').equals(classId).toArray() : [],
    [classId], []
  ) ?? []

  const groups = useLiveQuery(
    () => periodId ? listByPeriod(periodId) : Promise.resolve([]),
    [periodId], []
  ) ?? []

  const events = useLiveQuery(
    async (): Promise<ScoreEvent[]> => {
      if (!classId || !periodId) return []
      if (range === 'session') {
        if (!sessionId) return []
        return db.scoreEvents.where('sessionId').equals(sessionId)
          .and(e => e.examPeriodId === periodId).toArray()
      }
      const all = await db.scoreEvents
        .where('[classId+examPeriodId]').equals([classId, periodId]).toArray()
      if (range === 'all') return all
      const { start, end } = getRangeForPreset(range)
      return all.filter(e => e.timestamp >= start && e.timestamp <= end)
    },
    [classId, periodId, sessionId, range], []
  ) ?? []

  // 累計分數（排除 __group__ 團體事件，不計入個人）
  const studentScore: Record<string, number> = React.useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of events) {
      if (e.studentId === GROUP_EVENT_STUDENT_ID) continue
      m[e.studentId] = (m[e.studentId] ?? 0) + e.score
    }
    return m
  }, [events])

  const groupScore: Record<string, number> = React.useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of events) {
      if (!e.groupId) continue
      m[e.groupId] = (m[e.groupId] ?? 0) + e.score
    }
    return m
  }, [events])

  const nameOf = (id: string) => students.find(s => s.id === id)
  const seatName = (id: string) => {
    const s = nameOf(id)
    return s ? `${s.seatNo} ${s.name}` : '—'
  }

  // 小組排名（全部）
  const rankedGroups = React.useMemo(
    () => [...groups].sort((a, b) => (groupScore[b.id] ?? 0) - (groupScore[a.id] ?? 0)),
    [groups, groupScore]
  )

  // 個人加分前 5 / 扣分最多 5
  const scored = Object.entries(studentScore)
  const top5Gain = [...scored].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const top5Lose = [...scored].filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 5)

  const rangeLabel = RANGE_OPTIONS.find(o => o.value === range)?.label ?? ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[760px] max-h-[88vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 標題列 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-800">📊 加分查詢</h2>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              {RANGE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setRange(o.value)}
                  className={`h-7 px-3 text-xs font-medium rounded-lg transition-all
                    ${range === o.value ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center">✕</button>
          </div>
        </div>

        <div className="overflow-auto p-5 space-y-5">
          {/* 小組排名（全部）*/}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              🏆 小組總分排名（{rangeLabel}）
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {rankedGroups.map((g, i) => {
                const total = groupScore[g.id] ?? 0
                const medal = ['🥇', '🥈', '🥉'][i]
                return (
                  <div key={g.id} className={`rounded-xl border p-3 flex items-center gap-2 ${i < 3 ? 'bg-yellow-50 border-yellow-200' : 'border-gray-100'}`}>
                    <span className="text-lg">{medal ?? `${i + 1}`}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{g.name ?? `第${g.number}組`}</p>
                      <p className={`text-sm font-bold tabular-nums ${total > 0 ? 'text-emerald-600' : total < 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                        {total > 0 ? `+${total}` : total}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* 個人前 5 名 / 扣分最多 5 名 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <section>
              <h3 className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">
                🏅 個人加分前 5 名
              </h3>
              <RankList rows={top5Gain.map(([id, v]) => ({ label: seatName(id), value: v }))} positive />
            </section>
            <section>
              <h3 className="text-xs font-semibold text-rose-600 uppercase tracking-wide mb-2">
                ⚠ 扣分最多 5 名
              </h3>
              <RankList rows={top5Lose.map(([id, v]) => ({ label: seatName(id), value: v }))} positive={false} />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

const RankList: React.FC<{ rows: { label: string; value: number }[]; positive: boolean }> = ({ rows, positive }) => {
  if (rows.length === 0) {
    return <p className="text-xs text-gray-300 italic py-3">本範圍尚無{positive ? '加分' : '扣分'}記錄</p>
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2">
          <span className="w-5 text-center text-xs font-bold text-gray-400">{i + 1}</span>
          <span className="flex-1 text-sm text-gray-800 truncate">{r.label}</span>
          <span className={`text-sm font-bold tabular-nums ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {r.value > 0 ? `+${r.value}` : r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export default ScoreQueryPanel
