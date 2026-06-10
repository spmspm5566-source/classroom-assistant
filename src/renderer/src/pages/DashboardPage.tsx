/**
 * DashboardPage.tsx — 加分總覽
 *
 * 即時顯示「目前段考期」的分數狀況：
 *  - 篩選範圍（本節 / 今日 / 本週 / 本段考期）
 *  - 小組排行卡（依累計分數排序）
 *  - 學生明細表（座號、姓名、角色、累計分、本節分、加減分按鈕）
 *
 * 資料源：ScoreEvent 表，透過 examPeriodId 過濾段考期，再依時間範圍篩選。
 */

import React from 'react'
import { useLiveQuery }      from 'dexie-react-hooks'
import { db, ROLE_LABELS }   from '../db/schema'
import type { Student, Group, ScoreEvent } from '../db/schema'
import { useAppStore }       from '../store/useAppStore'
import { useScopedStudents } from '../hooks/useScopedStudents'
import { listByPeriod }      from '../db/groupRepo'
import { getById as getPeriod } from '../db/examPeriodRepo'
import { getRangeForPreset } from '../utils/period'
import type { RangePreset }  from '../utils/period'
import ManualAdjustDialog    from '../components/shared/ManualAdjustDialog'
import Button                from '../components/shared/Button'

// ── 篩選範圍標籤 ─────────────────────────────────────────────

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: 'session', label: '本節課' },
  { value: 'today',   label: '今日' },
  { value: 'week',    label: '本週' },
  { value: 'all',     label: '本段考期' }
]

// ── 主元件 ───────────────────────────────────────────────────

const DashboardPage: React.FC = () => {
  const classId    = useAppStore(s => s.currentClassId)
  const periodId   = useAppStore(s => s.currentExamPeriodId)
  const sessionId  = useAppStore(s => s.currentSessionId)

  const [range, setRange]         = React.useState<RangePreset>('all')
  const [dialogOpen, setDialog]   = React.useState(false)
  const [preselectedId, setPresel]= React.useState<string | null>(null)

  // ── 從 DB 即時撈取 ──
  const period = useLiveQuery(
    () => periodId ? getPeriod(periodId) : Promise.resolve(undefined),
    [periodId]
  )

  // 學生（已合併「目前段考期」的分組指派）
  const students = useScopedStudents(classId, periodId)

  // 只列出「目前段考期」的小組
  const groups = useLiveQuery(
    () => periodId ? listByPeriod(periodId) : Promise.resolve([]),
    [periodId], []
  ) ?? []

  const events = useLiveQuery(
    async (): Promise<ScoreEvent[]> => {
      if (!classId || !periodId) return []

      // 'session' 用 sessionId 過濾
      if (range === 'session') {
        if (!sessionId) return []
        return db.scoreEvents
          .where('sessionId').equals(sessionId)
          .and(e => e.examPeriodId === periodId)
          .toArray()
      }

      // 其他用「[classId+examPeriodId] 索引」+ 時間範圍
      const all = await db.scoreEvents
        .where('[classId+examPeriodId]').equals([classId, periodId])
        .toArray()

      if (range === 'all') return all
      const { start, end } = getRangeForPreset(range)
      return all.filter(e => e.timestamp >= start && e.timestamp <= end)
    },
    [classId, periodId, sessionId, range],
    []
  ) ?? []

  // ── 計算累計分數 ──
  const studentScoreMap: Record<string, number> = React.useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of events) {
      map[e.studentId] = (map[e.studentId] ?? 0) + e.score
    }
    return map
  }, [events])

  // 小組分數：直接從 ScoreEvent.groupId 統計（這會反映「事件當下」的分組，
  // 即使學生後來換組也能正確計算「該組得分」）
  const groupScoreMap: Record<string, number> = React.useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of events) {
      if (!e.groupId) continue
      map[e.groupId] = (map[e.groupId] ?? 0) + e.score
    }
    return map
  }, [events])

  // 排序後的小組（分數高到低）
  const sortedGroups = React.useMemo(
    () => [...groups].sort((a, b) => (groupScoreMap[b.id] ?? 0) - (groupScoreMap[a.id] ?? 0)),
    [groups, groupScoreMap]
  )

  // 排序後的學生（分數高到低）
  const sortedStudents = React.useMemo(
    () => [...students].sort((a, b) => (studentScoreMap[b.id] ?? 0) - (studentScoreMap[a.id] ?? 0)),
    [students, studentScoreMap]
  )

  // ── 手動加分 ──
  const openManual = (studentId?: string) => {
    setPresel(studentId ?? null)
    setDialog(true)
  }

  if (!classId) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-center">
        <div className="text-5xl mb-4">🏫</div>
        <p className="text-gray-500 text-sm">請先在標題列選擇班級，才能查看加分總覽。</p>
      </div>
    )
  }
  if (!periodId) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-center">
        <div className="text-5xl mb-4">📅</div>
        <p className="text-gray-500 text-sm">請先在標題列選擇或建立段考期。</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl">

      {/* ── 標題 + 操作 ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📊 加分總覽</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            目前段考期：
            <span className="ml-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-xs font-medium">
              {period?.name ?? '—'}
            </span>
            <span className="ml-2 text-xs text-gray-400">
              （依段考期分別統計，切換上方下拉選單可查看其他段考期）
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* 範圍 pills */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {RANGE_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setRange(o.value)}
                className={`
                  h-7 px-3 text-xs font-medium rounded-lg transition-all
                  ${range === o.value
                    ? 'bg-white shadow text-gray-800'
                    : 'text-gray-500 hover:text-gray-700'}
                `}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={() => openManual()}>
            ✏️ 手動加減分
          </Button>
        </div>
      </div>

      {/* ── 小組排行（本段考期的競賽名次）── */}
      {groups.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            🏆 小組總分排名（{RANGE_OPTIONS.find(o => o.value === range)?.label ?? ''}）
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {sortedGroups.map((g, rank) => (
              <GroupCard
                key={g.id}
                group={g}
                rank={rank + 1}
                total={groupScoreMap[g.id] ?? 0}
                memberCount={students.filter(s => s.groupId === g.id).length}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── 個人前 10 名（依目前範圍）── */}
      {(() => {
        const rangeLabel = RANGE_OPTIONS.find(o => o.value === range)?.label ?? ''
        const top10 = sortedStudents
          .filter(s => (studentScoreMap[s.id] ?? 0) !== 0)
          .slice(0, 10)
        if (top10.length === 0) return null
        return (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              🏅 個人加分前 10 名（{rangeLabel}）
            </h2>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 divide-gray-50">
                {top10.map((s, idx) => {
                  const total = studentScoreMap[s.id] ?? 0
                  const group = groups.find(g => g.id === s.groupId)
                  const medal = ['🥇', '🥈', '🥉'][idx]
                  return (
                    <div
                      key={s.id}
                      className={`
                        flex items-center gap-3 px-4 py-2.5
                        ${idx % 2 === 0 ? 'sm:border-r border-gray-50' : ''}
                        ${idx < 3 ? 'bg-yellow-50/40' : ''}
                      `}
                    >
                      <span className="w-7 text-center text-sm font-bold tabular-nums text-gray-400">
                        {medal ?? `${idx + 1}`}
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums w-6">{s.seatNo}</span>
                      <span className="flex-1 font-medium text-gray-800 text-sm truncate">
                        {s.name}
                        {group && (
                          <span className="ml-1.5 text-[10px] text-gray-400">
                            {group.name ?? `第${group.number}組`}
                          </span>
                        )}
                      </span>
                      <span className={`text-sm font-bold tabular-nums ${total > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {total > 0 ? `+${total}` : total}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )
      })()}

      {/* ── 學生分數表 ── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          學生明細（{sortedStudents.length} 人）
        </h2>
        {sortedStudents.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4">尚無學生資料</p>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium w-12">座號</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">姓名</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">角色</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">小組</th>
                  <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium w-24">累計分</th>
                  <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium w-20">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedStudents.map((s, idx) => {
                  const total = studentScoreMap[s.id] ?? 0
                  const group = groups.find(g => g.id === s.groupId)
                  return (
                    <StudentRow
                      key={s.id}
                      rank={idx + 1}
                      student={s}
                      group={group}
                      total={total}
                      onAdjust={() => openManual(s.id)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 手動加減分對話框 ── */}
      <ManualAdjustDialog
        open={dialogOpen}
        onClose={() => setDialog(false)}
        preselectedStudentId={preselectedId}
        classId={classId}
        sessionId={sessionId}
      />
    </div>
  )
}

// ── 子元件：小組排行卡 ────────────────────────────────────────

const RANK_STYLES = [
  { badge: '🥇', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
  { badge: '🥈', bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-600' },
  { badge: '🥉', bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700' },
]

interface GroupCardProps {
  group:       Group
  rank:        number
  total:       number
  memberCount: number
}

const GroupCard: React.FC<GroupCardProps> = ({ group, rank, total, memberCount }) => {
  const style = RANK_STYLES[rank - 1] ?? { badge: `#${rank}`, bg: 'bg-white', border: 'border-gray-100', text: 'text-gray-600' }

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4 flex items-center gap-3`}>
      <div className="text-2xl">{style.badge}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 text-sm truncate">{group.name ?? `第${group.number}組`}</p>
        <p className="text-xs text-gray-400">{memberCount} 人</p>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${style.text}`}>
        {total > 0 ? `+${total}` : total}
      </div>
    </div>
  )
}

// ── 子元件：學生列 ────────────────────────────────────────────

interface StudentRowProps {
  rank:     number
  student:  Student
  group?:   Group
  total:    number
  onAdjust: () => void
}

const StudentRow: React.FC<StudentRowProps> = ({ rank, student, group, total, onAdjust }) => {
  const isTop3 = rank <= 3
  return (
    <tr className={`transition-colors ${isTop3 ? 'bg-yellow-50/40' : 'hover:bg-gray-50/60'}`}>
      <td className="px-4 py-2.5 text-xs text-gray-400 tabular-nums">
        {student.seatNo}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          {rank <= 3 && <span className="text-base">{['🥇','🥈','🥉'][rank-1]}</span>}
          <span className="font-medium text-gray-800 text-sm">{student.name}</span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        {student.role && group ? (
          <span className="inline-block px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-xs font-medium">
            {ROLE_LABELS[student.role]}
          </span>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-500">
        {group ? (group.name ?? `第${group.number}組`) : <span className="text-gray-300">未分組</span>}
      </td>
      <td className="px-4 py-2.5 text-right">
        <span className={`
          text-sm font-bold tabular-nums
          ${total > 0 ? 'text-emerald-600' : total < 0 ? 'text-rose-600' : 'text-gray-400'}
        `}>
          {total > 0 ? `+${total}` : total}
        </span>
      </td>
      <td className="px-4 py-2.5 text-center">
        <button
          onClick={onAdjust}
          className="h-7 px-2 rounded-lg text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
          title="手動加減分"
        >
          ✏️
        </button>
      </td>
    </tr>
  )
}

export default DashboardPage
