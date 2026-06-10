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
import { primeAudio }      from '../../utils/audio'
import { assignClassroom, assignLab } from '../../db/assignmentRepo'
import { reorderGroups }   from '../../db/groupRepo'

import LabTableLayout       from './LabTableLayout'
import ClassroomLayout      from './ClassroomLayout'
import DrawerPage           from '../../pages/DrawerPage'
import TimerPage            from '../../pages/TimerPage'
import ScoreQueryPanel      from './ScoreQueryPanel'
import HomeworkGroupDialog  from './HomeworkGroupDialog'

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
  groups:       Group[]
  students:     Student[]
  examPeriodId: string | null
  onOpenTool?: (mode: 'timer' | 'drawer' | 'mini' | 'normal') => void
}

type ViewMode = 'classroom' | 'labTables'

const VIEW_OPTIONS: { v: ViewMode; label: string; desc: string }[] = [
  { v: 'classroom', label: '🏫 教室檢視',   desc: '每組為一直行，靠講桌排列' },
  { v: 'labTables', label: '🧪 實驗桌檢視', desc: '依實驗室桌位環繞排列' }
]

const GroupBoard: React.FC<GroupBoardProps> = ({ groups, students, examPeriodId, onOpenTool }) => {
  const [view, setView] = React.useState<ViewMode>('classroom')
  const setCurrentPage  = useAppStore(s => s.setCurrentPage)
  const currentClassId  = useAppStore(s => s.currentClassId)

  // ── 小組排序 Modal ──
  const [showReorder, setShowReorder]   = React.useState(false)
  const [reorderList, setReorderList]   = React.useState<Group[]>([])
  const [reordering, setReordering]     = React.useState(false)

  const openReorder = () => {
    setReorderList([...groups].sort((a, b) => a.number - b.number))
    setShowReorder(true)
  }

  const moveItem = (idx: number, dir: -1 | 1) => {
    const next = [...reorderList]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setReorderList(next)
  }

  const handleReorderSave = async () => {
    setReordering(true)
    try {
      await reorderGroups(reorderList.map(g => g.id))
      setShowReorder(false)
    } catch (e) {
      window.alert('重新排序失敗：' + e)
    } finally {
      setReordering(false)
    }
  }

  // 抽籤 / 計時器 / 加分查詢 / 課堂記錄 浮動面板
  const [showDrawer, setShowDrawer]               = React.useState(false)
  const [showTimer, setShowTimer]                 = React.useState(false)
  const [showScoreQuery, setShowScoreQuery]       = React.useState(false)
  const [showHomeworkGroup, setShowHomeworkGroup] = React.useState(false)

  // 啟動工具（先解除瀏覽器音效限制）
  const openTool = (mode: 'timer' | 'drawer') => {
    primeAudio()
    if (mode === 'drawer')      setShowDrawer(true)   // 抽籤 → 置中浮動面板
    else if (mode === 'timer')  setShowTimer(true)    // 計時器 → 右上角浮窗
    else                        onOpenTool?.(mode)
  }

  // 計時器浮窗位置（可拖曳）
  const [timerPos, setTimerPos] = React.useState({ x: 0, y: 0 })  // 相對右上角的位移
  const dragRef = React.useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const onTimerDragStart = (e: React.PointerEvent) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: timerPos.x, oy: timerPos.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onTimerDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.sx
    const dy = e.clientY - dragRef.current.sy
    setTimerPos({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy })
  }
  const onTimerDragEnd = () => { dragRef.current = null }

  // 未分組學生
  const ungrouped = students.filter(s => !s.groupId)

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

    if (!examPeriodId || !currentClassId) return
    const groupOf = (s: typeof students[0]): string | null =>
      isLab ? (s.labGroupId ?? null) : s.groupId
    const roleOf  = (s: typeof students[0]): StudentRole | null =>
      isLab ? (s.labRole ?? null) : s.role

    try {
      for (const g of groups) {
        const inGroup = students.filter(s => groupOf(s) === g.id)

        // 找出實際佔住角色的學生（每個角色只算第一位），重複者視為待重排
        const used = new Set<StudentRole>()
        const needSeat: typeof inGroup = []
        for (const s of inGroup) {
          const r = roleOf(s)
          if (r && !used.has(r)) used.add(r)
          else needSeat.push(s)   // 無角色 或 角色重複
        }

        const freeRoles  = shuffle(ALL_ROLES.filter(r => !used.has(r)))
        const unassigned = shuffle(needSeat)

        for (let i = 0; i < unassigned.length && i < freeRoles.length; i++) {
          const r = freeRoles[i]
          const s = unassigned[i]
          if (isLab) await assignLab(examPeriodId, currentClassId, s.id, s.labGroupId ?? null, r)
          else       await assignClassroom(examPeriodId, currentClassId, s.id, s.groupId, r)
        }
      }
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
    if (!examPeriodId || !currentClassId) return
    try {
      for (const s of students) {
        await assignLab(examPeriodId, currentClassId, s.id, s.groupId, s.role)
      }
    } catch (e) {
      console.error(e)
      window.alert('複製失敗：' + e)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── 課堂快捷按鈕：倒數計時 / 抽籤 / 加分查詢（固定在頂端，捲動時不被遮住）── */}
      <div className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-gray-50/95 backdrop-blur rounded-xl flex flex-wrap items-center gap-3">
        <button
          onClick={() => openTool('timer')}
          className="
            flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-bold
            bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm
            hover:brightness-105 active:scale-[0.98] transition
          "
        >
          ⏱ 倒數計時
        </button>
        <button
          onClick={() => openTool('drawer')}
          disabled={!currentClassId}
          className="
            flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-bold
            bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-sm
            hover:brightness-105 active:scale-[0.98] transition
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          🎲 抽籤
        </button>
        <button
          onClick={() => setShowScoreQuery(true)}
          disabled={!currentClassId}
          className="
            flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-bold
            bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-sm
            hover:brightness-105 active:scale-[0.98] transition
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          📊 加分查詢
        </button>
        <button
          onClick={() => setShowHomeworkGroup(true)}
          disabled={!currentClassId}
          className="
            flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-bold
            bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm
            hover:brightness-105 active:scale-[0.98] transition
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          📋 作業檢查
        </button>
        <button
          onClick={() => setCurrentPage('dashboard')}
          disabled={!currentClassId}
          className="
            flex items-center gap-1 h-11 px-3 rounded-xl text-xs font-medium
            text-gray-500 hover:bg-gray-100 transition
            disabled:opacity-40 disabled:cursor-not-allowed
          "
          title="開啟完整加分總覽頁面"
        >
          完整總覽 →
        </button>
        <p className="text-[11px] text-gray-400 leading-tight ml-1">
          下課時按「加分查詢」<br/>看本節課個人與小組加分排名
        </p>
      </div>

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

        {/* 工具列（組數由「班級管理」的預設小組數控制）*/}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            目前 <span className="font-bold text-gray-800">{groups.length}</span> 組
          </span>
          <button
            onClick={openReorder}
            disabled={groups.length === 0}
            title="調整小組的顯示順序（重新編號）"
            className="
              h-8 px-3 rounded-lg text-xs font-semibold
              bg-white border border-gray-200 text-gray-600
              hover:border-brand-400 hover:text-brand-700
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            🔀 重新排序
          </button>
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
        </div>
      </div>

      {/* ── 主檢視 ── */}
      {view === 'classroom' && (
        <ClassroomLayout groups={groups} students={students} examPeriodId={examPeriodId} />
      )}
      {view === 'labTables' && (
        <LabTableLayout groups={groups} students={students} examPeriodId={examPeriodId} />
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

      {/* ── 抽籤浮動面板（直接浮在座位表上）── */}
      {showDrawer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowDrawer(false)}
        >
          <div
            className="
              relative bg-white rounded-2xl shadow-2xl overflow-hidden
              w-full max-w-[880px] h-[88vh] max-h-[680px]
            "
            onClick={e => e.stopPropagation()}
          >
            <DrawerPage embedded onClose={() => setShowDrawer(false)} />
          </div>
        </div>
      )}

      {/* ── 計時器浮窗（右上角、無遮罩、可拖曳，座位表仍可操作）── */}
      {showTimer && (
        <div
          className="fixed z-40 w-[340px] rounded-2xl shadow-2xl border border-amber-200 bg-white overflow-hidden"
          style={{
            top:   `calc(5rem + ${timerPos.y}px)`,
            right: `calc(1.5rem - ${timerPos.x}px)`,
            height: 240
          }}
        >
          {/* 拖曳把手 */}
          <div
            onPointerDown={onTimerDragStart}
            onPointerMove={onTimerDragMove}
            onPointerUp={onTimerDragEnd}
            className="h-5 bg-amber-100 cursor-move flex items-center justify-center text-[10px] text-amber-600 select-none"
          >
            ⠿ 拖曳移動
          </div>
          <div style={{ height: 'calc(100% - 1.25rem)' }}>
            <TimerPage embedded onClose={() => setShowTimer(false)} />
          </div>
        </div>
      )}

      {/* ── 加分查詢浮動面板 ── */}
      {showScoreQuery && (
        <ScoreQueryPanel onClose={() => setShowScoreQuery(false)} />
      )}

      {/* ── 課堂記錄（作業未繳 / 全組完成）── */}
      {showHomeworkGroup && (
        <HomeworkGroupDialog
          groups={groups}
          students={students}
          examPeriodId={examPeriodId}
          onClose={() => setShowHomeworkGroup(false)}
        />
      )}

      {/* ── 小組排序 Modal ── */}
      {showReorder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 no-drag">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-gray-800 mb-1">🔀 重新排序小組</h3>
            <p className="text-xs text-gray-500 mb-4">
              用 ↑↓ 調整順序，儲存後小組將依此重新編號（第 1 組、第 2 組…）。
            </p>

            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {reorderList.map((g, idx) => (
                <div
                  key={g.id}
                  className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-200"
                >
                  {/* 新編號預覽 */}
                  <span className="w-7 h-7 flex items-center justify-center rounded-full bg-brand-600 text-white text-xs font-bold flex-shrink-0">
                    {idx + 1}
                  </span>
                  {/* 原始名稱 */}
                  <span className="flex-1 text-sm text-gray-700 font-medium">
                    {g.name ?? `第 ${g.number} 組`}
                    <span className="ml-1 text-xs text-gray-400">（原第 {g.number} 組）</span>
                  </span>
                  {/* 上下移動 */}
                  <div className="flex gap-1">
                    <button
                      onClick={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 text-xs"
                    >▲</button>
                    <button
                      onClick={() => moveItem(idx, 1)}
                      disabled={idx === reorderList.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 text-xs"
                    >▼</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => setShowReorder(false)}
                className="h-9 px-4 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleReorderSave}
                disabled={reordering}
                className="h-9 px-5 rounded-xl text-sm bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {reordering ? '儲存中…' : '✅ 儲存新順序'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GroupBoard
