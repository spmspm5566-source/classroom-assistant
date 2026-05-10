/**
 * ClassroomLayout.tsx — 教室檢視（v3：講桌在上、第1組在右）
 *
 *               [講桌]                      ← 教室前方
 *   [第N組] [...] [第3組] [第2組] [第1組]
 *               ↓ 教室後方
 *
 * 拖曳行為：同組／跨組互換或移動座位（透過 makeSwapHandler）
 * 空座位不顯示「組長/助教/...」字，僅虛線框
 */

import React from 'react'
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type { Student, Group, StudentRole } from '../../db/schema'
import { ROLE_LABELS } from '../../db/schema'
import { makeSwapHandler } from './LabTableLayout'

interface Props {
  groups:   Group[]
  students: Student[]
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

interface SeatKey { groupId: string; role: StudentRole }

// ── 主元件 ───────────────────────────────────────────────────

const ClassroomLayout: React.FC<Props> = ({ groups, students }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // 顯示順序：第 1 組在最右、第 N 組在最左 → 對 group.number 降冪
  const displayGroups = React.useMemo(
    () => [...groups].sort((a, b) => b.number - a.number),
    [groups]
  )

  const handleDragEnd = makeSwapHandler(students, 'classroom')

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        {/* 講桌（上） */}
        <div className="flex justify-center pb-2">
          <div className="
            inline-block px-12 py-3 rounded-lg
            bg-gradient-to-br from-gray-700 to-gray-800
            text-white font-bold text-base tracking-widest
            shadow-md
          ">
            講 桌
          </div>
        </div>

        {/* 各組為一直行，水平排列；第 1 組在右、依序 2、3 …往左 */}
        <div className="overflow-x-auto pb-2">
          <div className="inline-flex gap-3 min-w-full justify-end pr-2">
            {displayGroups.map(g => (
              <ClassroomGroupColumn
                key={g.id}
                group={g}
                students={students}
              />
            ))}
          </div>
        </div>

        {/* 教室後方（下） */}
        <p className="text-center text-[11px] text-gray-400">↓ 教室後方</p>
      </div>
    </DndContext>
  )
}

// ── 子元件：單一組（直行）───────────────────────────────────

interface ColumnProps {
  group:    Group
  students: Student[]
}

const ClassroomGroupColumn: React.FC<ColumnProps> = ({ group, students }) => {
  const groupMembers = students.filter(s => s.groupId === group.id)
  const byRole = new Map<StudentRole, Student>()
  for (const s of groupMembers) {
    if (s.role && !byRole.has(s.role)) byRole.set(s.role, s)
  }

  return (
    <div
      className="
        flex-shrink-0
        flex flex-col gap-1.5
        bg-white rounded-xl border border-gray-200 shadow-sm p-2.5
      "
      style={{ width: 130 }}
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

      {/* 學生座位（依角色順序由上至下） */}
      <div className="flex flex-col gap-1">
        {ROLE_ORDER.map(role => (
          <DeskSlot
            key={role}
            groupId={group.id}
            role={role}
            student={byRole.get(role)}
          />
        ))}
      </div>
    </div>
  )
}

// ── 子元件：單一座位 ─────────────────────────────────────────

interface DeskSlotProps {
  groupId: string
  role:    StudentRole
  student: Student | undefined
}

const DeskSlot: React.FC<DeskSlotProps> = ({ groupId, role, student }) => {
  const c = ROLE_COLORS[role]

  const dropId = `cls-drop-${groupId}-${role}`
  const dragId = `cls-drag-${groupId}-${role}`

  const { isOver, setNodeRef: dropRef } = useDroppable({
    id:   dropId,
    data: { groupId, role } as SeatKey
  })
  const drag = useDraggable({
    id:       dragId,
    data:     { groupId, role } as SeatKey,
    disabled: !student
  })

  const setRef = (node: HTMLElement | null): void => {
    dropRef(node)
    drag.setNodeRef(node)
  }

  const dragStyle: React.CSSProperties = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`, zIndex: 50 }
    : {}

  if (!student) {
    // 空座位：只虛線框，不顯示角色名
    return (
      <div
        ref={setRef}
        style={dragStyle}
        className={`
          rounded-md border-2 border-dashed
          ${c.border}
          h-9
          ${isOver ? 'ring-2 ring-amber-400 bg-amber-50' : ''}
          transition-shadow
        `}
        aria-label={`空座位 ${ROLE_LABELS[role]}`}
      />
    )
  }

  return (
    <div
      ref={setRef}
      {...drag.listeners}
      {...drag.attributes}
      style={dragStyle}
      className={`
        rounded-md border-2 cursor-grab active:cursor-grabbing
        ${c.bg} ${c.border}
        h-9 px-1.5
        flex items-center gap-1
        ${isOver ? 'ring-2 ring-amber-400' : ''}
        ${drag.isDragging ? 'opacity-60 shadow-lg' : ''}
        transition-shadow
      `}
    >
      <span className={`
        inline-block px-1 py-0 rounded text-[8px] font-bold text-white flex-shrink-0
        ${c.badge}
      `}>
        {ROLE_LABELS[role]}
      </span>
      <span className="text-[10px] font-mono text-gray-500 flex-shrink-0">
        {student.seatNo}
      </span>
      <span className={`text-xs font-semibold ${c.text} truncate flex-1`}>
        {student.name}
      </span>
    </div>
  )
}

export default ClassroomLayout
