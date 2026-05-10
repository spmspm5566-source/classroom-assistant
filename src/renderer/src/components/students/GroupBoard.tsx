/**
 * GroupBoard.tsx — 分組概覽
 *
 * 兩種檢視模式：
 *  🏫 教室檢視（預設）— 每組為一直行，學生座位由上往下排列；含 講桌（圖五排列）
 *  🧪 實驗桌檢視     — 每組為一張長方形實驗桌，6 個座位環繞四周（圖三排列）
 *
 * 兩種檢視都支援：
 *  - 同組內學生位置可拖曳互換
 *  - 拖到空座位 = 把該學生改派到那個角色
 *  - 顯示座號 / 角色 / 姓名
 *  - 工具列「+ 新增小組 / − 移除最末組」可動態調整組數
 *
 * 跨組調整請至「學生清單」分頁，於每位學生的「分組」欄選擇。
 */

import React from 'react'
import type { Student, Group, StudentRole } from '../../db/schema'
import { useAppStore }     from '../../store/useAppStore'
import { createGroup, deleteGroup } from '../../db/groupRepo'
import { db }              from '../../db/schema'

import LabTableLayout    from './LabTableLayout'
import ClassroomLayout   from './ClassroomLayout'

const ALL_ROLES: StudentRole[] = ['leader', 'assistant', 'memberA', 'memberB', 'memberC', 'memberD']

/** Fisher-Yates 洗牌 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface GroupBoardProps {
  groups:   Group[]
  students: Student[]
}

type ViewMode = 'classroom' | 'labTables'

const VIEW_OPTIONS: { v: ViewMode; label: string; desc: string }[] = [
  { v: 'classroom', label: '🏫 教室檢視',   desc: '每組為一直行，靠講桌排列' },
  { v: 'labTables', label: '🧪 實驗桌檢視', desc: '依實驗室桌位環繞排列' }
]

const GroupBoard: React.FC<GroupBoardProps> = ({ groups, students }) => {
  const [view, setView] = React.useState<ViewMode>('classroom')
  const classId       = useAppStore(s => s.currentClassId)
  const examPeriodId  = useAppStore(s => s.currentExamPeriodId)

  // 未分組學生
  const ungrouped = students.filter(s => !s.groupId)

  // ── 新增小組 ──
  const handleAddGroup = async (): Promise<void> => {
    if (!classId || !examPeriodId) {
      window.alert('需要先選擇班級與段考期')
      return
    }
    const nextNum = groups.length === 0
      ? 1
      : Math.max(...groups.map(g => g.number)) + 1
    try {
      await createGroup(classId, examPeriodId, nextNum)
    } catch (e) {
      console.error(e)
      window.alert('新增失敗：' + e)
    }
  }

  // ── 隨機排座位（依目前檢視）──
  // classroom: 操作 groupId/role；lab: 操作 labGroupId/labRole
  const handleRandomize = async (): Promise<void> => {
    const isLab = view === 'labTables'
    const label = isLab ? '實驗桌' : '教室'
    const ok = window.confirm(
      `要把${label}檢視下「已分組但尚未指派角色」的學生隨機分派到各組空位嗎？\n\n` +
      '已指派角色的學生不會被動到。完成後可手動拖曳調整。'
    )
    if (!ok) return

    const groupOf = (s: typeof students[0]): string | null =>
      isLab ? (s.labGroupId ?? null) : s.groupId
    const roleOf  = (s: typeof students[0]): StudentRole | null =>
      isLab ? (s.labRole ?? null) : s.role

    try {
      await db.transaction('rw', db.students, async () => {
        for (const g of groups) {
          const inGroup    = students.filter(s => groupOf(s) === g.id)
          const usedRoles  = new Set(
            inGroup.filter(s => roleOf(s)).map(s => roleOf(s) as StudentRole)
          )
          const freeRoles  = shuffle(ALL_ROLES.filter(r => !usedRoles.has(r)))
          const unassigned = shuffle(inGroup.filter(s => !roleOf(s)))

          for (let i = 0; i < unassigned.length && i < freeRoles.length; i++) {
            const r = freeRoles[i]
            await db.students.update(
              unassigned[i].id,
              isLab ? { labRole: r } : { role: r }
            )
          }
        }
      })
    } catch (e) {
      console.error(e)
      window.alert('隨機排座位失敗：' + e)
    }
  }

  // ── 從教室同步到實驗桌（強制覆蓋實驗桌的座位）──
  const handleCopyFromClassroom = async (): Promise<void> => {
    const ok = window.confirm(
      '要把目前「教室檢視」的座位安排，整套複製到「實驗桌檢視」嗎？\n\n' +
      '⚠ 這會覆蓋實驗桌目前的所有座位編排。'
    )
    if (!ok) return
    try {
      await db.transaction('rw', db.students, async () => {
        for (const s of students) {
          await db.students.update(s.id, {
            labGroupId: s.groupId,
            labRole:    s.role
          })
        }
      })
    } catch (e) {
      console.error(e)
      window.alert('複製失敗：' + e)
    }
  }

  // ── 刪除最末組 ──
  const handleRemoveLast = async (): Promise<void> => {
    if (groups.length === 0) return
    const sorted = [...groups].sort((a, b) => b.number - a.number)
    const target = sorted[0]
    const memberCount = students.filter(s => s.groupId === target.id).length
    const ok = window.confirm(
      `確定要刪除「${target.name ?? `第${target.number}組`}」嗎？\n` +
      (memberCount > 0
        ? `組內 ${memberCount} 位成員會被解除分組（學生資料保留）。`
        : '此組目前沒有成員。')
    )
    if (!ok) return
    try {
      await deleteGroup(target.id)
    } catch (e) {
      console.error(e)
      window.alert('刪除失敗：' + e)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── 工具列 ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 檢視切換 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {VIEW_OPTIONS.map(opt => (
              <button
                key={opt.v}
                onClick={() => setView(opt.v)}
                title={opt.desc}
                className={`
                  h-8 px-4 text-xs font-medium rounded-lg transition-all
                  ${view === opt.v
                    ? 'bg-white shadow text-gray-800'
                    : 'text-gray-500 hover:text-gray-700'}
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 leading-tight">
            💡 同組內可拖曳<br/>座位互換位置
          </p>
        </div>

        {/* 組數控制 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            目前 <span className="font-bold text-gray-800">{groups.length}</span> 組
          </span>
          <button
            onClick={handleRandomize}
            disabled={groups.length === 0}
            title={`把${view === 'labTables' ? '實驗桌' : '教室'}檢視中已分組但尚未指派角色的學生隨機塞進空位`}
            className="
              h-8 px-3 rounded-lg text-xs font-semibold
              bg-amber-50 border border-amber-300 text-amber-800
              hover:bg-amber-100
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            🎲 隨機排{view === 'labTables' ? '實驗桌' : '教室'}座位
          </button>

          {view === 'labTables' && (
            <button
              onClick={handleCopyFromClassroom}
              title="把教室檢視的座位安排整套複製到實驗桌"
              className="
                h-8 px-3 rounded-lg text-xs font-semibold
                bg-white border border-gray-200 text-gray-600
                hover:border-brand-400 hover:text-brand-700
              "
            >
              📋 從教室複製
            </button>
          )}
          <button
            onClick={handleRemoveLast}
            disabled={groups.length === 0}
            className="
              h-8 px-3 rounded-lg text-xs font-semibold
              bg-white border border-gray-200 text-gray-600
              hover:border-red-300 hover:text-red-600
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            − 移除最末組
          </button>
          <button
            onClick={handleAddGroup}
            className="
              h-8 px-3 rounded-lg text-xs font-semibold
              bg-brand-600 hover:bg-brand-700 text-white shadow-sm
            "
          >
            ＋ 新增小組
          </button>
        </div>
      </div>

      {/* ── 主檢視 ── */}
      {view === 'classroom' && (
        <ClassroomLayout groups={groups} students={students} />
      )}
      {view === 'labTables' && (
        <LabTableLayout groups={groups} students={students} />
      )}

      {/* ── 未分組學生提示 ── */}
      {ungrouped.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-700 text-sm font-semibold">
              ⚠ 尚未分組的學生（{ungrouped.length} 人）
            </span>
          </div>
          <div className="text-xs text-amber-900">
            {ungrouped.map(s => `${s.seatNo} ${s.name}`).join('、')}
          </div>
          <p className="mt-2 text-xs text-amber-700">
            請至「學生清單」分頁，於每位學生的「分組」欄選擇組別。
          </p>
        </div>
      )}
    </div>
  )
}

export default GroupBoard
