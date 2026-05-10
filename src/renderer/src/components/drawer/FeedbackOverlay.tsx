/**
 * FeedbackOverlay.tsx — 答對 / 答錯 反饋動畫
 *
 * 全螢幕半透明覆蓋，顯示：
 *  - 大型 ✓ 或 ✗
 *  - 讚美語句（答對）/ 鼓勵語句（答錯）
 *  - 加分跳動數字（往上飄）
 *
 * 1.6 秒後自動結束，呼叫 onDone。
 */

import React from 'react'
import { motion } from 'framer-motion'
import type { FeedbackContent } from '../../store/useDrawerStore'

interface FeedbackOverlayProps {
  feedback: FeedbackContent
  onDone:   () => void
}

// 動畫總時長（毫秒）
const FEEDBACK_DURATION = 1700

const FeedbackOverlay: React.FC<FeedbackOverlayProps> = ({ feedback, onDone }) => {
  const isCorrect = feedback.type === 'correct'
  const isBatch   = feedback.type === 'batch'

  // 自動結束
  React.useEffect(() => {
    const timer = setTimeout(onDone, FEEDBACK_DURATION)
    return () => clearTimeout(timer)
  }, [onDone])

  // 點擊也可提前結束
  const handleClick = () => onDone()

  return (
    <motion.div
      onClick={handleClick}
      className={`
        no-drag absolute inset-0 z-40
        flex flex-col items-center justify-center
        cursor-pointer
        ${isCorrect
          ? 'bg-gradient-to-br from-emerald-500/90 via-green-400/90 to-yellow-400/90'
          : 'bg-gradient-to-br from-red-500/90 via-rose-500/90 to-orange-400/90'}
      `}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* 大型圖示 */}
      <motion.div
        initial={{ scale: 0, rotate: isCorrect ? -180 : 180 }}
        animate={{ scale: [0, 1.4, 1], rotate: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="text-7xl mb-1 drop-shadow-lg"
      >
        {isCorrect ? '🎉' : '💪'}
      </motion.div>

      {/* 讚美/鼓勵語句 */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-white font-bold text-xl text-center mb-0.5 drop-shadow"
      >
        {feedback.phrase}
      </motion.div>

      {/* 學生資訊（單人時） */}
      {feedback.studentName && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-white/90 text-xs font-medium mb-2"
        >
          {feedback.roleLabel && <span className="mr-1">{feedback.roleLabel}</span>}
          {feedback.studentName}
        </motion.div>
      )}

      {/* 批次資訊（全班作答結算） */}
      {isBatch && feedback.batchInfo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-white/90 text-xs mb-2 flex gap-2"
        >
          <span>✓ 對 {feedback.batchInfo.correct} 人</span>
          <span>✗ 錯 {feedback.batchInfo.wrong} 人</span>
        </motion.div>
      )}

      {/* 加分數字（往上飄） */}
      {feedback.score !== 0 && (
        <motion.div
          initial={{ y: 0, scale: 0.5, opacity: 0 }}
          animate={{ y: -30, scale: 1.4, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          className={`
            font-mono font-bold text-4xl drop-shadow-xl
            ${feedback.score > 0 ? 'text-yellow-300' : 'text-yellow-300'}
          `}
        >
          {feedback.score > 0 ? '+' : ''}{feedback.score}
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0 }}
        className="absolute bottom-3 text-white/70 text-[10px]"
      >
        點擊跳過
      </motion.div>
    </motion.div>
  )
}

export default FeedbackOverlay
