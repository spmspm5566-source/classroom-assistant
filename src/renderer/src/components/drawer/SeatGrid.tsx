/**
 * SeatGrid.tsx — 抽籤器座位表（與「分組座位表」教室檢視同樣式）
 *
 * 直行排列：第 1 組在最右、依序往左；講桌在下方。
 * 每組一直行，組內依角色（教練／助教／組員A-D）由上往下排座位。
 *
 * 與抽籤狀態整合：
 *  - highlightId：輪盤經過中（紅框 + 微放大）
 *  - winnerId：  最終抽中（金色脈動光暈）
 *  - drawMode：  非 'all' 時，不符合該角色的學生變灰
 */

import React from 'react'
import { motion } from 'framer-motion'
import type { Student, Group, StudentRole } from '../../db/schema'
import { ROLE_LABELS } from '../../db/schema'
import type { DrawMode } from '../../utils/draw'

interface SeatGridProps {
  groups:        Group[]
  students:      Student[]
  studentScores: Record<string, number>
  groupScores:   Record<string, number>
  drawMode:      DrawMode
  highlightId:   string | null
  winnerId:      string | null
}

const ROLE_ORDER: StudentRole[] = ['leader', 'assistant', 'memberA', 'memberB', 'memberC', 'memberD']

const ROLE_COLORS: Record<StudentRole, { bg: string; border: string; text: string; badge: string }> = {
  leader:    { bg: 'bg-red-50',     border: 'border-red-300',     text: 'text-red-800',     badge: 'bg-red-500'     },
  assistant: { bg: 'bg-orange-50',  border: 'border-orange-300',  text: 'text-orange-800',  badge: 'bg-orange-500'  },
  memberA:   { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-500' },
  memberB:   { bg: 'bg-cyan-50',    border: 'border-cyan-300',    text: 'text-cyan-800',    badge: 'bg-cyan-500'    },
  memberC:   { bg: 'bg-violet-50',  border: 'border-violet-300',  text: 'text-violet-800',  badge: 'bg-violet-500'  },
  memberD:   { bg: 'bg-pink-50',    border: 'border-pink-300',    text: 'text-pink-800',    badge: 'bg-pink-500'    }
}

const SeatGrid: React.FC<SeatGridProps> = ({
  groups, students, studentScores, groupScores, drawMode, highlightId, winnerId
}) => {
  // 第 1 組在最右 → 依 number 降冪
  const displayGroups = React.useMemo(
    () => [...groups].sort((a, b) => b.number - a.number),
    [groups]
  )

  const isCandidate = (s: Student): boolean =>
    drawMode === 'all' ? true : s.role === drawMode

  return (
    <div className="h-full flex flex-col">
      {/* 教室後方（上）*/}
      <p className="text-center text-[10px] text-gray-400 flex-shrink-0">↑ 教室後方</p>

      {/* 各組直行（第 1 組在右）*/}
      <div className="flex-1 min-h-0 overflow-auto py-1">
        <div className="flex gap-1.5 w-full justify-end items-start">
          {displayGroups.map(group => {
            const members = students.filter(s => s.groupId === group.id)
            // 同角色可有多人，依角色順序攤平
            const byRole = new Map<StudentRole, Student[]>()
            for (const s of members) {
              if (!s.role) continue
              if (!byRole.has(s.role)) byRole.set(s.role, [])
              byRole.get(s.role)!.push(s)
            }
            const gScore = groupScores[group.id] ?? 0

            return (
              <div
                key={group.id}
                className="flex-1 min-w-0 max-w-[150px] flex flex-col gap-1 bg-white rounded-lg border border-gray-200 shadow-sm p-1.5"
              >
                {/* 組標頭 */}
                <div
                  className="flex items-center justify-between px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: group.color ?? '#9ca3af', color: 'white' }}
                >
                  <span className="text-[11px] font-bold truncate">
                    {group.name ?? `第${group.number}組`}
                  </span>
                  <span className="text-[10px] font-mono font-semibold flex-shrink-0">
                    {gScore > 0 ? `+${gScore}` : gScore}
                  </span>
                </div>

                {/* 座位（依角色順序，同角色多人全部列出）*/}
                {ROLE_ORDER.flatMap(role => {
                  const stus = byRole.get(role) ?? []
                  if (stus.length === 0) {
                    return [
                      <Seat
                        key={role}
                        role={role}
                        student={undefined}
                        score={0}
                        highlight={false}
                        winner={false}
                        dimmed={false}
                      />
                    ]
                  }
                  return stus.map(stu => (
                    <Seat
                      key={stu.id}
                      role={role}
                      student={stu}
                      score={studentScores[stu.id] ?? 0}
                      highlight={highlightId === stu.id}
                      winner={winnerId === stu.id}
                      dimmed={!isCandidate(stu) && winnerId !== stu.id && highlightId !== stu.id}
                    />
                  ))
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* 講桌（下）*/}
      <div className="flex justify-center pt-1 flex-shrink-0">
        <div className="inline-block px-8 py-1.5 rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 text-white font-bold text-xs tracking-widest shadow">
          講 桌
        </div>
      </div>
    </div>
  )
}

// ── 單一座位 ──────────────────────────────────────────────────

interface SeatProps {
  role:       StudentRole
  student:    Student | undefined
  score:      number
  highlight:  boolean
  winner:     boolean
  dimmed:     boolean
}

const Seat: React.FC<SeatProps> = ({ role, student, score, highlight, winner, dimmed }) => {
  const c = ROLE_COLORS[role]

  // 空座位：虛線框
  if (!student) {
    return <div className={`rounded-md border-2 border-dashed ${c.border} opacity-40 h-8`} />
  }

  const animate = winner
    ? {
        scale:     [1, 1.16, 1.1],
        boxShadow: [
          '0 0 0 0 rgba(251,191,36,0.7)',
          '0 0 0 12px rgba(251,191,36,0)',
          '0 0 0 0 rgba(251,191,36,0)'
        ]
      }
    : highlight
      ? { scale: [1, 1.06, 1] }
      : { scale: 1 }

  return (
    <motion.div
      animate={animate}
      transition={winner ? { duration: 0.8, repeat: Infinity, ease: 'easeOut' } : { duration: 0.15 }}
      className={`
        relative rounded-md border-2 h-8 px-1 flex items-center gap-1
        ${winner
          ? 'bg-yellow-300 border-yellow-500 z-10 shadow-lg'
          : highlight
            ? 'bg-red-100 border-red-500 z-10'
            : dimmed
              ? `${c.bg} ${c.border} opacity-30`
              : `${c.bg} ${c.border}`}
      `}
    >
      <span className={`inline-block px-1 py-0 rounded text-[8px] font-bold text-white flex-shrink-0 ${winner ? 'bg-yellow-600' : c.badge}`}>
        {ROLE_LABELS[role]}
      </span>
      <span className={`text-[10px] font-mono flex-shrink-0 ${winner ? 'text-yellow-900' : 'text-gray-500'}`}>
        {student.seatNo}
      </span>
      <span className={`text-xs font-semibold truncate flex-1 ${winner ? 'text-yellow-900 font-bold' : c.text}`}>
        {student.name}
      </span>
      {score !== 0 && (
        <span className={`text-[9px] font-mono font-semibold flex-shrink-0 ${score > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {score > 0 ? `+${score}` : score}
        </span>
      )}
    </motion.div>
  )
}

export default SeatGrid
