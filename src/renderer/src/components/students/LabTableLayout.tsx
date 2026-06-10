/**
 * LabTableLayout.tsx — 實驗桌教室排列（v4：每組允許多位相同角色）
 *
 *           [講桌]                       ← 教室前方
 *   [第3組] [第2組] [第1組]                ← 第一列（靠講桌）
 *   [第6組] [第5組] [第4組]
 *           ...
 *           ↓ 教室後方
 *
 *  每組以一張長方形實驗桌呈現，6 個「角色區」環繞四周。
 *  - 同一角色可有多位學生 → 該角色區內堆疊顯示
 *  - 拖曳以「學生」為單位：拖到別的角色區 = 改角色；拖到別人身上 = 互換
 *  - 每列固定 3 組，同列右側為較小組號；第 1-3 組靠講桌
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
import { assignClassroom, assignLab } from '../../db/assignmentRepo'

interface Props {
  groups:       Group[]
  students:     Student[]
  examPeriodId: string | null
}

// 6 個座位在實驗桌四周的位置（依「入座順序」排列）：
//  1-4 人坐兩側（左上、左下、右上、右下，一邊各兩人）
//  第 5 人坐桌「後方」（上）、第 6 人坐桌「前方」（下，靠講桌側）
const SEAT_POSITIONS: { gridArea: string }[] = [
  { gridArea: '2 / 1 / 3 / 2' },   // 1. 左上
  { gridArea: '3 / 1 / 4 / 2' },   // 2. 左下
  { gridArea: '2 / 3 / 3 / 4' },   // 3. 右上
  { gridArea: '3 / 3 / 4 / 4' },   // 4. 右下
  { gridArea: '1 / 2 / 2 / 3' },   // 5. 桌後方（上）
  { gridArea: '4 / 2 / 5 / 3' }    // 6. 桌前方（下，靠講桌）
]

export const ROLE_COLORS: Record<StudentRole, { bg: string; border: string; text: string; badge: string }> = {
  leader:    { bg: 'bg-red-50',     border: 'border-red-300',     text: 'text-red-800',     badge: 'bg-red-500'     },
  assistant: { bg: 'bg-orange-50',  border: 'border-orange-300',  text: 'text-orange-800',  badge: 'bg-orange-500'  },
  memberA:   { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-500' },
  memberB:   { bg: 'bg-cyan-50',    border: 'border-cyan-300',    text: 'text-cyan-800',    badge: 'bg-cyan-500'    },
  memberC:   { bg: 'bg-violet-50',  border: 'border-violet-300',  text: 'text-violet-800',  badge: 'bg-violet-500'  },
  memberD:   { bg: 'bg-pink-50',    border: 'border-pink-300',    text: 'text-pink-800',    badge: 'bg-pink-500'    }
}

/** 拖曳資料：以學生為單位（studentId 為 undefined 表示空角色區） */
export interface SeatKey {
  groupId:    string
  role:       StudentRole
  studentId?: string
}

// ── 主元件 ───────────────────────────────────────────────────

const LabTableLayout: React.FC<Props> = ({ groups, students, examPeriodId }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )
  const classId = students[0]?.classId ?? null

  const sortedGroups = React.useMemo(
    () => [...groups].sort((a, b) => a.number - b.number),
    [groups]
  )

  // 每列 3 組；同列內反轉使第 1 組在右（站講桌前視角）
  // rows 反轉後：第 1-3 組在最後一列（最靠近講桌）
  const rows: Group[][] = []
  for (let i = 0; i < sortedGroups.length; i += 3) {
    rows.push([...sortedGroups.slice(i, i + 3)].reverse())
  }
  rows.reverse()

  const handleDragEnd = makeSwapHandler(students, 'lab', examPeriodId, classId)

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        {/* 教室後方（上） */}
        <p className="text-center text-[11px] text-gray-400">↑ 教室後方</p>

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

// ── 拖曳處理：以學生為單位 ──────────────────────────────────

/**
 * makeSwapHandler
 * @param layout 'classroom' = 寫 groupId/role；'lab' = 寫 labGroupId/labRole
 *
 * ⚠ 角色固定原則：學生的角色依匯入的 Excel 設定，拖曳只改變「組別」，
 *   絕不改變角色。
 *
 * 行為：
 *  - 拖到「另一位學生」身上 → 兩人互換組別（各自保留原角色）
 *  - 拖到「角色區空白處」 → 該學生移到該組（保留原角色）
 */
export function makeSwapHandler(
  students:     Student[],
  layout:       'classroom' | 'lab',
  examPeriodId: string | null,
  classId:      string | null
) {
  const groupOf = (s: Student): string | null =>
    layout === 'lab' ? (s.labGroupId ?? null) : s.groupId
  const roleOf  = (s: Student): StudentRole | null =>
    layout === 'lab' ? (s.labRole ?? null) : s.role

  const write = async (studentId: string, gid: string, role: StudentRole | null): Promise<void> => {
    if (!examPeriodId || !classId || !role) return
    if (layout === 'lab') await assignLab(examPeriodId, classId, studentId, gid, role)
    else                  await assignClassroom(examPeriodId, classId, studentId, gid, role)
  }

  return async (e: DragEndEvent): Promise<void> => {
    if (!e.over) return
    const from = e.active.data.current as SeatKey | undefined
    const to   = e.over.data.current   as SeatKey | undefined
    if (!from?.studentId || !to) return
    if (from.studentId === to.studentId) return

    const studentA = students.find(s => s.id === from.studentId)
    const studentB = to.studentId ? students.find(s => s.id === to.studentId) : undefined
    if (!studentA) return

    if (studentB) {
      // 互換組別：A 去 B 的組、B 去 A 的組；角色各自保留
      const aGroup = groupOf(studentA)
      const bGroup = groupOf(studentB)
      if (bGroup) await write(studentA.id, bGroup, roleOf(studentA))
      if (aGroup) await write(studentB.id, aGroup, roleOf(studentB))
    } else {
      // 移到目標組（保留原角色，不採用目標區的角色）
      await write(studentA.id, to.groupId, roleOf(studentA))
    }
  }
}

// ── 子元件：單張實驗桌 ────────────────────────────────────

interface LabTableGroupProps {
  group:    Group
  students: Student[]
}

const ROLE_SORT: Record<StudentRole, number> = {
  leader: 0, assistant: 1, memberA: 2, memberB: 3, memberC: 4, memberD: 5
}

const LabTableGroup: React.FC<LabTableGroupProps> = ({ group, students }) => {
  // 實驗桌檢視：以 labGroupId / labRole 為準
  // 每組固定 6 個座位：成員依角色排序依序入座，空位補虛線格
  const groupMembers = students
    .filter(s => (s.labGroupId ?? null) === group.id)
    .sort((a, b) => {
      const ra = a.labRole ? ROLE_SORT[a.labRole] : 99
      const rb = b.labRole ? ROLE_SORT[b.labRole] : 99
      return ra - rb || a.seatNo - b.seatNo
    })

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
        {/* 桌身：組別 + 人數 */}
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

        {/* 6 個座位：成員依序入座（顯示各自的角色徽章），其餘為空位 */}
        {SEAT_POSITIONS.map(({ gridArea }, i) => {
          const stu = groupMembers[i]
          if (!stu || !stu.labRole) {
            return (
              <EmptySeat
                key={`empty-${i}`}
                layoutPrefix="lab"
                groupId={group.id}
                slotIndex={i}
                gridArea={gridArea}
              />
            )
          }
          return (
            <div key={stu.id} style={{ gridArea }} className="flex flex-col justify-center">
              <StudentCard
                layoutPrefix="lab"
                groupId={group.id}
                role={stu.labRole}
                student={stu}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 共用子元件：角色區（droppable 容器 + 學生卡堆疊） ─────────

interface RoleZoneProps {
  layoutPrefix: string             // 'lab' | 'cls'（讓兩種檢視的 dnd id 不衝突）
  groupId:      string
  role:         StudentRole
  students:     Student[]
  gridArea?:    string
}

export const RoleZone: React.FC<RoleZoneProps> = ({ layoutPrefix, groupId, role, students, gridArea }) => {
  const c = ROLE_COLORS[role]
  const { isOver, setNodeRef } = useDroppable({
    id:   `${layoutPrefix}-zone-${groupId}-${role}`,
    data: { groupId, role } as SeatKey
  })

  // 有學生：每人一張獨立座位卡（無共用外框）；
  // 沒學生：顯示一個虛線空位（拖放目標）。
  if (students.length === 0) {
    return (
      <div
        ref={setNodeRef}
        style={gridArea ? { gridArea } : undefined}
        className={`
          rounded-md border-2 border-dashed
          ${c.border}
          min-h-[38px]
          ${isOver ? 'ring-2 ring-amber-400 bg-amber-50' : ''}
          transition-shadow
        `}
        aria-label={`空座位 ${ROLE_LABELS[role]}`}
      />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={gridArea ? { gridArea } : undefined}
      className={`
        flex flex-col gap-1
        rounded-md
        ${isOver ? 'ring-2 ring-amber-400' : ''}
      `}
      aria-label={`${ROLE_LABELS[role]} 區`}
    >
      {students.map(s => (
        <StudentCard
          key={s.id}
          layoutPrefix={layoutPrefix}
          groupId={groupId}
          role={role}
          student={s}
        />
      ))}
    </div>
  )
}

// ── 共用子元件：通用空座位（拖放目標，不限定角色）────────────

interface EmptySeatProps {
  layoutPrefix: string
  groupId:      string
  slotIndex:    number
  gridArea?:    string
}

export const EmptySeat: React.FC<EmptySeatProps> = ({ layoutPrefix, groupId, slotIndex, gridArea }) => {
  // 空位不指定角色：拖進來的學生保留自己原本的角色（role 僅為型別佔位，handler 不採用）
  const { isOver, setNodeRef } = useDroppable({
    id:   `${layoutPrefix}-empty-${groupId}-${slotIndex}`,
    data: { groupId, role: 'memberA' } as SeatKey
  })

  return (
    <div
      ref={setNodeRef}
      style={gridArea ? { gridArea } : undefined}
      className={`
        rounded-md border-2 border-dashed border-gray-200
        min-h-[38px] h-9
        ${isOver ? 'ring-2 ring-amber-400 bg-amber-50' : ''}
        transition-shadow
      `}
      aria-label="空座位"
    />
  )
}

// ── 共用子元件：學生卡（draggable + droppable 可互換） ────────

interface StudentCardProps {
  layoutPrefix: string
  groupId:      string
  role:         StudentRole
  student:      Student
}

export const StudentCard: React.FC<StudentCardProps> = ({ layoutPrefix, groupId, role, student }) => {
  const c = ROLE_COLORS[role]
  const data: SeatKey = { groupId, role, studentId: student.id }

  const { isOver, setNodeRef: dropRef } = useDroppable({
    id:   `${layoutPrefix}-drop-${student.id}`,
    data
  })
  const drag = useDraggable({
    id:   `${layoutPrefix}-drag-${student.id}`,
    data
  })

  const setRef = (node: HTMLElement | null): void => {
    dropRef(node)
    drag.setNodeRef(node)
  }

  const dragStyle: React.CSSProperties = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`, zIndex: 50, position: 'relative' }
    : {}

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
      <span className="text-[10px] font-mono text-gray-500 flex-shrink-0">{student.seatNo}</span>
      <span className={`text-xs font-semibold ${c.text} truncate flex-1`}>
        {student.name}
      </span>
    </div>
  )
}

export default LabTableLayout
