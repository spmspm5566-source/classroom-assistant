/**
 * useTimerStore.ts — 計時器全域狀態
 *
 * 設計重點：
 *  - 計時邏輯放在 store 中，獨立於元件生命週期
 *  - 即使老師切到主控台其他頁面，倒數仍會繼續
 *  - 用 endAt（絕對時間戳）計算 remainingMs，避免 setInterval 漂移
 *  - 警告/結束音效在 store 內側觸發，元件不需處理
 *
 * 持久化策略：
 *  - 設定（duration、warningSeconds）→ persist 到 localStorage
 *  - 執行狀態（isRunning、endAt）→ 不持久化（重啟歸零）
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { playTimerWarning, playTimerEnd } from '../utils/audio'

// ── State 介面 ───────────────────────────────────────────────

interface TimerState {
  // ── 設定 ──
  /** 倒數總秒數 */
  duration:        number
  /** 最後 N 秒開始警告 */
  warningSeconds:  number

  // ── 執行狀態 ──
  /** 是否正在跑 */
  isRunning:       boolean
  /** 倒數結束的絕對時間戳；isRunning 為 true 時使用 */
  endAt:           number | null
  /** 剩餘毫秒（暫停或停止後保留） */
  remainingMs:     number
  /** 是否在「警告階段」（最後 N 秒內） */
  isWarning:       boolean
  /** 是否「時間到」（用於觸發終結動畫） */
  isFinished:      boolean

  // ── 內部 ──
  /** 上一次播放警告音效的整秒數（避免一秒內重複播放） */
  _lastWarnSecond: number

  // ── Actions ──
  setDuration:       (sec: number) => void
  setWarningSeconds: (sec: number) => void
  start:             () => void
  pause:             () => void
  reset:             () => void
  /** tick 由全域 interval 呼叫，更新剩餘時間並觸發音效 */
  tick:              () => void
  /** 「時間到」動畫播完後呼叫，清除 isFinished 旗標 */
  acknowledgeFinish: () => void
}

// ── Store ────────────────────────────────────────────────────

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      duration:        60,
      warningSeconds:  10,
      isRunning:       false,
      endAt:           null,
      remainingMs:     60_000,
      isWarning:       false,
      isFinished:      false,
      _lastWarnSecond: -1,

      setDuration: (sec) => {
        const safe = Math.max(1, Math.min(60 * 60, Math.floor(sec)))
        set({
          duration:    safe,
          remainingMs: safe * 1000,
          isRunning:   false,
          endAt:       null,
          isWarning:   false,
          isFinished:  false
        })
      },

      setWarningSeconds: (sec) => {
        set({ warningSeconds: Math.max(0, Math.min(get().duration, Math.floor(sec))) })
      },

      start: () => {
        const { remainingMs, duration, isRunning } = get()
        if (isRunning) return
        // 若已歸零，重新以 duration 起算
        const ms = remainingMs > 0 ? remainingMs : duration * 1000
        set({
          isRunning:       true,
          endAt:           Date.now() + ms,
          remainingMs:     ms,
          isFinished:      false,
          _lastWarnSecond: -1
        })
      },

      pause: () => {
        const { endAt, isRunning } = get()
        if (!isRunning || !endAt) return
        const remaining = Math.max(0, endAt - Date.now())
        set({
          isRunning:   false,
          endAt:       null,
          remainingMs: remaining
        })
      },

      reset: () => {
        const { duration } = get()
        set({
          isRunning:       false,
          endAt:           null,
          remainingMs:     duration * 1000,
          isWarning:       false,
          isFinished:      false,
          _lastWarnSecond: -1
        })
      },

      tick: () => {
        const state = get()
        if (!state.isRunning || !state.endAt) return

        const now       = Date.now()
        const remaining = state.endAt - now

        // ── 時間到 ──
        if (remaining <= 0) {
          set({
            isRunning:   false,
            endAt:       null,
            remainingMs: 0,
            isWarning:   false,
            isFinished:  true
          })
          playTimerEnd()
          return
        }

        // ── 警告階段 ──
        const remainingSec   = Math.ceil(remaining / 1000)
        const inWarningRange = remainingSec <= state.warningSeconds && state.warningSeconds > 0
        const shouldWarn     = inWarningRange && remainingSec !== state._lastWarnSecond

        // 每整秒進入警告區間時嗶一聲
        if (shouldWarn) {
          playTimerWarning()
          set({
            remainingMs:     remaining,
            isWarning:       true,
            _lastWarnSecond: remainingSec
          })
          return
        }

        // 一般更新
        set({
          remainingMs: remaining,
          isWarning:   inWarningRange
        })
      },

      acknowledgeFinish: () => {
        set({ isFinished: false })
      }
    }),
    {
      name: 'classroom-assistant-timer',
      // 只持久化設定，不持久化執行中的狀態
      partialize: (s) => ({
        duration:       s.duration,
        warningSeconds: s.warningSeconds
      })
    }
  )
)

// ── 全域 tick 機制 ────────────────────────────────────────────

/**
 * startTimerTick
 * 在 App 進入時呼叫一次，啟動全域 tick interval。
 * 每 100ms 觸發一次 store.tick()，由 store 自行決定是否更新 / 播音效。
 *
 * 用 setInterval 100ms 而非 1000ms 的原因：
 *  - 倒數顯示更平滑（毫秒級更新）
 *  - 警告音效時機更精準（不會延遲到下一秒）
 */
let _tickHandle: ReturnType<typeof setInterval> | null = null

export function startTimerTick(): void {
  if (_tickHandle) return
  _tickHandle = setInterval(() => {
    useTimerStore.getState().tick()
  }, 100)
}

export function stopTimerTick(): void {
  if (_tickHandle) {
    clearInterval(_tickHandle)
    _tickHandle = null
  }
}

// ── 工具：格式化剩餘時間 ──────────────────────────────────────

/**
 * formatRemaining
 * 將毫秒轉成 "MM:SS" 顯示字串。
 * 計時中至少顯示「真實剩餘秒數」，到 0 也顯示 00:00。
 */
export function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const min      = Math.floor(totalSec / 60)
  const sec      = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
