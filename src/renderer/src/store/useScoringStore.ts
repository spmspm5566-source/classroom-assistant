/**
 * useScoringStore.ts — 抽籤/答題即時狀態
 *
 * 這些狀態只在「本次程式執行期間」有效，重啟後歸零，不寫入資料庫：
 *  - studentWrongCounts    每位學生本節答錯次數（用於計算下次扣分 & 抽籤權重）
 *  - studentDrawCounts     每位學生本次程式啟動以來被抽中次數（封頂 3 次後不再上權重）
 *  - lastDrawnStudentId    上次抽中的學生（避免連抽兩次同一人）
 *  - currentStreaks        每位學生連對次數
 *
 * 重啟後計算重來，這是已確認的設計（Q2）。
 */

import { create } from 'zustand'

// ── State 介面 ───────────────────────────────────────────────

interface ScoringState {
  /** 該節課每位學生答錯次數 */
  wrongCounts: Record<string, number>

  /** 該節課每位學生連對次數 */
  streaks: Record<string, number>

  /** 本次程式啟動以來，每位學生被「答錯加權」次數（最多 3 次封頂） */
  drawWeightCounts: Record<string, number>

  /** 上次抽中的學生（避免立刻又抽到） */
  lastDrawnId: string | null

  // ── Actions ──

  /** 答對：清除答錯計數、累加連對 */
  recordCorrect: (studentId: string) => void

  /** 答錯：累加錯誤、清除連對 */
  recordWrong: (studentId: string) => void

  /** 抽中時呼叫，紀錄為 lastDrawnId */
  recordDraw: (studentId: string) => void

  /** 取得學生目前該節答錯次數 */
  getWrongCount: (studentId: string) => number

  /** 取得學生目前該節連對次數 */
  getStreak: (studentId: string) => number

  /** 取得學生抽籤權重倍率（依答錯次數 + 封頂規則） */
  getDrawWeight: (
    studentId: string,
    rules: { wrong1Multiplier: number, wrong2Multiplier: number, maxMultiplier: number }
  ) => number

  /** 切換 session（換節課）— 重置答錯與連對計數 */
  resetForNewSession: () => void

  /** 完全重置（換班級時） */
  resetAll: () => void
}

// ── Store 實作 ───────────────────────────────────────────────

const MAX_DRAW_WEIGHT_COUNT = 3   // 程式啟動以來最多 3 次（Q2）

export const useScoringStore = create<ScoringState>((set, get) => ({
  wrongCounts:      {},
  streaks:          {},
  drawWeightCounts: {},
  lastDrawnId:      null,

  recordCorrect: (studentId) => set(state => ({
    wrongCounts: { ...state.wrongCounts, [studentId]: 0 },
    streaks:     { ...state.streaks, [studentId]: (state.streaks[studentId] ?? 0) + 1 }
  })),

  recordWrong: (studentId) => set(state => {
    const newWrongCount = (state.wrongCounts[studentId] ?? 0) + 1
    const oldDrawCount  = state.drawWeightCounts[studentId] ?? 0
    return {
      wrongCounts:      { ...state.wrongCounts, [studentId]: newWrongCount },
      streaks:          { ...state.streaks, [studentId]: 0 },
      drawWeightCounts: {
        ...state.drawWeightCounts,
        [studentId]: Math.min(oldDrawCount + 1, MAX_DRAW_WEIGHT_COUNT)
      }
    }
  }),

  recordDraw: (studentId) => set({ lastDrawnId: studentId }),

  getWrongCount: (studentId) => get().wrongCounts[studentId] ?? 0,
  getStreak:     (studentId) => get().streaks[studentId] ?? 0,

  getDrawWeight: (studentId, rules) => {
    const count = get().drawWeightCounts[studentId] ?? 0
    if (count <= 0) return 1.0
    if (count === 1) return rules.wrong1Multiplier
    // 2 次以上都套 wrong2 倍率（已封頂在 wrong2Multiplier）
    return Math.min(rules.wrong2Multiplier, rules.maxMultiplier)
  },

  resetForNewSession: () => set({
    wrongCounts: {},
    streaks:     {},
    lastDrawnId: null
    // drawWeightCounts 不重置（這是「本次程式執行期間」累計）
  }),

  resetAll: () => set({
    wrongCounts:      {},
    streaks:          {},
    drawWeightCounts: {},
    lastDrawnId:      null
  })
}))
