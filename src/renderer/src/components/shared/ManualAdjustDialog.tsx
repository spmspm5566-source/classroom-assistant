/**
 * ManualAdjustDialog.tsx — 手動加減分對話框
 *
 * 讓老師在任何頁面快速對單一學生進行手動加分 / 扣分，
 * 並填寫備註（例如「課堂發言」「忘帶課本」）。
 *
 * 用法：
 *   const [open, setOpen] = React.useState(false)
 *   const [targetId, setTargetId] = React.useState<string | null>(null)
 *   <ManualAdjustDialog open={open} preselectedStudentId={targetId}
 *                        classId={clsId} sessionId={sessionId}
 *                        onClose={() => setOpen(false)} />
 */

import React from 'react'
import { addScoreEvent }from '../../db/scoreRepo'
import { useAppStore }  from '../../store/useAppStore'
import { useScopedStudents } from '../../hooks/useScopedStudents'
import Button           from './Button'

interface Props {
  open:                  boolean
  onClose:               () => void
  /** 預先選中的學生 id（從外部帶入，可為 null） */
  preselectedStudentId?: string | null
  /** 若不傳，使用 useAppStore 的 currentClassId */
  classId?:              string | null
  /** 若不傳，使用 useAppStore 的 currentSessionId */
  sessionId?:            string | null
}

export const ManualAdjustDialog: React.FC<Props> = ({
  open, onClose, preselectedStudentId, classId: propClassId, sessionId: propSessionId
}) => {
  const storeClassId    = useAppStore(s => s.currentClassId)
  const storeSessionId  = useAppStore(s => s.currentSessionId)
  const examPeriodId    = useAppStore(s => s.currentExamPeriodId)

  const classId   = propClassId   ?? storeClassId
  const sessionId = propSessionId ?? storeSessionId

  // ── 學生清單（已合併目前段考期的分組指派，使加分能正確歸入小組）──
  const students = useScopedStudents(classId, examPeriodId)

  // ── 本地狀態 ──
  const [selectedId, setSelectedId] = React.useState<string>(preselectedStudentId ?? '')
  const [score,      setScore]      = React.useState<string>('')
  const [note,       setNote]       = React.useState<string>('')
  const [saving,     setSaving]     = React.useState(false)

  // 當 preselectedStudentId 改變時同步
  React.useEffect(() => {
    if (preselectedStudentId) setSelectedId(preselectedStudentId)
  }, [preselectedStudentId])

  // 關閉時重置
  const handleClose = () => {
    setScore('')
    setNote('')
    setSaving(false)
    onClose()
  }

  // ── 送出 ──
  const handleSubmit = async () => {
    const scoreNum = Number(score)
    if (!selectedId) { window.alert('請選擇學生'); return }
    if (!Number.isFinite(scoreNum) || scoreNum === 0) { window.alert('請輸入有效的加減分（不可為 0）'); return }
    if (!sessionId)  { window.alert('尚無節次資料，請先從主頁選擇班級'); return }
    if (!examPeriodId) { window.alert('尚無段考期，請先在標題列建立段考期'); return }

    const stu = students.find(s => s.id === selectedId)

    setSaving(true)
    try {
      await addScoreEvent({
        studentId:    selectedId,
        classId:      classId!,
        sessionId,
        examPeriodId,
        groupId:      stu?.groupId ?? null,
        score:        scoreNum,
        type:         'manual',
        note:         note.trim() || undefined
      })
      handleClose()
    } catch (e) {
      console.error(e)
      window.alert('儲存失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const parsedScore = Number(score)
  const isPositive  = Number.isFinite(parsedScore) && parsedScore > 0
  const isNegative  = Number.isFinite(parsedScore) && parsedScore < 0

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={handleClose}
      />

      {/* 對話框 */}
      <div className="
        fixed z-50
        top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
        w-[420px] max-w-[90vw]
        bg-white rounded-2xl shadow-2xl
        p-6
      ">
        {/* 標題 */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-800">✏️ 手動加減分</h2>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            ✕
          </button>
        </div>

        {/* 學生選單 */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">學生</label>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="
              w-full h-10 px-3 text-sm
              bg-white border border-gray-200 rounded-xl
              focus:outline-none focus:border-brand-500
            "
          >
            <option value="">— 請選擇學生 —</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>
                {s.seatNo}. {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* 分數輸入 */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            加減分（正數加分、負數扣分）
          </label>
          <div className="flex gap-2">
            {/* 快速正 */}
            {[5, 10, 20].map(v => (
              <button
                key={v}
                onClick={() => setScore(String(v))}
                className="
                  flex-1 h-9 rounded-lg text-sm font-semibold
                  bg-emerald-50 text-emerald-700 border border-emerald-200
                  hover:bg-emerald-100
                "
              >
                +{v}
              </button>
            ))}
            {/* 快速負 */}
            {[-5, -10, -20].map(v => (
              <button
                key={v}
                onClick={() => setScore(String(v))}
                className="
                  flex-1 h-9 rounded-lg text-sm font-semibold
                  bg-rose-50 text-rose-700 border border-rose-200
                  hover:bg-rose-100
                "
              >
                {v}
              </button>
            ))}
          </div>

          <input
            type="number"
            value={score}
            onChange={e => setScore(e.target.value)}
            placeholder="或直接輸入數字（如 -30）"
            className={`
              mt-2 w-full h-10 px-3 text-sm font-mono text-center
              border rounded-xl focus:outline-none
              ${isPositive ? 'border-emerald-400 bg-emerald-50 text-emerald-700 focus:border-emerald-500'
                : isNegative ? 'border-rose-400 bg-rose-50 text-rose-700 focus:border-rose-500'
                : 'border-gray-200 bg-white focus:border-brand-500'}
            `}
          />
        </div>

        {/* 備註 */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">備註（選填）</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="例：課堂發言、忘帶課本…"
            maxLength={50}
            className="
              w-full h-10 px-3 text-sm
              bg-gray-50 border border-gray-200 rounded-xl
              focus:outline-none focus:border-brand-500 focus:bg-white
            "
          />
        </div>

        {/* 按鈕 */}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={handleClose}>取消</Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!selectedId || !score || saving}
            loading={saving}
            onClick={handleSubmit}
          >
            {isNegative ? '確認扣分' : '確認加分'}
          </Button>
        </div>
      </div>
    </>
  )
}

export default ManualAdjustDialog
