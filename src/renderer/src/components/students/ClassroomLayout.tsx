/**
 * ClassroomLayout.tsx — 教室檢視（v4：每組允許多位相同角色）
 *
 *               [講桌]                      ← 教室前方
 *   [第N組] [...] [第3組] [第2組] [第1組]
 *               ↓ 教室後方
 *
 * 每組為一直行，6 個角色區由上至下排列；同角色多人時堆疊顯示。
 * 拖曳以「學生」為單位（透過 makeSwapHandler）：
 *  - 拖到別的學生身上 = 兩人互換組別+角色
 *  - 拖到角色區空白處 = 移動到該組該角色（可與他人同角色）
 */

import React from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type { Student, Group, StudentRole } from '../../db/schema'
import { makeSwapHandler, StudentCard, EmptySeat } from './LabTableLayout'

interface Props {
  groups:       Group[]
  students:     Student[]
  examPeriodId: string | null
}

const ROLE_ORDER: StudentRole[] = ['leader', 'assistant', 'memberA', 'memberB', 'memberC', 'memberD']

// ── 主元件 ───────────────────────────────────────────────────

const ClassroomLayout: React.FC<Props> = ({ groups, students, examPeriodId }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )
  const classId = students[0]?.classId ?? null

  // 顯示順序：第 1 組在最右、第 N 組在最左 → 對 group.number 降冪
  const displayGroups = React.useMemo(
    () => [...groups].sort((a, b) => b.number - a.number),
    [groups]
  )

  const handleDragEnd = makeSwapHandler(students, 'classroom', examPeriodId, classId)

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        {/* 教室後方（上） */}
        <p className="text-center text-[11px] text-gray-400">↑ 教室後方</p>

        {/* 各組為一直行，水平排列；第 1 組在右、依序 2、3 …往左 */}
        <div className="pb-2">
          <div className="flex gap-2 w-full justify-center">
            {displayGroups.map(g => (
              <ClassroomGroupColumn
                key={g.id}
                group={g}
                students={students}
              />
            ))}
          </div>
        </div>

        {/* 講桌（下，教室前方） */}
        <div className="flex justify-center pt-2">
          <div className="
            inline-block px-12 py-3 rounded-lg
            bg-gradient-to-br from-gray-700 to-gray-800
            text-white font-bold text-base tracking-widest
            shadow-md
          ">
            講 桌
          </div>
        </div>
      </div>
    </DndContext>
  )
}

// ── 子元件：單一組（直行）───────────────────────────────────

interface ColumnProps {
  group:    Group
  students: Student[]
}

const SEATS_PER_GROUP = 6
const ROLE_SORT: Record<StudentRole, number> = {
  leader: 0, assistant: 1, memberA: 2, memberB: 3, memberC: 4, memberD: 5
}

const ClassroomGroupColumn: React.FC<ColumnProps> = ({ group, students }) => {
  // 每組固定 6 個座位：成員依角色排序由上而下入座，不足補空位
  const groupMembers = students
    .filter(s => s.groupId === group.id)
    .sort((a, b) => {
      const ra = a.role ? ROLE_SORT[a.role] : 99
      const rb = b.role ? ROLE_SORT[b.role] : 99
      return ra - rb || a.seatNo - b.seatNo
    })
  const emptyCount = Math.max(0, SEATS_PER_GROUP - groupMembers.length)

  return (
    <div
      className="
        flex-1 min-w-0 max-w-[140px]
        flex flex-col gap-1.5
        bg-white rounded-xl border border-gray-200 shadow-sm p-2
      "
    >
      {/* 組標：● 第N組 + 人數 */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: group.color ?? '#9ca3af' }}
          />
          <span className="text-xs font-bold text-gray-700">
            {group.name ?? `第${group.number}組`}
          </span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {groupMembers.length} 人
        </p>
      </div>

      {/* 座位（每組最多 6 格）：
          學生從靠講桌（下方）的第一個位置開始往教室後方排，
          空位集中在教室後方（上方）。
          顯示順序由上至下 = 空位 → 組員…→ 助教 → 教練（教練最靠講桌）。 */}
      <div className="flex flex-col gap-1">
        {Array.from({ length: emptyCount }).map((_, i) => (
          <EmptySeat
            key={`empty-${i}`}
            layoutPrefix="cls"
            groupId={group.id}
            slotIndex={i}
          />
        ))}
        {[...groupMembers].reverse().map(s => (
          s.role && (
            <StudentCard
              key={s.id}
              layoutPrefix="cls"
              groupId={group.id}
              role={s.role}
              student={s}
            />
          )
        ))}
      </div>
    </div>
  )
}

export default ClassroomLayout
