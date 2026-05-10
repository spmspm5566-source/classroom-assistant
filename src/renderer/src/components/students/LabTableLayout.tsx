/**
 * LabTableLayout.tsx — 實驗桌教室排列（v3：講桌在上、第1組在右）
 *
 *           [講桌]                       ← 教室前方
 *   [第3組] [第2組] [第1組]                ← 第一列（靠講桌）
 *   [第6組] [第5組] [第4組]
 *           ...
 *           ↓ 教室後方
 *
 *  每組以一張長方形實驗桌呈現，6 個座位環繞四周。
 *  - 每列固定 3 組
 *  - 同列右側為較小組號（站在講桌前的視角，第 1 組在自己的右手邊）
 *  - 講桌在最上方；教室後方在最下方
 *  - 桌身內不再寫「第N組」（避免與上方標題重複）
 *  - 空座位只剩虛線框，不顯示角色文字
 *
 * 拖曳：同組／跨組互換，由 makeSwapHandler 處理（並 export 給 ClassroomLayout 共用）
 */

import React from 'react'
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type { Student, Group, StudentRole } from '../../db/schema'
import { ROLE_LABELS } from '../../db/schema'
import { db } from '../../db/schema'

interface Props {
  groups:   Group[]
  students: Student[]
}

// 6 個角色在實驗桌四周的位置
const SEAT_POSITIONS: { role: StudentRole; gridArea: string }[] = [
  { role: 'leader',    gridArea: '1 / 2 / 2 / 3' },
  { role: 'memberA',   gridArea: '2 / 1 / 3 / 2' },
  { role: 'memberC',   gridArea: '2 / 3 / 3 / 4' },
  { role: 'memberB',   gridArea: '3 / 1 / 4 / 2' },
  { role: 'memberD',   gridArea: '3 / 3 / 4 / 4' },
  { role: 'assistant', gridArea: '4 / 2 / 5 / 3' }
]

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

const LabTableLayout: React.FC<Props> = ({ groups, students }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const sortedGroups = React.useMemo(
    () => [...groups].sort((a, b) => a.number - b.number),
    [groups]
  )

  // 每列 3 組；列順序：第 1-3 組為頂列（靠講桌），第 4-6 組為次列…
  // 同列內反轉（右大左小？相反，第 1 組在右）：[3, 2, 1]
  const rows: Group[][] = []
  for (let i = 0; i < sortedGroups.length; i += 3) {
    rows.push([...sortedGroups.slice(i, i + 3)].reverse())
  }

  const handleDragEnd = makeSwapHandler(students, 'lab')

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
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

        {rows.map((row, idx) => (
          <div key={idx} className="grid grid-cols-3 gap-4">
            {/* 補滿前面缺位讓組號靠右 */}
            {Array.from({ length: 3 - row.length }).map((_, i) => (
              <div key={`empty-${idx}-${i}`} />
            ))}
            {row.map(g => (
              <LabTableGroup
                key={g.id}
                group={g}
                students={students}
              />
            ))}
          </div>
        ))}

        {/* 教室後方（下） */}
        <p className="text-center text-[11px] text-gray-400">↓ 教室後方</p>
      </div>
    </DndContext>
  )
}

// ── 跨組座位互換 / 移動 ────────────────────────────────────

/**
 * makeSwapHandler
 * @param students 全班學生
 * @param layout   'classroom' = 寫 groupId/role；'lab' = 寫 labGroupId/labRole
 *
 * 兩種 layout 的拖曳互不影響：
 *  - 在教室檢視拖曳：只動 groupId/role
 *  - 在實驗桌檢視拖曳：只動 labGroupId/labRole
 */
export function makeSwapHandler(
  students: Student[],
  layout:   'classroom' | 'lab'
) {
  // 取出學生「在此 layout 下」的組別與角色
  const groupOf = (s: Student): string | null =>
    layout === 'lab' ? (s.labGroupId ?? null) : s.groupId
  const roleOf  = (s: Student): StudentRole | null =>
    layout === 'lab' ? (s.labRole ?? null) : s.role

  // 寫入指定 layout 對應的欄位
  const writeUpdate = (gid: string, role: StudentRole): Partial<Student> =>
    layout === 'lab'
      ? { labGroupId: gid, labRole: role }
      : { groupId: gid,   role }

  return async (e: DragEndEvent): Promise<void> => {
    if (!e.over) return
    const from = e.active.data.current as SeatKey | undefined
    const to   = e.over.data.current   as SeatKey | undefined
    if (!from || !to) return
    if (from.groupId === to.groupId && from.role === to.role) return

    const studentA = students.find(s => groupOf(s) === from.groupId && roleOf(s) === from.role)
    const studentB = students.find(s => groupOf(s) === to.groupId   && roleOf(s) === to.role)

    await db.transaction('rw', db.students, async () => {
      if (studentA && studentB) {
        await db.students.update(studentA.id, writeUpdate(to.groupId,   to.role))
        await db.students.update(studentB.id, writeUpdate(from.groupId, from.role))
      } else if (studentA) {
        await db.students.update(studentA.id, writeUpdate(to.groupId, to.role))
      }
    })
  }
}

// ── 子元件：單張實驗桌 ────────────────────────────────────

interface LabTableGroupProps {
  group:    Group
  students: Student[]
}

const LabTableGroup: React.FC<LabTableGroupProps> = ({ group, students }) => {
  // 實驗桌檢視：以 labGroupId / labRole 為準（與教室獨立）
  const groupMembers = students.filter(s => (s.labGroupId ?? null) === group.id)
  const byRole = new Map<StudentRole, Student>()
  for (const s of groupMembers) {
    const r = s.labRole ?? null
    if (r && !byRole.has(r)) byRole.set(r, s)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: '1fr 1fr 1fr',
          gridTemplateRows:    'auto auto auto auto',
          minHeight: 200
        }}
      >
        {/* 桌身：顯示組別 + 人數（取代上方組標） */}
        <div
          className="
            rounded-md bg-gradient-to-br from-amber-50 to-amber-100
            border-2 border-amber-300 shadow-inner
            flex flex-col items-center justify-center gap-0.5
            select-none
          "
          style={{ gridArea: '2 / 2 / 4 / 3' }}
        >
          <div className="flex items-center gap-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: group.color ?? '#d97706' }}
            />
            <span
              className="text-xs font-bold"
              style={{ color: group.color ?? '#92400e' }}
            >
              {group.name ?? `第${group.number}組`}
            </span>
          </div>
          <span className="text-[10px] text-amber-700">
            {groupMembers.length} 人
          </span>
        </div>

        {/* 6 個座位 */}
        {SEAT_POSITIONS.map(({ role, gridArea }) => (
          <SeatSlot
            key={role}
            groupId={group.id}
            role={role}
            student={byRole.get(role)}
            gridArea={gridArea}
          />
        ))}
      </div>
    </div>
  )
}

// ── 子元件：單一座位（draggable + droppable） ───────────

interface SeatSlotProps {
  groupId:  string
  role:     StudentRole
  student:  Student | undefined
  gridArea: string
}

const SeatSlot: React.FC<SeatSlotProps> = ({ groupId, role, student, gridArea }) => {
  const c = ROLE_COLORS[role]

  const dropId = `lab-drop-${groupId}-${role}`
  const dragId = `lab-drag-${groupId}-${role}`

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
    // 空座位：只虛線框，無文字
    return (
      <div
        ref={setRef}
        style={{ gridArea, ...dragStyle }}
        className={`
          rounded-md border-2 border-dashed
          ${c.border}
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
      style={{ gridArea, ...dragStyle }}
      className={`
        rounded-md border-2 cursor-grab active:cursor-grabbing
        ${c.bg} ${c.border}
        flex flex-col items-center justify-center
        px-1 py-1
        ${isOver ? 'ring-2 ring-amber-400' : ''}
        ${drag.isDragging ? 'opacity-60 shadow-lg' : ''}
        transition-shadow
      `}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <span className={`
          inline-block px-1 py-0 rounded text-[8px] font-bold text-white
          ${c.badge}
        `}>
          {ROLE_LABELS[role]}
        </span>
        <span className="text-[10px] font-mono text-gray-500">{student.seatNo}</span>
      </div>
      <span className={`text-xs font-bold ${c.text} truncate max-w-full`}>
        {student.name}
      </span>
    </div>
  )
}

export default LabTableLayout
