/**
 * HomeworkGroupDialog.tsx — 作業未繳 / 全組完成 快速記錄
 *
 * 作業未繳：勾選未繳學生 → 每人扣 homeworkPenalty 分（預設 -70）
 * 全組完成：點選小組 → 全組每位成員各加 groupAllDoneBonus 分（預設 +100）
 *
 * 加分/扣分都寫入 ScoreEvent，會即時反映在加分總覽。
 */

import React from 'react'
import type { Student, Group } from '../../db/schema'
import { getConfig }                  from '../../db/configRepo'
import { addScoreEvent, bulkAddScoreEvents } from '../../db/scoreRepo'
import { getOrCreateTodaySession }    from '../../db/sessionRepo'
import { useAppStore }                from '../../store/useAppStore'
import { playCorrect, playWrong }     from '../../utils/audio'
import { GROUP_EVENT_STUDENT_ID }     from '../../hooks/useStudentScores'

interface Props {
  groups:       Group[]
  students:     Student[]
  examPeriodId: string | null
  onClose:      () => void
}

type TabId = 'homework' | 'groupDone'

const HomeworkGroupDialog: React.FC<Props> = ({ groups, students, examPeriodId, onClose }) => {
  const currentClassId  = useAppStore(s => s.currentClassId)
  const currentSession  = useAppStore(s => s.currentSessionId)
  const setCurrentSession = useAppStore(s => s.setCurrentSession)

  const [tab, setTab] = React.useState<TabId>('homework')

  // 作業未繳：被勾選的學生 id
  const [checked, setChecked] = React.useState<Set<string>>(new Set())

  // 全組完成：選擇中的組（顯示確認 UI）
  const [confirmGroupId, setConfirmGroupId] = React.useState<string | null>(null)

  const [submitting, setSubmitting] = React.useState(false)
  const [doneMsg, setDoneMsg]       = React.useState<string | null>(null)

  /** 確保目前節次 session 存在並回傳 sessionId */
  const ensureSession = async (): Promise<string> => {
    if (!currentClassId) throw new Error('請先選擇班級')
    if (currentSession) return currentSession
    const s = await getOrCreateTodaySession(currentClassId)
    setCurrentSession(s.id)
    return s.id
  }

  const toggleCheck = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (checked.size === students.length) setChecked(new Set())
    else setChecked(new Set(students.map(s => s.id)))
  }

  // ── 送出：作業未繳 ─────────────────────────────────────────
  const handleHomeworkSubmit = async () => {
    if (checked.size === 0) { window.alert('請至少勾選一位學生'); return }
    if (!currentClassId || !examPeriodId) { window.alert('請先選擇班級與段考期'); return }

    setSubmitting(true)
    try {
      const cfg       = await getConfig()
      const penalty   = cfg.rules.homeworkPenalty ?? 70
      const sessionId = await ensureSession()

      const selected = students.filter(s => checked.has(s.id))
      await bulkAddScoreEvents(selected.map(s => ({
        studentId:    s.id,
        classId:      currentClassId,
        sessionId,
        examPeriodId,
        groupId:      s.groupId ?? null,
        score:        -penalty,
        type:         'homework' as const,
        note:         '作業未繳'
      })))

      playWrong()
      setDoneMsg(`已對 ${selected.length} 位學生扣 ${penalty} 分（作業未繳）`)
      setChecked(new Set())
    } catch (e) {
      window.alert('寫入失敗：' + e)
    } finally {
      setSubmitting(false)
    }
  }

  // ── 送出：全組完成（團體加分，不計入個人）─────────────────
  const handleGroupDoneSubmit = async (groupId: string) => {
    if (!currentClassId || !examPeriodId) { window.alert('請先選擇班級與段考期'); return }

    setSubmitting(true)
    try {
      const cfg       = await getConfig()
      const bonus     = cfg.rules.groupAllDoneBonus ?? 100
      const sessionId = await ensureSession()
      const group     = groups.find(g => g.id === groupId)
      const members   = students.filter(s => s.groupId === groupId)

      if (members.length === 0) {
        window.alert('此組目前沒有成員')
        setSubmitting(false)
        return
      }

      // 寫入一筆「群組事件」（studentId = GROUP_EVENT_STUDENT_ID），
      // 不計入任何個人分數，僅在小組總分中顯示。
      await addScoreEvent({
        studentId:    GROUP_EVENT_STUDENT_ID,
        classId:      currentClassId,
        sessionId,
        examPeriodId,
        groupId,
        score:        bonus,
        type:         'group_done',
        note:         '全組完成（團體加分）'
      })

      playCorrect()
      const gName = group?.name ?? `第${group?.number ?? '?'}組`
      setDoneMsg(`${gName} 團體加 ${bonus} 分（不計入個人）`)
      setConfirmGroupId(null)
    } catch (e) {
      window.alert('寫入失敗：' + e)
    } finally {
      setSubmitting(false)
    }
  }

  // 依教室分組顯示（依 groupId 分類）
  const sortedGroups = React.useMemo(
    () => [...groups].sort((a, b) => a.number - b.number),
    [groups]
  )
  const ungroupedStudents  = students.filter(s => !s.groupId)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="
          bg-white rounded-2xl shadow-2xl w-full max-w-lg
          flex flex-col max-h-[85vh] overflow-hidden
        "
        onClick={e => e.stopPropagation()}
      >
        {/* ── 標題 ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">📋 課堂快速記錄</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg"
          >✕</button>
        </div>

        {/* ── 分頁 Tab ── */}
        <div className="flex border-b border-gray-100 px-5">
          <button
            onClick={() => { setTab('homework'); setDoneMsg(null) }}
            className={`
              py-2.5 px-4 text-sm font-medium border-b-2 transition-all
              ${tab === 'homework'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'}
            `}
          >
            📚 作業未繳
          </button>
          <button
            onClick={() => { setTab('groupDone'); setDoneMsg(null); setConfirmGroupId(null) }}
            className={`
              py-2.5 px-4 text-sm font-medium border-b-2 transition-all
              ${tab === 'groupDone'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'}
            `}
          >
            ✅ 全組完成
          </button>
        </div>

        {/* ── 完成訊息 ── */}
        {doneMsg && (
          <div className="mx-5 mt-3 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
            ✅ {doneMsg}
          </div>
        )}

        {/* ── 作業未繳 Tab ── */}
        {tab === 'homework' && (
          <HomeworkTab
            students={students}
            groups={sortedGroups}
            ungrouped={ungroupedStudents}
            checked={checked}
            onToggle={toggleCheck}
            onToggleAll={toggleAll}
            submitting={submitting}
            onSubmit={handleHomeworkSubmit}
          />
        )}

        {/* ── 全組完成 Tab ── */}
        {tab === 'groupDone' && (
          <GroupDoneTab
            groups={sortedGroups}
            students={students}
            confirmGroupId={confirmGroupId}
            setConfirmGroupId={setConfirmGroupId}
            submitting={submitting}
            onSubmit={handleGroupDoneSubmit}
          />
        )}
      </div>
    </div>
  )
}

// ── 作業未繳子元件 ─────────────────────────────────────────────

interface HomeworkTabProps {
  students:   Student[]
  groups:     Group[]
  ungrouped:  Student[]
  checked:    Set<string>
  onToggle:   (id: string) => void
  onToggleAll: () => void
  submitting: boolean
  onSubmit:   () => void
}

const HomeworkTab: React.FC<HomeworkTabProps> = ({
  students, groups, ungrouped, checked, onToggle, onToggleAll, submitting, onSubmit
}) => {
  const [penalty, setPenalty] = React.useState(70)
  React.useEffect(() => {
    getConfig().then(cfg => setPenalty(cfg.rules.homeworkPenalty ?? 70))
  }, [])

  return (
    <>
      <div className="px-5 py-3 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
        勾選「未繳作業」的學生，每人扣 <span className="font-bold text-red-600">{penalty} 分</span>。
        勾選後按「套用扣分」。
      </div>

      {/* 全選 */}
      <div className="px-5 py-2 border-b border-gray-100 flex items-center gap-2">
        <input
          type="checkbox"
          id="hw-all"
          checked={checked.size === students.length && students.length > 0}
          onChange={onToggleAll}
          className="w-4 h-4 accent-red-500"
        />
        <label htmlFor="hw-all" className="text-xs font-semibold text-gray-600 cursor-pointer">
          全選（{students.length} 人）
        </label>
        {checked.size > 0 && (
          <span className="ml-auto text-xs text-red-600 font-semibold">
            已選 {checked.size} 人，扣 {checked.size * penalty} 分
          </span>
        )}
      </div>

      {/* 學生列表（依組別分類） */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {groups.map(g => {
          const members = students.filter(s => s.groupId === g.id)
          if (members.length === 0) return null
          return (
            <div key={g.id}>
              <p className="text-[10px] font-semibold text-gray-400 px-1 mb-1">
                {g.name ?? `第${g.number}組`}
              </p>
              <div className="grid grid-cols-3 gap-1">
                {members.map(s => (
                  <StudentCheckbox
                    key={s.id}
                    student={s}
                    checked={checked.has(s.id)}
                    onChange={() => onToggle(s.id)}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {ungrouped.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 px-1 mb-1">未分組</p>
            <div className="grid grid-cols-3 gap-1">
              {ungrouped.map(s => (
                <StudentCheckbox
                  key={s.id}
                  student={s}
                  checked={checked.has(s.id)}
                  onChange={() => onToggle(s.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部按鈕 */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100">
        <span className="text-xs text-gray-400">
          {checked.size === 0 ? '尚未勾選任何學生' : `準備對 ${checked.size} 人套用 -${penalty} 分`}
        </span>
        <button
          onClick={onSubmit}
          disabled={checked.size === 0 || submitting}
          className="
            h-9 px-5 rounded-xl text-sm font-bold
            bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-sm
            hover:brightness-105 active:scale-[0.98] transition
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {submitting ? '套用中…' : `📚 套用扣分（-${penalty} 分）`}
        </button>
      </div>
    </>
  )
}

// ── 全組完成子元件 ─────────────────────────────────────────────

interface GroupDoneTabProps {
  groups:           Group[]
  students:         Student[]
  confirmGroupId:   string | null
  setConfirmGroupId: (id: string | null) => void
  submitting:       boolean
  onSubmit:         (groupId: string) => void
}

const GroupDoneTab: React.FC<GroupDoneTabProps> = ({
  groups, students, confirmGroupId, setConfirmGroupId, submitting, onSubmit
}) => {
  const [bonus, setBonus] = React.useState(100)
  React.useEffect(() => {
    getConfig().then(cfg => setBonus(cfg.rules.groupAllDoneBonus ?? 100))
  }, [])

  return (
    <>
      <div className="px-5 py-3 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
        點選完成任務的小組，<span className="font-bold text-green-600">團體加 {bonus} 分</span>。
        <span className="ml-1 text-gray-400">（計入小組總分，不計入個人分數）</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {groups.map(g => {
          const members = students.filter(s => s.groupId === g.id)
          const isConfirm = confirmGroupId === g.id
          return (
            <div
              key={g.id}
              className={`
                rounded-xl border-2 p-3 transition-all
                ${isConfirm
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-green-200'}
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: g.color ?? '#16a34a' }}
                  />
                  <span className="text-sm font-semibold text-gray-800">
                    {g.name ?? `第${g.number}組`}
                  </span>
                  <span className="text-xs text-gray-400">（{members.length} 人）</span>
                </div>

                {!isConfirm ? (
                  <button
                    onClick={() => setConfirmGroupId(g.id)}
                    disabled={members.length === 0 || submitting}
                    className="
                      h-8 px-4 rounded-lg text-xs font-bold
                      bg-green-100 text-green-700 border border-green-300
                      hover:bg-green-200 transition
                      disabled:opacity-40 disabled:cursor-not-allowed
                    "
                  >
                    ✅ 全組完成
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-700 font-semibold">
                      確定加 {bonus} 分？
                    </span>
                    <button
                      onClick={() => onSubmit(g.id)}
                      disabled={submitting}
                      className="
                        h-8 px-3 rounded-lg text-xs font-bold
                        bg-green-500 text-white
                        hover:bg-green-600 transition
                        disabled:opacity-40
                      "
                    >
                      {submitting ? '…' : '確定'}
                    </button>
                    <button
                      onClick={() => setConfirmGroupId(null)}
                      disabled={submitting}
                      className="
                        h-8 px-3 rounded-lg text-xs font-medium
                        bg-white border border-gray-200 text-gray-500
                        hover:bg-gray-50 transition
                      "
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>

              {/* 成員名單（確認時顯示） */}
              {isConfirm && members.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {members.map(s => (
                    <span
                      key={s.id}
                      className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[11px] font-medium"
                    >
                      {s.seatNo} {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {groups.length === 0 && (
          <div className="py-8 text-center text-gray-400 text-sm">
            目前沒有小組，請先至「學生與分組」頁面設定分組。
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
        全組成員皆在「教室檢視」分組中。尚未分組的學生不會被計入。
      </div>
    </>
  )
}

// ── 學生勾選格 ─────────────────────────────────────────────────

interface StudentCheckboxProps {
  student: Student
  checked: boolean
  onChange: () => void
}

const StudentCheckbox: React.FC<StudentCheckboxProps> = ({ student, checked, onChange }) => (
  <label
    className={`
      flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer
      border transition-all select-none
      ${checked
        ? 'bg-red-50 border-red-300 text-red-800'
        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'}
    `}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-3.5 h-3.5 accent-red-500 flex-shrink-0"
    />
    <span className="text-[11px] font-mono text-gray-400">{student.seatNo}</span>
    <span className="text-xs font-medium truncate">{student.name}</span>
  </label>
)

export default HomeworkGroupDialog
