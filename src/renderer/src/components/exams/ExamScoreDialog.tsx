/**
 * ExamScoreDialog.tsx — 考試成績輸入 / 編輯對話框
 *
 * 開啟時：載入該考試所有學生分數草稿，使用者修改 → 即時計算「預計加分」。
 * 行動：
 *  - 儲存草稿（只寫 ExamScore，不影響加分總覽）
 *  - 套用加分（寫 ScoreEvent + 標記 appliedAt）
 *  - 撤銷加分（已套用後想重新編輯）
 *
 * 套用後：列上會顯示「✓ 已套用」標記。
 */

import React from 'react'
import { useLiveQuery }    from 'dexie-react-hooks'
import { db, ROLE_LABELS } from '../../db/schema'
import type { Exam, Student, ScoringRules } from '../../db/schema'
import {
  computeBonus,
  bulkUpsertExamScores,
  applyExamBonuses,
  unapplyExamBonuses
}                          from '../../db/examScoreRepo'
import { updateExam }      from '../../db/examRepo'
import { getConfig }       from '../../db/configRepo'
import Modal               from '../shared/Modal'
import Button              from '../shared/Button'
import { formatScoreChange } from '../../utils/scoring'

interface Props {
  open:    boolean
  onClose: () => void
  exam:    Exam | null
}

interface RowState {
  studentId: string
  scoreText: string   // 用 string 保留輸入過程的空白狀態
}

const ExamScoreDialog: React.FC<Props> = ({ open, onClose, exam }) => {
  const [rows, setRows]         = React.useState<Record<string, string>>({})
  const [saving, setSaving]     = React.useState(false)
  const [applying, setApplying] = React.useState(false)
  const [editName, setEditName] = React.useState('')
  const [editDate, setEditDate] = React.useState('')

  // ── 撈資料 ──
  const config = useLiveQuery(() => getConfig(), [], null)
  const students = useLiveQuery(
    () => exam ? db.students.where('classId').equals(exam.classId).sortBy('seatNo') : [],
    [exam?.classId],
    []
  ) ?? []
  const existingScores = useLiveQuery(
    () => exam ? db.examScores.where('examId').equals(exam.id).toArray() : [],
    [exam?.id],
    []
  ) ?? []

  // ── 開啟時：把已存在的成績填回 rows ──
  React.useEffect(() => {
    if (!exam) {
      setRows({})
      return
    }
    setEditName(exam.name)
    setEditDate(exam.date)
    const map: Record<string, string> = {}
    for (const sc of existingScores) {
      map[sc.studentId] = String(sc.score)
    }
    setRows(map)
  }, [exam, existingScores.length])

  if (!open || !exam || !config) return null

  const isApplied = exam.appliedAt !== null
  const rules = config.rules

  // ── 即時計算每位學生的預計加分 ──
  const previewBonus = (stu: Student): { score: number | null; bonus: number | null } => {
    const text = rows[stu.id] ?? ''
    if (!text.trim()) return { score: null, bonus: null }
    const score = Number(text)
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return { score: null, bonus: null }
    }
    return { score, bonus: computeBonus(exam, stu, score, rules) }
  }

  // 全班預計加分總和
  const totalBonus = students.reduce((sum, s) => {
    const { bonus } = previewBonus(s)
    return sum + (bonus ?? 0)
  }, 0)

  // 已輸入分數的學生數
  const filledCount = students.filter(s => {
    const t = rows[s.id]
    return t && t.trim() !== '' && !isNaN(Number(t))
  }).length

  // ── 操作：儲存草稿 ──
  const handleSaveDraft = async () => {
    setSaving(true)
    try {
      const inputs = students
        .map(s => {
          const text = rows[s.id] ?? ''
          if (!text.trim()) return null
          const score = Number(text)
          if (!Number.isFinite(score)) return null
          return {
            examId:      exam.id,
            studentId:   s.id,
            score,
            bonusEarned: computeBonus(exam, s, score, rules)
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
      await bulkUpsertExamScores(inputs)
      // 同時更新 Exam 元資料（名稱、日期）
      if (editName.trim() && (editName !== exam.name || editDate !== exam.date)) {
        await updateExam(exam.id, { name: editName.trim(), date: editDate })
      }
    } catch (e) {
      console.error(e)
      window.alert('儲存失敗：' + e)
    } finally {
      setSaving(false)
    }
  }

  // ── 操作：套用加分 ──
  const handleApply = async () => {
    if (filledCount === 0) {
      window.alert('還沒有任何學生分數，無法套用加分。')
      return
    }
    const ok = window.confirm(
      `確定要把 ${filledCount} 位學生的考試加分套用到「加分總覽」嗎？\n\n` +
      `預計總加分：${formatScoreChange(totalBonus)} 分\n\n` +
      `（之後如想修改分數，需先「撤銷加分」再重套）`
    )
    if (!ok) return

    // 先儲存草稿，再套用
    await handleSaveDraft()

    setApplying(true)
    try {
      const result = await applyExamBonuses(exam, students)
      window.alert(`✅ 已套用！共寫入 ${result.applied} 筆加分事件，總加分 ${formatScoreChange(result.totalBonus)}。`)
      onClose()
    } catch (e) {
      console.error(e)
      window.alert('套用失敗：' + e)
    } finally {
      setApplying(false)
    }
  }

  // ── 操作：撤銷加分 ──
  const handleUnapply = async () => {
    const ok = window.confirm(
      `確定要撤銷「${exam.name}」的加分嗎？\n\n` +
      `撤銷後，此考試在加分總覽的記錄會被移除，可重新編輯分數後再次套用。\n` +
      `學生填寫的成績不會被刪除。`
    )
    if (!ok) return
    try {
      const count = await unapplyExamBonuses(exam.id)
      window.alert(`已撤銷 ${count} 筆加分事件，可重新編輯成績。`)
    } catch (e) {
      console.error(e)
      window.alert('撤銷失敗：' + e)
    }
  }

  // ── 渲染 ──
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`📝 ${exam.name}（${exam.type === 'quiz' ? '平常考' : '段考'}）`}
      width="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-gray-500">
            {filledCount} / {students.length} 已填，預計總加分{' '}
            <span className={totalBonus > 0 ? 'text-emerald-700 font-bold' : totalBonus < 0 ? 'text-rose-700 font-bold' : 'text-gray-700'}>
              {formatScoreChange(totalBonus)}
            </span>
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>關閉</Button>
            {isApplied ? (
              <Button variant="danger" onClick={handleUnapply}>撤銷加分</Button>
            ) : (
              <>
                <Button variant="secondary" loading={saving} onClick={handleSaveDraft}>
                  儲存草稿
                </Button>
                <Button variant="primary" loading={applying} disabled={applying || filledCount === 0} onClick={handleApply}>
                  套用加分
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      {/* 元資料編輯 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">考試名稱</label>
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            disabled={isApplied}
            className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 disabled:bg-gray-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">考試日期</label>
          <input
            type="date"
            value={editDate}
            onChange={e => setEditDate(e.target.value)}
            disabled={isApplied}
            className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 disabled:bg-gray-100"
          />
        </div>
      </div>

      {/* 已套用提示 */}
      {isApplied && (
        <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
          ✓ 此考試的加分已於 {new Date(exam.appliedAt!).toLocaleString('zh-TW')} 套用至加分總覽。
          要修改分數請先按下方「撤銷加分」。
        </div>
      )}

      {/* 規則速覽 */}
      <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
        <p className="font-semibold mb-1">📐 套用規則（{exam.type === 'quiz' ? '平常考依角色標準' : '段考依個人標準'}）</p>
        {exam.type === 'quiz' ? (
          <p>
            標準分依角色：組長 {rules.quizRules.leader.standard}、助教 {rules.quizRules.assistant.standard}、組員 {rules.quizRules.memberA.standard}。
            每高 1 分 +{rules.quizRules.leader.perAbove}、每低 1 分 -{rules.quizRules.leader.perBelow}；
            ≥90 +{rules.quizRules.leader.bonus90}、≥95 +{rules.quizRules.leader.bonus95}、100 +{rules.quizRules.leader.bonus100}。
          </p>
        ) : (
          <p>
            標準分使用學生個人的「段考個人標準」（在學生資料設定，未設則為 {rules.examRule.standard}）。
            每高 1 分 +{rules.examRule.perAbove}、每低 1 分 -{rules.examRule.perBelow}；
            ≥90 +{rules.examRule.bonus90}、≥95 +{rules.examRule.bonus95}、100 +{rules.examRule.bonus100}。
          </p>
        )}
      </div>

      {/* 學生分數表 */}
      {students.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-4 text-center">此班尚無學生</p>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[50vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-14">座號</th>
                <th className="px-3 py-2 text-left font-medium">姓名</th>
                <th className="px-3 py-2 text-left font-medium w-20">角色</th>
                <th className="px-3 py-2 text-center font-medium w-20">標準分</th>
                <th className="px-3 py-2 text-center font-medium w-24">成績</th>
                <th className="px-3 py-2 text-right font-medium w-24">預計加分</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.map(s => {
                const { score, bonus } = previewBonus(s)
                const standard = exam.type === 'quiz'
                  ? rules.quizRules[s.role ?? 'memberA'].standard
                  : (s.standardScore?.exam ?? rules.examRule.standard)
                return (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 text-xs font-mono">{s.seatNo}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">{s.name}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {s.role ? ROLE_LABELS[s.role] : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-mono text-gray-500">{standard}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min={0} max={100} step={1}
                        value={rows[s.id] ?? ''}
                        onChange={e => setRows(r => ({ ...r, [s.id]: e.target.value }))}
                        disabled={isApplied}
                        placeholder="—"
                        className="
                          w-16 h-8 px-2 text-sm font-mono text-center
                          bg-white border border-gray-200 rounded-md
                          focus:outline-none focus:border-brand-500
                          disabled:bg-gray-100
                        "
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {bonus === null ? (
                        <span className="text-gray-300 text-xs">—</span>
                      ) : (
                        <span className={`
                          text-sm font-bold tabular-nums
                          ${bonus > 0 ? 'text-emerald-600' : bonus < 0 ? 'text-rose-600' : 'text-gray-400'}
                        `}>
                          {formatScoreChange(bonus)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

export default ExamScoreDialog
