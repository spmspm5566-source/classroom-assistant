/**
 * useDrawerStore.ts — 抽籤器頁面狀態
 *
 * 抽籤器的「畫面狀態機」：
 *
 *  idle          → 顯示分組座位表 + 抽籤模式選擇 + 隨機抽籤大按鈕
 *   ↓ 點擊「隨機抽籤」
 *  spinning      → 紅框繞著座位輪盤式跑動
 *   ↓ 動畫結束
 *  result        → 跳出大型結果（座號姓名）+ 答對/答錯/全班作答
 *   ↓ 答對
 *  feedback      → 跳讚美 + 加分動畫
 *   ↓ 動畫結束
 *  idle
 *   ↓ 答錯
 *  feedback      → 跳鼓勵 + 扣分動畫
 *   ↓ 動畫結束
 *  idle
 *   ↓ 點「全班作答」
 *  classMode     → 全班勾選清單 + 全對/全錯按鈕
 *   ↓ 確認送出
 *  feedback (groupBatch)
 *   ↓
 *  idle
 *
 * 此 store 不持久化（每次重啟都從 idle 開始，先選班級再用）。
 */

import { create } from 'zustand'
import type { DrawMode } from '../utils/draw'

// ── 畫面狀態 ─────────────────────────────────────────────────

export type DrawerPhase = 'idle' | 'spinning' | 'result' | 'feedback' | 'classMode' | 'manualPick'

// ── Feedback 內容 ────────────────────────────────────────────

export interface FeedbackContent {
  /** 答對 / 答錯 / 批次（全班作答結算） */
  type:    'correct' | 'wrong' | 'batch'
  /** 主要顯示句子（讚美或鼓勵） */
  phrase:  string
  /** 加分變化（已含正負，例如 +25 或 -10） */
  score:   number
  /** 學生姓名（單人時用） */
  studentName?: string
  /** 學生角色標籤（單人時用） */
  roleLabel?:   string
  /** 批次模式：對 N 人 / 錯 M 人 */
  batchInfo?: { correct: number, wrong: number }
}

// ── State 介面 ───────────────────────────────────────────────

interface DrawerState {
  phase:        DrawerPhase
  drawMode:     DrawMode
  drawnId:      string | null         // 當前被抽中的學生 id
  highlightId:  string | null         // 輪盤動畫當前高亮的 id
  feedback:     FeedbackContent | null

  // ── Actions ──
  setDrawMode:    (mode: DrawMode) => void
  startSpin:      (drawnId: string) => void
  setHighlight:   (id: string | null) => void
  showResult:     () => void
  showFeedback:   (fb: FeedbackContent) => void
  enterClassMode: () => void
  enterManualPick: () => void
  pickManually:   (studentId: string) => void
  goIdle:         () => void
}

// ── Store ────────────────────────────────────────────────────

export const useDrawerStore = create<DrawerState>((set) => ({
  phase:       'idle',
  drawMode:    'all',
  drawnId:     null,
  highlightId: null,
  feedback:    null,

  setDrawMode:  (mode) => set({ drawMode: mode }),

  startSpin:    (drawnId) => set({
    phase:       'spinning',
    drawnId,
    highlightId: null,
    feedback:    null
  }),

  setHighlight: (id) => set({ highlightId: id }),

  showResult:   () => set({ phase: 'result' }),

  showFeedback: (fb) => set({ phase: 'feedback', feedback: fb }),

  enterClassMode: () => set({
    phase:       'classMode',
    drawnId:     null,
    highlightId: null,
    feedback:    null
  }),

  enterManualPick: () => set({
    phase:       'manualPick',
    drawnId:     null,
    highlightId: null,
    feedback:    null
  }),

  // 老師指定學生：直接跳到「result」階段（不跑輪盤動畫）
  pickManually: (studentId) => set({
    phase:       'result',
    drawnId:     studentId,
    highlightId: studentId,
    feedback:    null
  }),

  goIdle: () => set({
    phase:       'idle',
    drawnId:     null,
    highlightId: null,
    feedback:    null
  })
}))
