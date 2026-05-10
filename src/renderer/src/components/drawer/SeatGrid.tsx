/**
 * SeatGrid.tsx — 分組座位網格
 *
 * 以 6 張小組卡片（2 列 × 3 欄）顯示全班，每張卡片內含成員清單。
 *
 * 與抽籤狀態整合：
 *  - 接收 highlightId（輪盤經過中）
 *  - 接收 winnerId  （最終抽中）
 *  - 接收 drawMode  （非 'all' 時，非該角色的學生變灰）
 */

import React from 'react'
import type { Student, Group, StudentRole } from '../../db/schema'
import type { DrawMode } from '../../utils/draw'
import SeatCard from './SeatCard'

interface SeatGridProps {
  groups:        Group[]
  students:      Student[]
  studentScores: Record<string, number>
  groupScores:   Record<string, number>
  drawMode:      DrawMode
  highlightId:   string | null
  winnerId:      string | null
}

// 角色顯示順序
const ROLE_ORDER: StudentRole[] = ['leader', 'assistant', 'memberA', 'memberB', 'memberC', 'memberD']

const SeatGrid: React.FC<SeatGridProps> = ({
  groups,
  students,
  studentScores,
  groupScores,
  drawMode,
  highlightId,
  winnerId
}) => {
  // 預先依 groupId 分類學生並依角色排序
  const studentsByGroup = React.useMemo(() => {
    const map = new Map<string, Student[]>()
    for (const g of groups) map.set(g.id, [])
    for (const s of students) {
      if (!s.groupId) continue
      const arr = map.get(s.groupId)
      if (arr) arr.push(s)
    }
    // 排序：依角色順序 → 同角色比座號
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

  // 判斷某位學生在當前 drawMode 下是否為候選
  const isCandidate = (s: Student): boolean => {
    if (drawMode === 'all') return true
    return s.role === drawMode
  }

  return (
    <div className="grid grid-cols-3 gap-1.5 h-full">
      {groups.map(group => {
        const members = studentsByGroup.get(group.id) ?? []
        const groupScore = groupScores[group.id] ?? 0

        return (
          <div
            key={group.id}
            className="
              bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col
            "
          >
            {/* 組標頭 */}
            <div
              className="flex items-center justify-between px-2 py-0.5 flex-shrink-0"
              style={{ backgroundColor: group.color ?? '#9ca3af', color: 'white' }}
            >
              <span className="text-[11px] font-bold">
                {group.name ?? `第${group.number}組`}
              </span>
              <span className={`
                text-[10px] font-mono font-semibold
                ${groupScore > 0 ? 'text-emerald-100' : groupScore < 0 ? 'text-red-100' : 'text-white/80'}
              `}>
                {groupScore > 0 ? `+${groupScore}` : groupScore}
              </span>
            </div>

            {/* 成員列表 */}
            <div className="flex-1 p-1 space-y-0.5">
              {members.length === 0 ? (
                <div className="flex items-center justify-center h-full text-[10px] text-gray-300">
                  尚無成員
                </div>
              ) : members.map(s => (
                <SeatCard
                  key={s.id}
                  student={s}
                  score={studentScores[s.id] ?? 0}
                  highlight={highlightId === s.id}
                  winner={winnerId === s.id}
                  dimmed={!isCandidate(s) && winnerId !== s.id && highlightId !== s.id}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default SeatGrid
