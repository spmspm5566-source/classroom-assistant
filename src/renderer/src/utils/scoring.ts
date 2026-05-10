/**
 * scoring.ts — 加分計算邏輯
 *
 * 將「規則 → 實際加分」的計算集中在此檔，方便：
 *  - 抽籤器答對/答錯時呼叫
 *  - 全班作答模式批次計算
 *  - 加分總覽頁面預覽
 *  - 規則修改後即時反映
 *
 * 公式（已與老師確認）：
 *  答對得分 = 角色基礎分 + (連對次數 - 1) × 連對加成
 *           例：組員(基礎20) 連對第3次 = 20 + 2×5 = 30
 *
 *  答錯扣分（該節課內遞增）：
 *           第 1 次 = 0（免扣）
 *           第 2 次 = -10
 *           第 3 次 = -20
 *           第 N 次 = -(N-1) × 10
 *
 *  考試（平常考/段考）：
 *           達標準起算
 *           score >= standard：+ (score - standard) × perAbove
 *           score <  standard：- (standard - score) × perBelow
 *           達 90/95/100 額外加 bonus90/95/100
 */

import type { ScoringRules, StudentRole, ExamScoringRule } from '../db/schema'

// ── 答對得分計算 ──────────────────────────────────────────────

/**
 * calcCorrectScore
 * 計算學生答對時應加多少分。
 *
 * @param role     該學生角色（影響基礎分）
 * @param streak   連對次數（含本次。第 1 次答對為 1，第 2 次為 2…）
 * @param rules    當前規則
 * @returns        加分數值（正整數），若角色為 null 用 memberA 規則
 */
export function calcCorrectScore(
  role:   StudentRole | null,
  streak: number,
  rules:  ScoringRules
): number {
  const r        = role ?? 'memberA'
  const baseScore = rules.roleBaseScore[r]
  const bonus     = Math.max(0, streak - 1) * rules.correctStreakBonus
  return baseScore + bonus
}

// ── 答錯扣分計算 ──────────────────────────────────────────────

/**
 * calcWrongPenalty
 * 計算學生答錯時應扣多少分（負數）。
 *
 * @param wrongCount  本節課總共第幾次答錯（含本次）
 * @param rules       當前規則
 * @returns           扣分數值（負數或 0）
 */
export function calcWrongPenalty(wrongCount: number, rules: ScoringRules): number {
  const { firstFree, perWrong } = rules.wrongPenalty
  if (firstFree && wrongCount <= 1) return 0
  // 第 2 次扣 perWrong，第 3 次扣 2×perWrong …
  const factor = firstFree ? wrongCount - 1 : wrongCount
  return -factor * perWrong
}

// ── 考試加分計算 ──────────────────────────────────────────────

/**
 * calcExamBonus
 * 依考試規則計算加分。
 * 適用於平常考（角色標準）與段考（個人標準）。
 *
 * @param score      學生考試分數（0~100）
 * @param standard   標準分（達此起算 + perAbove，未達扣 perBelow）
 * @param rule       考試規則
 * @returns          加分（正負皆可）
 */
export function calcExamBonus(score: number, standard: number, rule: ExamScoringRule): number {
  let bonus = 0

  if (score >= standard) {
    bonus += (score - standard) * rule.perAbove
  } else {
    bonus -= (standard - score) * rule.perBelow
  }

  // 高分階梯獎勵
  if (score >= 100) bonus += rule.bonus100
  else if (score >= 95)  bonus += rule.bonus95
  else if (score >= 90)  bonus += rule.bonus90

  return Math.round(bonus)
}

/**
 * calcQuizBonus — 平常考加分（依角色標準）
 */
export function calcQuizBonus(
  score: number,
  role:  StudentRole | null,
  rules: ScoringRules
): number {
  const r    = role ?? 'memberA'
  const rule = rules.quizRules[r]
  return calcExamBonus(score, rule.standard, rule)
}

/**
 * calcExamPeriodBonus — 段考加分（依學生個人標準）
 */
export function calcExamPeriodBonus(
  score:    number,
  standard: number,
  rules:    ScoringRules
): number {
  return calcExamBonus(score, standard, rules.examRule)
}

// ── 顯示用：預覽分數變化 ──────────────────────────────────────

/**
 * formatScoreChange
 * 將分數變化轉成「+15」或「-10」的字串。
 */
export function formatScoreChange(score: number): string {
  if (score > 0) return `+${score}`
  if (score < 0) return String(score)
  return '±0'
}
