/**
 * draw.ts — 加權抽籤演算法
 *
 * 抽籤規則（已與老師確認）：
 *  1. 學生答錯後下次抽籤機率提升
 *     - 答錯 1 次 → 權重 ×1.5
 *     - 答錯 2 次 → 權重 ×2.0
 *     - 答錯 ≥3 次 → 權重 ×2.0（封頂）
 *  2. 程式重啟後權重歸零
 *  3. 不立即連抽兩次同一人（lastDrawnId 排除）
 *  4. 可依「全班 / 角色」過濾候選名單
 *
 * 機率計算：每位候選人權重總和 → 在 [0, total) 隨機 → 累計找出落點
 */

import type { Student, StudentRole, ScoringRules } from '../db/schema'

// ── 抽籤模式 ─────────────────────────────────────────────────

export type DrawMode =
  | 'all'         // 全班
  | StudentRole   // 依角色：leader / assistant / memberA-D

/** 模式對應的中文標籤（顯示用） */
export const DRAW_MODE_LABELS: Record<DrawMode, string> = {
  all:       '全班任意',
  leader:    '教練',
  assistant: '助教',
  memberA:   '組員 A',
  memberB:   '組員 B',
  memberC:   '組員 C',
  memberD:   '組員 D'
}

// ── 篩選候選名單 ─────────────────────────────────────────────

/**
 * filterCandidates
 * 依抽籤模式過濾學生清單。
 * 全班模式：所有學生都是候選；角色模式：只有該角色的學生。
 */
export function filterCandidates(students: Student[], mode: DrawMode): Student[] {
  if (mode === 'all') return students.filter(s => true)
  return students.filter(s => s.role === mode)
}

// ── 加權抽籤 ─────────────────────────────────────────────────

export interface DrawOptions {
  /** 候選學生清單（已篩選） */
  candidates:  Student[]
  /** 取得指定學生的權重倍率 */
  getWeight:   (studentId: string) => number
  /** 排除最近被抽到的人（避免立即重抽） */
  excludeId?:  string | null
}

/**
 * weightedDraw
 * 加權隨機抽籤。
 *
 * 演算法：
 *  1. 排除 excludeId（若候選≥2人，否則保留以避免無人可抽）
 *  2. 計算每人權重（基礎 1.0 × 倍率）
 *  3. 隨機落點 ∈ [0, totalWeight)
 *  4. 累計找出落點對應的學生
 *
 * @returns 被抽中的學生，若候選為空則回傳 null
 */
export function weightedDraw(opts: DrawOptions): Student | null {
  let pool = opts.candidates

  // 候選為空
  if (pool.length === 0) return null

  // 候選只有 1 人，直接回傳
  if (pool.length === 1) return pool[0]

  // 排除上次抽中（候選 ≥ 2 才排除）
  if (opts.excludeId) {
    const filtered = pool.filter(s => s.id !== opts.excludeId)
    if (filtered.length > 0) pool = filtered
  }

  // 計算總權重
  const weights = pool.map(s => Math.max(0.1, opts.getWeight(s.id)))
  const total   = weights.reduce((a, b) => a + b, 0)

  // 隨機落點
  let r = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }

  // 浮點誤差保險
  return pool[pool.length - 1]
}

// ── 取得權重輔助 ──────────────────────────────────────────────

/**
 * computeDrawWeight
 * 由「本次程式啟動以來答錯次數」計算抽籤權重倍率。
 *
 * @param wrongCountThisRun  本次啟動以來該學生答錯次數（已封頂 3）
 * @param rules              當前規則中的 drawWeights
 */
export function computeDrawWeight(
  wrongCountThisRun: number,
  rules: ScoringRules
): number {
  const w = rules.drawWeights
  if (wrongCountThisRun <= 0) return 1.0
  if (wrongCountThisRun === 1) return w.wrong1Multiplier
  // 2 次以上一律用 wrong2 倍率（封頂在 maxMultiplier）
  return Math.min(w.wrong2Multiplier, w.maxMultiplier)
}

// ── 視覺用：產生「輪盤經過順序」陣列 ──────────────────────────

/**
 * generateRouletteSequence
 * 為輪盤動畫產生一連串「候選學生 ID 序列」，最後一個是真正被抽中的人。
 * 用法：UI 元件依序高亮這些 ID，並讓間隔時間漸長以模擬減速。
 *
 * @param candidates  候選學生清單
 * @param winner      最終抽中者
 * @param totalSteps  動畫總步數（預設 28）
 */
export function generateRouletteSequence(
  candidates: Student[],
  winner:     Student,
  totalSteps: number = 28
): string[] {
  if (candidates.length === 0) return []

  const sequence: string[] = []

  // 前段：在候選人之間隨機跳動
  for (let i = 0; i < totalSteps - 1; i++) {
    const random = candidates[Math.floor(Math.random() * candidates.length)]
    sequence.push(random.id)
  }

  // 最後一步：固定為 winner
  sequence.push(winner.id)
  return sequence
}

/**
 * generateRouletteIntervals
 * 與 generateRouletteSequence 配對使用，產生對應的「每步間隔毫秒」。
 * 採用指數曲線：前段快、後段慢，營造減速感。
 *
 * @param totalSteps  總步數
 * @param fastest     起始最快間隔（ms）
 * @param slowest     最末最慢間隔（ms）
 */
export function generateRouletteIntervals(
  totalSteps: number,
  fastest:    number = 50,
  slowest:    number = 280
): number[] {
  const intervals: number[] = []
  for (let i = 0; i < totalSteps; i++) {
    const t = i / Math.max(1, totalSteps - 1)
    // ease-out cubic：t^3 讓減速感更明顯
    const easeT = 1 - Math.pow(1 - t, 3)
    intervals.push(fastest + (slowest - fastest) * easeT)
  }
  return intervals
}
