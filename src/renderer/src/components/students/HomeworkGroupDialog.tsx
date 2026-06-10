/**
 * HomeworkGroupDialog.tsx — 作業檢查（每項作業一輪）
 *
 * 流程（可重複操作，一節課檢查多項作業）：
 *  1. 勾選「未完成作業」的學生 → 每人扣 homeworkPenalty 分（個人扣分）
 *  2. 按「確定」時，沒有任何人被勾選的組 → 自動加 groupAllDoneBonus 團體分
 *     （團體分以 studentId='__group__' 哨兵事件儲存，不計入個人分數）
 *  3. 套用後自動清空勾選，可直接檢查下一項作業
 */

import React from 'react'
import type { Student, Group } from '../../db/schema'
import { getConfig }               from '../../db/configRepo'
import { bulkAddScoreEvents }      from '../../db/scoreRepo'
import { getOrCreateTodaySession } from '../../db/sessionRepo'
import { useAppStore }             from '../../store/useAppStore'
import { playCorrect }             from '../../utils/audio'
import { GROUP_EVENT_STUDENT_ID }  from '../../hooks/useStudentScores'

interface Props {
  groups:       Group[]
  students:     Student[]
  examPeriodId: string | null
  onClose:      () => void
}

const HomeworkGroupDialog: React.FC<Props> = ({ groups, students, examPeriodId, onClose }) => {
  const currentClassId    = useAppStore(s => s.currentClassId)
  const currentSession    = useAppStore(s => s.currentSessionId)
  const setCurrentSession = useAppStore(s => s.setCurrentSession)

  // 勾選「未完成作業」的學生 id
  const [checked, setChecked]       = React.useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = React.useState(false)
  const [doneMsg, setDoneMsg]       = React.useState<string | null>(null)
  const [roundCount, setRoundCount] = React.useState(0)   // 本次開啟已檢查幾項作業

  // 規則分數（顯示用；UI 可能存負值，統一取絕對值）
  const [penalty, setPenalty] = React.useState(70)
  const [bonus, setBonus]     = React.useState(100)
  React.useEffect(() => {
    getConfig().then(cfg => {
      setPenalty(Math.abs(cfg.rules.homeworkPenalty ?? 70))
      setBonus(Math.abs(cfg.rules.groupAllDoneBonus ?? 100))
    })
  }, [])

  const sortedGroups = React.useMemo(
    () => [...groups].sort((a, b) => a.number - b.number),
    [groups]
  )
  const ungroupedStudents = students.filter(s => !s.groupId)

  // 每組的成員 + 是否「全組完成」（組內無人被勾且有成員）
  const groupStatus = React.useMemo(() => {
    return sortedGroups.map(g => {
      const members  = students.filter(s => s.groupId === g.id)
      const undone   = members.filter(s => checked.has(s.id))
      return {
        group:    g,
        members,
        undone,
        allDone:  members.length > 0 && undone.length === 0
      }
    })
  }, [sortedGroups, students, checked])

  const doneGroupCount = groupStatus.filter(gs => gs.allDone).length

  /** 確保目前節次 session 存在並回傳 sessionId */
  const ensureSession = async (): Promise<string> => {
    if (!currentClassId) throw new Error('請先選擇班級')
    if (currentSession) return currentSession
    const s = await getOrCreateTodaySession(currentClassId)
    setCurrentSession(s.id)
    return s.id
  }

  const toggleCheck = (id: string) => {
    setDoneMsg(null)
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── 確定：未完成扣分 + 全完成的組自動加團體分 ──────────────
  const handleSubmit = async () => {
    if (!currentClassId || !examPeriodId) { window.alert('請先選擇班級與段考期'); return }

    setSubmitting(true)
    try {
      const sessionId = await ensureSession()
      const round     = roundCount + 1
      const noteSuffix = `（第 ${round} 項作業）`

      // 1. 未完成的學生：個人扣分
      const undoneStudents = students.filter(s => checked.has(s.id))
      const penaltyEvents = undoneStudents.map(s => ({
        studentId:    s.id,
        classId:      currentClassId,
        sessionId,
        examPeriodId,
        groupId:      s.groupId ?? null,
        score:        -penalty,
        type:         'homework' as const,
        note:         '作業未繳' + noteSuffix
      }))

      // 2. 全組完成的組：團體加分（哨兵事件，不計入個人）
      const doneGroups = groupStatus.filter(gs => gs.allDone)
      const bonusEvents = doneGroups.map(gs => ({
        studentId:    GROUP_EVENT_STUDENT_ID,
        classId:      currentClassId,
        sessionId,
        examPeriodId,
        groupId:      gs.group.id,
        score:        bonus,
        type:         'group_done' as const,
        note:         '全組完成（團體加分）' + noteSuffix
      }))

      await bulkAddScoreEvents([...penaltyEvents, ...bonusEvents])

      playCorrect()
      const doneNames = doneGroups
        .map(gs => gs.group.name ?? `第${gs.group.number}組`)
        .join('、')
      setDoneMsg(
        `第 ${round} 項作業已記錄：` +
        (undoneStudents.length > 0 ? `${undoneStudents.length} 人未繳各扣 ${penalty} 分；` : '全班皆完成；') +
        (doneGroups.length > 0 ? `${doneNames} 團體各加 ${bonus} 分` : '無全組完成的組')
      )
      setRoundCount(round)
      setChecked(new Set())   // 清空，可直接檢查下一項作業
    } catch (e) {
      window.alert('寫入失敗：' + e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="
          bg-white rounded-2xl shadow-2xl w-full max-w-lg
          flex flex-col max-h-[88vh] overflow-hidden
        "
        onClick={e => e.stopPropagation()}
      >
        {/* ── 標題 ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">📋 作業檢查</h2>
            {roundCount > 0 && (
              <p className="text-[11px] text-gray-400 mt-0.5">本節課已檢查 {roundCount} 項作業</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg"
          >✕</button>
        </div>

        {/* ── 說明 ── */}
        <div className="px-5 py-3 text-xs text-gray-500 bg-gray-50 border-b border-gray-100 leading-relaxed">
          勾選「<span className="font-bold text-red-600">未完成作業</span>」的學生，每人扣 <span className="font-bold text-red-600">{penalty} 分</span>。
          按「確定」時，<span className="font-bold text-green-600">沒有人被勾選的組自動獲團體 +{bonus} 分</span>。
          可重複操作檢查多項作業。
        </div>

        {/* ── 完成訊息 ── */}
        {doneMsg && (
          <div className="mx-5 mt-3 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700 font-medium leading-relaxed">
            ✅ {doneMsg}
          </div>
        )}

        {/* ── 學生勾選清單（依組分類，組標題顯示完成狀態）── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {groupStatus.map(({ group: g, members, undone, allDone }) => {
            if (members.length === 0) return null
            return (
              <div key={g.id}>
                <div className="flex items-center gap-2 px-1 mb-1">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: g.color ?? '#9ca3af' }}
                  />
                  <span className="text-[11px] font-semibold text-gray-500">
                    {g.name ?? `第${g.number}組`}
                  </span>
                  {allDone ? (
                    <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                      ✓ 全組完成 → 團體 +{bonus}
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-red-500">
                      {undone.length} 人未繳
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {members.map(s => (
                    <StudentCheckbox
                      key={s.id}
                      student={s}
                      checked={checked.has(s.id)}
                      onChange={() => toggleCheck(s.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {ungroupedStudents.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 px-1 mb-1">
                未分組（只扣個人分，不影響團體）
              </p>
              <div className="grid grid-cols-3 gap-1">
                {ungroupedStudents.map(s => (
                  <StudentCheckbox
                    key={s.id}
                    student={s}
                    checked={checked.has(s.id)}
                    onChange={() => toggleCheck(s.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── 底部摘要 + 確定 ── */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100">
          <div className="text-xs leading-relaxed">
            <span className="text-red-600 font-semibold">{checked.size} 人未繳（各 -{penalty}）</span>
            <span className="mx-1 text-gray-300">｜</span>
            <span className="text-green-600 font-semibold">{doneGroupCount} 組全完成（各 +{bonus}）</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="
              h-10 px-6 rounded-xl text-sm font-bold
              bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm
              hover:brightness-105 active:scale-[0.98] transition
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {submitting ? '記錄中…' : '✅ 確定'}
          </button>
        </div>
      </div>
    </div>
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
