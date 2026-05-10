/**
 * DrawResultModal.tsx — 抽中結果跳出視窗
 *
 * 顯示：
 *  - 大型座號 + 姓名
 *  - 角色標籤
 *  - 該節已答對 / 答錯次數
 *  - 答對 / 答錯 主按鈕
 *  - 快速加分按鈕（5/10/15/20/25/30 分，預設按角色基礎分）
 *
 * 採全螢幕半透明遮罩，覆蓋在座位表上，視覺強調。
 */

import React from 'react'
import { motion } from 'framer-motion'
import type { Student, ScoringRules } from '../../db/schema'
import { ROLE_LABELS } from '../../db/schema'

interface DrawResultModalProps {
  student:        Student
  rules:          ScoringRules
  streakCount:    number   // 該節連對次數（含本次預期）
  wrongCount:     number   // 該節答錯次數
  onCorrect:      (overrideScore?: number) => void
  onWrong:        () => void
  onCancel:       () => void   // 不採計，直接關閉（不寫入分數）
}

const DrawResultModal: React.FC<DrawResultModalProps> = ({
  student, rules,
  streakCount, wrongCount,
  onCorrect, onWrong, onCancel
}) => {
  const roleLabel = student.role ? ROLE_LABELS[student.role] : '（未指派角色）'

  return (
    <motion.div
      className="no-drag absolute inset-0 z-30 bg-black/60 flex items-center justify-center p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1,    y: 0  }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        className="
          w-full max-w-md
          bg-gradient-to-br from-yellow-100 via-amber-50 to-white
          rounded-2xl shadow-2xl border-2 border-yellow-400
          p-4
          relative
        "
      >
        {/* 取消（小×） */}
        <button
          onClick={onCancel}
          title="不採計，關閉"
          className="
            absolute top-2 right-2
            w-6 h-6 rounded-full
            bg-white/70 hover:bg-white text-gray-400 hover:text-gray-700
            flex items-center justify-center
            text-xs
          "
        >
          ✕
        </button>

        {/* 🎉 標題 */}
        <div className="text-center mb-2">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.3, 1] }}
            transition={{ duration: 0.4 }}
            className="text-2xl mb-0.5"
          >
            🎉
          </motion.div>
          <p className="text-[10px] font-medium text-amber-700">被抽到的是</p>
        </div>

        {/* 大型座號 + 姓名 */}
        <div className="text-center mb-3">
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex items-baseline justify-center gap-2"
          >
            <span className="text-2xl font-mono font-bold text-amber-600">
              {student.seatNo}
            </span>
            <span className="text-3xl font-bold text-gray-900">
              {student.name}
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-1 text-[11px] text-gray-600"
          >
            {roleLabel}
            {(streakCount > 0 || wrongCount > 0) && (
              <span className="ml-2">
                ・本節
                {streakCount > 0 && <span className="text-emerald-600 font-semibold ml-1">已答對 {streakCount} 次</span>}
                {wrongCount > 0 && <span className="text-red-500 font-semibold ml-1">已答錯 {wrongCount} 次</span>}
              </span>
            )}
          </motion.div>
        </div>

        {/* 答對 / 答錯 大按鈕 */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="grid grid-cols-2 gap-2 mb-2"
        >
          <button
            onClick={() => onCorrect()}
            className="
              h-12 rounded-xl
              bg-gradient-to-br from-emerald-500 to-green-600
              hover:shadow-lg active:scale-95
              text-white font-bold text-sm
              shadow-md transition-all
              flex items-center justify-center gap-1
            "
          >
            ✓ 答對
          </button>
          <button
            onClick={onWrong}
            className="
              h-12 rounded-xl
              bg-gradient-to-br from-red-500 to-rose-600
              hover:shadow-lg active:scale-95
              text-white font-bold text-sm
              shadow-md transition-all
              flex items-center justify-center gap-1
            "
          >
            ✗ 答錯
          </button>
        </motion.div>

        {/* 快速加分按鈕（覆蓋預設加分） */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >
          <p className="text-[10px] text-gray-500 mb-1 text-center">
            或直接指定加分（覆蓋角色基礎分）
          </p>
          <div className="flex gap-1">
            {rules.quickScores.map(s => (
              <button
                key={s}
                onClick={() => onCorrect(s)}
                className="
                  flex-1 h-7 rounded-md
                  bg-white border border-amber-300
                  text-amber-700 text-[11px] font-semibold
                  hover:bg-amber-100
                "
              >
                +{s}
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

export default DrawResultModal
