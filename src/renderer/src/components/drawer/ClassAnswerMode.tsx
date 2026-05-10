/**
 * ClassAnswerMode.tsx — 全班作答模式
 *
 * 顯示全班學生勾選清單。
 *  - 勾選 = 答對
 *  - 未勾 = 答錯
 *
 * 上方有快捷：
 *  [全對] 一鍵全部勾起
 *  [全錯] 一鍵全部取消
 *  個人加分：[5][10][15][20][25][30] 分（套用到所有勾選者）
 *
 * 確認送出後：
 *  - 勾選的學生 → 寫入答對事件（套用該分數，不走連對加成；維持簡單）
 *  - 未勾選的學生 → 寫入答錯事件（套用累進扣分規則）
 */

import React from 'react'
import type { Student, ScoringRules } from '../../db/schema'

interface ClassAnswerModeProps {
  students:        Student[]
  rules:           ScoringRules
  studentScores:   Record<string, number>
  onSubmit:        (correctIds: Set<string>, scorePerStudent: number) => void
  onCancel:        () => void
}

const ClassAnswerMode: React.FC<ClassAnswerModeProps> = ({
  students, rules, studentScores,
  onSubmit, onCancel
}) => {
  // 預設全部勾起（老師說「對的多就先按全對再取消錯的」）
  const [correctIds, setCorrectIds] = React.useState<Set<string>>(
    () => new Set(students.map(s => s.id))
  )
  const [scorePer, setScorePer] = React.useState<number>(rules.quickScores[1] ?? 10)

  const toggle = (id: string) => {
    setCorrectIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else              next.add(id)
      return next
    })
  }

  const allCorrect = () => setCorrectIds(new Set(students.map(s => s.id)))
  const allWrong   = () => setCorrectIds(new Set())

  const correctCount = correctIds.size
  const wrongCount   = students.length - correctIds.size

  return (
    <div className="no-drag absolute inset-0 z-30 bg-white flex flex-col">

      {/* ── 頂部 ── */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <span className="text-xs font-bold text-gray-700">
          👥 全班作答模式
          <span className="ml-2 text-[10px] font-normal text-gray-500">
            勾 = 對（{correctCount}） / 不勾 = 錯（{wrongCount}）
          </span>
        </span>
        <button
          onClick={onCancel}
          className="text-[11px] text-gray-500 hover:text-gray-800"
        >
          ✕ 取消
        </button>
      </div>

      {/* ── 操作列 ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <button
          onClick={allCorrect}
          className="h-7 px-2.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-semibold"
        >
          ✓ 全對
        </button>
        <button
          onClick={allWrong}
          className="h-7 px-2.5 rounded-md bg-red-500 hover:bg-red-600 text-white text-[11px] font-semibold"
        >
          ✗ 全錯
        </button>

        <span className="w-px h-5 bg-gray-200 mx-1" />

        <span className="text-[10px] text-gray-500">每位答對加</span>
        <div className="flex gap-1">
          {rules.quickScores.map(s => (
            <button
              key={s}
              onClick={() => setScorePer(s)}
              className={`
                h-7 w-9 rounded-md text-[11px] font-semibold transition-colors
                ${scorePer === s
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-amber-50'}
              `}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── 學生勾選網格 ── */}
      <div className="flex-1 overflow-auto p-2">
        <div className="grid grid-cols-4 gap-1">
          {students.map(s => {
            const isChecked = correctIds.has(s.id)
            const score     = studentScores[s.id] ?? 0
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className={`
                  flex items-center gap-1 px-1.5 py-1 rounded-md
                  text-[11px] transition-all border
                  ${isChecked
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-700 line-through opacity-60'}
                `}
              >
                <span className={`
                  flex-shrink-0 w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[9px] font-bold
                  ${isChecked ? 'bg-emerald-500 text-white' : 'bg-white border border-red-300 text-red-500'}
                `}>
                  {isChecked ? '✓' : '✗'}
                </span>
                <span className="font-mono text-[10px] text-gray-500 flex-shrink-0 w-4 text-right">
                  {s.seatNo}
                </span>
                <span className="flex-1 truncate text-left">{s.name}</span>
                {score !== 0 && (
                  <span className={`text-[9px] font-mono ${score > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {score > 0 ? `+${score}` : score}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 確認送出 ── */}
      <div className="flex gap-2 px-3 py-2 border-t border-gray-100 flex-shrink-0 bg-gray-50">
        <button
          onClick={onCancel}
          className="h-9 px-4 rounded-lg bg-white border border-gray-300 text-gray-600 text-xs font-semibold hover:bg-gray-100"
        >
          取消
        </button>
        <button
          onClick={() => onSubmit(correctIds, scorePer)}
          className="
            flex-1 h-9 rounded-lg
            bg-gradient-to-br from-rose-500 to-pink-600 hover:shadow-md
            text-white text-xs font-bold
          "
        >
          ✓ 確認送出（對 {correctCount} 人 +{scorePer}，錯 {wrongCount} 人按累進規則扣）
        </button>
      </div>
    </div>
  )
}

export default ClassAnswerMode
