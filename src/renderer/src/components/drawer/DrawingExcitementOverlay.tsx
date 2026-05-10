/**
 * DrawingExcitementOverlay.tsx — 抽籤動畫期間的「浮字」效果
 *
 * 抽籤輪盤跑的同時，畫面上會隨機冒出候選學生的名字泡泡，
 * 漸顯飄上、淡出消失，營造抽獎台緊張感。
 *
 * 設計：
 *  - 每 ~80ms 噴出一顆泡泡，最多保留 15 顆避免擁擠
 *  - 泡泡內容：座號 + 姓名（從候選名單隨機抽）
 *  - 動畫：縮放彈出 → 飄上 50px → 淡出，1.2 秒週期
 *  - 顏色：橘黃漸層（與抽籤主題色一致）
 *  - pointer-events-none：不擋滑鼠（雖然抽籤中也不該按）
 *  - z-index 介於 SeatGrid 與 DrawResultModal 之間
 */

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Student } from '../../db/schema'

interface Props {
  /** 是否啟用（傳入 phase === 'spinning'） */
  active:     boolean
  /** 候選學生（從中隨機挑一個顯示名字） */
  candidates: Student[]
}

interface Bubble {
  id:        string
  name:      string
  seatNo:    number
  /** 0~100，畫面寬度百分比 */
  x:         number
  /** 0~100，畫面高度百分比 */
  y:         number
  /** 顏色變體（讓泡泡顏色多樣化） */
  variant:   number
  createdAt: number
}

const BUBBLE_INTERVAL_MS = 80
const BUBBLE_LIFETIME_MS = 1200
const MAX_BUBBLES        = 15

const VARIANTS = [
  'from-amber-400 to-orange-500',
  'from-rose-400 to-pink-500',
  'from-yellow-400 to-amber-500',
  'from-orange-400 to-red-500',
  'from-pink-400 to-rose-500'
]

const DrawingExcitementOverlay: React.FC<Props> = ({ active, candidates }) => {
  const [bubbles, setBubbles] = React.useState<Bubble[]>([])

  // ── 噴出新泡泡 ──
  React.useEffect(() => {
    if (!active || candidates.length === 0) return

    const id = setInterval(() => {
      const stu  = candidates[Math.floor(Math.random() * candidates.length)]
      const bub: Bubble = {
        id:        `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name:      stu.name,
        seatNo:    stu.seatNo,
        x:         Math.random() * 88 + 6,    // 6~94%
        y:         Math.random() * 65 + 18,   // 18~83%
        variant:   Math.floor(Math.random() * VARIANTS.length),
        createdAt: Date.now()
      }
      setBubbles(prev => {
        // 上限避免擁擠
        const next = prev.length >= MAX_BUBBLES ? prev.slice(1) : prev
        return [...next, bub]
      })
    }, BUBBLE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [active, candidates])

  // ── 定期清理過期泡泡 ──
  React.useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      setBubbles(prev => prev.filter(b => now - b.createdAt < BUBBLE_LIFETIME_MS))
    }, 250)
    return () => clearInterval(id)
  }, [])

  // ── 結束時清空 ──
  React.useEffect(() => {
    if (!active) setBubbles([])
  }, [active])

  if (!active) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <AnimatePresence>
        {bubbles.map(b => (
          <motion.div
            key={b.id}
            className="absolute"
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
            initial={{ scale: 0.3, opacity: 0, y: 20 }}
            animate={{
              scale:   [0.3, 1.15, 1.0],
              opacity: [0, 1, 1, 0],
              y:       [20, -10, -50]
            }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{
              duration: BUBBLE_LIFETIME_MS / 1000,
              ease:     'easeOut',
              times:    [0, 0.15, 1]
            }}
          >
            <span className={`
              inline-flex items-center gap-1
              px-2.5 py-1 rounded-full
              text-xs font-bold whitespace-nowrap
              text-white shadow-lg
              bg-gradient-to-br ${VARIANTS[b.variant]}
            `}>
              <span className="font-mono text-[10px] opacity-80">{b.seatNo}</span>
              <span>{b.name}</span>
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default DrawingExcitementOverlay
