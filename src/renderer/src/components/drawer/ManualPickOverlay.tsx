/**
 * ManualPickOverlay.tsx — 老師指定模式
 *
 * 全螢幕半透明遮罩 + 學生網格。老師點某位 → 直接進入結果視窗（不跑輪盤）。
 *
 * 用途：當班上有特定學生需要請答（沒專心、想給安靜的學生機會、確認某位是否
 * 理解今天的概念），老師可手動點他而非靠隨機。
 *
 * 排版與 SeatGrid 類似，每組一張卡片，點卡片內成員即送出。
 */

import React from 'react'
import type { Student, Group, StudentRole } from '../../db/schema'
import { ROLE_LABELS } from '../../db/schema'

interface Props {
  groups:        Group[]
  students:      Student[]
  studentScores: Record<string, number>
  onPick:        (studentId: string) => void
  onCancel:      () => void
}

const ROLE_ORDER: StudentRole[] = ['leader', 'assistant', 'memberA', 'memberB', 'memberC', 'memberD']

const ManualPickOverlay: React.FC<Props> = ({ groups, students, studentScores, onPick, onCancel }) => {
  // 預先依 group 分類學生 + 排序
  const studentsByGroup = React.useMemo(() => {
    const map = new Map<string, Student[]>()
    for (const g of groups) map.set(g.id, [])
    for (const s of students) {
      if (!s.groupId) continue
      const arr = map.get(s.groupId)
      if (arr) arr.push(s)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const oa = a.role ? ROLE_ORDER.indexOf(a.role) : 99
        const ob = b.role ? ROLE_ORDER.indexOf(b.role) : 99
        if (oa !== ob) return oa - ob
        return a.seatNo - b.seatNo
      })
    }
    return map
  }, [groups, students])

  // 未分組學生
  const ungrouped = students.filter(s => !s.groupId)

  return (
    <div className="no-drag absolute inset-0 z-30 bg-white flex flex-col">

      {/* ── 頂部 ── */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-gray-200 bg-amber-50 flex-shrink-0">
        <span className="text-xs font-bold text-amber-800">
          👆 老師指定 — 點選要請答的學生
        </span>
        <button
          onClick={onCancel}
          className="
            text-[10px] px-2 py-1 rounded
            text-amber-700 hover:bg-amber-100
          "
        >
          ✕ 取消
        </button>
      </div>

      {/* ── 學生網格 ── */}
      <div className="flex-1 p-2 overflow-auto">
        {students.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-8">
            此班尚無學生
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {groups.map(group => {
                const members = studentsByGroup.get(group.id) ?? []
                if (members.length === 0) return null
                return (
                  <div
                    key={group.id}
                    className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col"
                  >
                    <div
                      className="flex items-center justify-between px-2 py-0.5"
                      style={{ backgroundColor: group.color ?? '#9ca3af', color: 'white' }}
                    >
                      <span className="text-[10px] font-bold">
                        {group.name ?? `第${group.number}組`}
                      </span>
                      <span className="text-[9px] text-white/70">
                        {members.length} 人
                      </span>
                    </div>
                    <div className="p-1 space-y-0.5">
                      {members.map(s => (
                        <PickCard
                          key={s.id}
                          student={s}
                          score={studentScores[s.id] ?? 0}
                          onClick={() => onPick(s.id)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 未分組學生（如果有） */}
            {ungrouped.length > 0 && (
              <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-[10px] text-gray-500 mb-1">未分組（{ungrouped.length} 人）</p>
                <div className="flex flex-wrap gap-1">
                  {ungrouped.map(s => (
                    <button
                      key={s.id}
                      onClick={() => onPick(s.id)}
                      className="
                        h-7 px-2 rounded-md
                        bg-white border border-gray-300 hover:border-amber-400 hover:bg-amber-50
                        text-[11px] font-medium text-gray-700
                      "
                    >
                      {s.seatNo} {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── 子元件：單一學生卡 ──────────────────────────────────────

interface PickCardProps {
  student: Student
  score:   number
  onClick: () => void
}

const PickCard: React.FC<PickCardProps> = ({ student, score, onClick }) => {
  const roleLabel = student.role ? ROLE_LABELS[student.role] : ''

  return (
    <button
      onClick={onClick}
      className="
        w-full px-1.5 py-1 rounded
        flex items-center justify-between
        bg-white hover:bg-amber-50 hover:ring-1 hover:ring-amber-400
        transition-all
        text-left
      "
    >
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
          {student.seatNo}
        </span>
        <span className="text-[11px] font-semibold text-gray-800 truncate">
          {student.name}
        </span>
        {roleLabel && (
          <span className="text-[9px] text-gray-400 flex-shrink-0">
            {roleLabel}
          </span>
        )}
      </div>
      <span className={`
        text-[10px] font-mono font-semibold flex-shrink-0
        ${score > 0 ? 'text-emerald-600' : score < 0 ? 'text-red-500' : 'text-gray-400'}
      `}>
        {score > 0 ? `+${score}` : score}
      </span>
    </button>
  )
}

export default ManualPickOverlay
