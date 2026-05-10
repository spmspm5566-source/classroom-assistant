/**
 * TimerPage.tsx — 計時器浮動視窗
 *
 * 視窗大小由 main process 設為 360×220 (timer mode)，
 * 整個元件以 100% width/height 撐滿，整體可拖曳。
 *
 * 兩種顯示狀態：
 *  1. 待機（isRunning=false 且 isFinished=false）
 *     → 顯示倒數時間 + 設定區（快速預設、自訂秒數、警告秒數）
 *  2. 計時中（isRunning=true）
 *     → 大型倒數數字 + 暫停 / 重置
 *  3. 時間到（isFinished=true）
 *     → 全視窗閃爍紅 + 「時間到！」+ 收回按鈕
 */

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTimerStore, formatRemaining } from '../store/useTimerStore'
import { primeAudio } from '../utils/audio'

interface TimerPageProps {
  onClose: () => void   // 關閉計時器（回主控台）
}

const TimerPage: React.FC<TimerPageProps> = ({ onClose }) => {
  const {
    duration, warningSeconds,
    isRunning, isFinished, isWarning,
    remainingMs,
    setDuration, setWarningSeconds,
    start, pause, reset, acknowledgeFinish
  } = useTimerStore()

  // 暫存設定區的自訂秒數輸入
  const [customSec, setCustomSec] = React.useState<string>(String(duration))

  // duration 同步到輸入框（按快速預設時刷新）
  React.useEffect(() => {
    setCustomSec(String(duration))
  }, [duration])

  // ── 渲染：時間到動畫 ──────────────────────────────────────
  if (isFinished) {
    return <FinishedView onAck={() => { acknowledgeFinish(); reset() }} onClose={onClose} />
  }

  // ── 渲染：計時中 ──────────────────────────────────────────
  if (isRunning) {
    return (
      <RunningView
        remainingMs={remainingMs}
        isWarning={isWarning}
        onPause={pause}
        onReset={reset}
        onClose={onClose}
      />
    )
  }

  // ── 渲染：待機（設定模式）─────────────────────────────────
  return (
    <IdleView
      duration={duration}
      remainingMs={remainingMs}
      warningSeconds={warningSeconds}
      customSec={customSec}
      setCustomSec={setCustomSec}
      onSetDuration={(s) => { primeAudio(); setDuration(s) }}
      onSetWarning={setWarningSeconds}
      onStart={() => { primeAudio(); start() }}
      onClose={onClose}
    />
  )
}

// ═══════════════════════════════════════════════════════════════
// 子畫面：待機（設定）
// ═══════════════════════════════════════════════════════════════

interface IdleViewProps {
  duration:       number
  remainingMs:    number
  warningSeconds: number
  customSec:      string
  setCustomSec:   (s: string) => void
  onSetDuration:  (sec: number) => void
  onSetWarning:   (sec: number) => void
  onStart:        () => void
  onClose:        () => void
}

const QUICK_PRESETS = [
  { label: '30 秒', sec: 30  },
  { label: '1 分',  sec: 60  },
  { label: '2 分',  sec: 120 },
  { label: '3 分',  sec: 180 },
  { label: '5 分',  sec: 300 },
  { label: '10 分', sec: 600 }
]

const IdleView: React.FC<IdleViewProps> = ({
  duration, remainingMs, warningSeconds,
  customSec, setCustomSec,
  onSetDuration, onSetWarning, onStart, onClose
}) => (
  <div className="drag-region w-full h-full bg-gradient-to-br from-amber-50 via-white to-orange-50 flex flex-col">

    {/* ── 頂部標題列 ── */}
    <div className="flex items-center justify-between px-3 h-7 flex-shrink-0">
      <span className="text-[11px] font-semibold text-amber-700">⏱ 計時器</span>
      <button
        onClick={onClose}
        title="關閉，回主控台"
        className="no-drag w-5 h-5 rounded hover:bg-amber-100 flex items-center justify-center text-gray-400 hover:text-gray-700"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    {/* ── 倒數時間（中型）+ 開始按鈕 ── */}
    <div className="px-4 pt-1 pb-2 flex items-center gap-3">
      <div className="font-mono text-3xl font-bold text-gray-800 tabular-nums tracking-tight flex-1">
        {formatRemaining(remainingMs)}
      </div>
      <button
        onClick={onStart}
        className="
          no-drag flex-shrink-0
          h-11 px-5 rounded-xl
          bg-gradient-to-br from-emerald-500 to-emerald-600
          hover:from-emerald-600 hover:to-emerald-700
          text-white font-semibold text-sm
          shadow-md
          flex items-center gap-1.5
        "
      >
        ▶ 開始
      </button>
    </div>

    {/* ── 快速預設 ── */}
    <div className="px-4 mt-1">
      <div className="flex gap-1 flex-wrap no-drag">
        {QUICK_PRESETS.map(p => (
          <button
            key={p.sec}
            onClick={() => onSetDuration(p.sec)}
            className={`
              h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors
              ${duration === p.sec
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-white border border-amber-200 text-amber-700 hover:bg-amber-100'}
            `}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>

    {/* ── 自訂秒數 + 警告秒數 ── */}
    <div className="px-4 mt-2 flex items-center gap-2 no-drag">
      <label className="text-[11px] text-gray-500 flex-shrink-0">自訂</label>
      <input
        type="number"
        min={1} max={3600}
        value={customSec}
        onChange={(e) => setCustomSec(e.target.value)}
        onBlur={() => {
          const n = Number(customSec)
          if (n >= 1) onSetDuration(n)
          else setCustomSec(String(duration))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="
          flex-1 h-7 px-2 text-xs rounded-md
          bg-white border border-amber-200
          focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300
        "
      />
      <span className="text-[11px] text-gray-500">秒</span>

      <span className="w-px h-4 bg-amber-200 mx-1" />

      <label className="text-[11px] text-gray-500 flex-shrink-0">最後</label>
      <input
        type="number"
        min={0} max={duration}
        value={warningSeconds}
        onChange={(e) => onSetWarning(Number(e.target.value) || 0)}
        className="
          w-12 h-7 px-2 text-xs rounded-md
          bg-white border border-amber-200
          focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300
        "
      />
      <span className="text-[11px] text-gray-500">秒提示</span>
    </div>

    {/* ── 拖曳提示 ── */}
    <div className="flex-1" />
    <div className="px-4 pb-2 text-[10px] text-amber-700/60 text-center">
      💡 可拖曳此視窗到任意角落
    </div>
  </div>
)

// ═══════════════════════════════════════════════════════════════
// 子畫面：計時中
// ═══════════════════════════════════════════════════════════════

interface RunningViewProps {
  remainingMs: number
  isWarning:   boolean
  onPause:     () => void
  onReset:     () => void
  onClose:     () => void
}

const RunningView: React.FC<RunningViewProps> = ({ remainingMs, isWarning, onPause, onReset, onClose }) => (
  <div className={`
    drag-region w-full h-full flex flex-col
    transition-colors duration-200
    ${isWarning
      ? 'bg-gradient-to-br from-red-50 via-rose-50 to-red-100'
      : 'bg-gradient-to-br from-amber-50 via-white to-orange-50'}
  `}>

    {/* 頂部 */}
    <div className="flex items-center justify-between px-3 h-7 flex-shrink-0">
      <span className={`text-[11px] font-semibold ${isWarning ? 'text-red-700 animate-pulse' : 'text-amber-700'}`}>
        {isWarning ? '⚠ 倒數中' : '⏱ 計時中'}
      </span>
      <button
        onClick={onClose}
        title="關閉計時器"
        className="no-drag w-5 h-5 rounded hover:bg-black/10 flex items-center justify-center text-gray-400 hover:text-gray-700"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    {/* 大型倒數 */}
    <div className="flex-1 flex items-center justify-center">
      <motion.div
        key={isWarning ? 'warn' : 'normal'}
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className={`
          font-mono font-bold tabular-nums tracking-tight
          ${isWarning ? 'text-red-600 text-7xl' : 'text-gray-800 text-7xl'}
        `}
        style={{
          // 警告階段每秒呼吸效果
          animation: isWarning ? 'pulse 1s ease-in-out infinite' : undefined
        }}
      >
        {formatRemaining(remainingMs)}
      </motion.div>
    </div>

    {/* 控制鈕 */}
    <div className="no-drag px-4 pb-3 flex gap-2">
      <button
        onClick={onPause}
        className="
          flex-1 h-10 rounded-xl
          bg-white hover:bg-gray-50 active:bg-gray-100
          border border-gray-200
          text-gray-700 font-semibold text-sm
          shadow-sm
        "
      >
        ⏸ 暫停
      </button>
      <button
        onClick={onReset}
        className="
          h-10 px-4 rounded-xl
          bg-white hover:bg-gray-50 active:bg-gray-100
          border border-gray-200
          text-gray-500 text-sm
        "
        title="重置"
      >
        ⟲
      </button>
    </div>
  </div>
)

// ═══════════════════════════════════════════════════════════════
// 子畫面：時間到
// ═══════════════════════════════════════════════════════════════

interface FinishedViewProps {
  onAck:   () => void
  onClose: () => void
}

const FinishedView: React.FC<FinishedViewProps> = ({ onAck, onClose }) => (
  <motion.div
    className="drag-region w-full h-full flex flex-col bg-red-600 text-white"
    animate={{ backgroundColor: ['#dc2626', '#fca5a5', '#dc2626'] }}
    transition={{ duration: 0.6, repeat: 3, ease: 'easeInOut' }}
  >
    <div className="flex items-center justify-between px-3 h-7 flex-shrink-0">
      <span className="text-[11px] font-semibold">⏰ 時間到</span>
      <button
        onClick={onClose}
        className="no-drag w-5 h-5 rounded hover:bg-white/20 flex items-center justify-center"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div className="flex-1 flex flex-col items-center justify-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 12 }}
        className="text-5xl font-bold mb-2"
      >
        ⏰
      </motion.div>
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="text-2xl font-bold tracking-wider"
      >
        時間到！
      </motion.div>
    </div>

    <div className="no-drag px-4 pb-3 flex gap-2">
      <button
        onClick={onAck}
        className="
          flex-1 h-10 rounded-xl
          bg-white text-red-600 font-bold text-sm
          shadow-md hover:shadow-lg
        "
      >
        知道了
      </button>
    </div>
  </motion.div>
)

export default TimerPage
