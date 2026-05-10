/**
 * SeatCard.tsx — 座位表中的單一學生卡片
 *
 * 顯示：座號、姓名、角色標籤、累計分數
 *
 * 狀態：
 *  - normal:    一般顯示
 *  - highlight: 抽籤輪盤經過中（紅框 + 微震動）
 *  - winner:    最終被抽中（脈動光暈 + 放大）
 *  - dimmed:    當前抽籤模式不符合（變灰，如「組長模式」下其他角色）
 */

import React from 'react'
import { motion } from 'framer-motion'
import type { Student, StudentRole } from '../../db/schema'
import { ROLE_LABELS } from '../../db/schema'

interface SeatCardProps {
  student:     Student
  score:       number
  highlight?:  boolean   // 輪盤經過中
  winner?:     boolean   // 最終抽中
  dimmed?:     boolean   // 不符合篩選條件，變灰
  onClick?:    () => void
}

const ROLE_BADGE: Record<StudentRole, { bg: string, text: string }> = {
  leader:    { bg: 'bg-red-500',     text: 'text-white' },
  assistant: { bg: 'bg-orange-500',  text: 'text-white' },
  memberA:   { bg: 'bg-emerald-500', text: 'text-white' },
  memberB:   { bg: 'bg-cyan-500',    text: 'text-white' },
  memberC:   { bg: 'bg-violet-500',  text: 'text-white' },
  memberD:   { bg: 'bg-pink-500',    text: 'text-white' }
}

const SeatCard: React.FC<SeatCardProps> = ({ student, score, highlight, winner, dimmed, onClick }) => {
  const badge = student.role ? ROLE_BADGE[student.role] : null

  // ── 動畫設定 ──
  const animate = winner
    ? {
        scale:      [1, 1.18, 1.12],
        boxShadow:  [
          '0 0 0 0 rgba(251,191,36,0.7)',
          '0 0 0 14px rgba(251,191,36,0)',
          '0 0 0 0 rgba(251,191,36,0)'
        ]
      }
    : highlight
      ? { scale: [1, 1.08, 1] }
      : { scale: 1 }

  return (
    <motion.button
      onClick={onClick}
      animate={animate}
      transition={
        winner
          ? { duration: 0.8, repeat: Infinity, ease: 'easeOut' }
          : { duration: 0.15 }
      }
      className={`
        relative w-full
        flex items-center gap-1.5 px-1.5 py-1
        rounded-md
        transition-colors duration-150
        ${winner
          ? 'bg-yellow-400 ring-2 ring-yellow-500 z-10 shadow-lg'
          : highlight
            ? 'bg-red-100 ring-2 ring-red-500 z-10'
            : dimmed
              ? 'bg-gray-50 opacity-40'
              : 'bg-white hover:bg-gray-50'}
        text-left
      `}
      style={{ minHeight: 28 }}
    >
      {/* 座號 */}
      <span className={`
        font-mono text-[11px] font-semibold flex-shrink-0 w-5 text-center
        ${winner ? 'text-yellow-900' : 'text-gray-400'}
      `}>
        {student.seatNo}
      </span>

      {/* 姓名 */}
      <span className={`
        text-xs font-medium flex-1 truncate
        ${winner ? 'text-yellow-900 font-bold' : 'text-gray-800'}
      `}>
        {student.name}
      </span>

      {/* 角色徽章（完整名稱：組長 / 助教 / 組員A...） */}
      {badge && (
        <span
          className={`
            flex-shrink-0
            inline-flex items-center justify-center
            px-1.5 py-0 rounded
            text-[10px] font-bold whitespace-nowrap
            ${badge.bg} ${badge.text}
          `}
          title={ROLE_LABELS[student.role!]}
        >
          {ROLE_LABELS[student.role!]}
        </span>
      )}

      {/* 累計分數（只在非 0 顯示） */}
      {score !== 0 && (
        <span className={`
          text-[10px] font-mono font-semibold flex-shrink-0
          ${score > 0 ? 'text-emerald-600' : 'text-red-500'}
        `}>
          {score > 0 ? `+${score}` : score}
        </span>
      )}
    </motion.button>
  )
}

export default SeatCard
