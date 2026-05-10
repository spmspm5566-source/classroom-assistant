/**
 * default-rules.ts — 預設加分規則
 *
 * 規則說明（已與老師確認）：
 *  1. 角色基礎分：組長 < 助教 < 組員（鼓勵組員主動發言）
 *  2. 連對加分：每多連對一次 +5
 *  3. 答錯：該節第 1 次免扣，第 2 次 -10、第 3 次 -20…（每多一次再 -10）
 *  4. 抽籤機率：答錯 1 次 ×1.5，答錯 2 次 ×2.0，答錯 ≥3 次 ×2.0（封頂）
 *  5. 快速加分：5/10/15/20/25/30
 *  6. 作業未繳每項 -70
 *  7. 全組完成 +100
 *  8. 平常考、段考依標準分計算（見下方）
 */

import type { ScoringRules, ExamScoringRule } from '../db/schema'

// ── 平常考預設規則（依角色） ──────────────────────────────────
//
// 標準分由低到高為組員→助教→組長（角色任務愈重，標準分愈高）
// 達標準起算，每高/低 1 分加/扣 2 分，到 90/95/100 額外加分

const QUIZ_RULE_LEADER: ExamScoringRule = {
  standard: 70,
  perAbove: 2,
  perBelow: 2,
  bonus90:  30,
  bonus95:  50,
  bonus100: 100
}

const QUIZ_RULE_ASSISTANT: ExamScoringRule = {
  standard: 65,
  perAbove: 2,
  perBelow: 2,
  bonus90:  30,
  bonus95:  50,
  bonus100: 100
}

const QUIZ_RULE_MEMBER: ExamScoringRule = {
  standard: 60,
  perAbove: 2,
  perBelow: 2,
  bonus90:  30,
  bonus95:  50,
  bonus100: 100
}

// ── 段考預設規則（用學生個人標準分，全角色共用） ──────────────

const EXAM_RULE: ExamScoringRule = {
  standard: 0,        // 標準分由學生 standardScore.exam 提供，此處放 0
  perAbove: 2,
  perBelow: 2,
  bonus90:  30,
  bonus95:  50,
  bonus100: 100
}

// ── 完整預設規則 ──────────────────────────────────────────────

export const DEFAULT_RULES: ScoringRules = {
  // 角色基礎分（已確認：組員拿最多以鼓勵發言）
  roleBaseScore: {
    leader:    10,
    assistant: 15,
    memberA:   20,
    memberB:   20,
    memberC:   20,
    memberD:   20
  },

  // 連對獎勵
  correctStreakBonus: 5,

  // 答錯規則
  wrongPenalty: {
    firstFree: true,
    perWrong:  10
  },

  // 抽籤機率調整
  drawWeights: {
    wrong1Multiplier: 1.5,
    wrong2Multiplier: 2.0,
    maxMultiplier:    2.0
  },

  // 快速加分按鈕
  quickScores: [5, 10, 15, 20, 25, 30],

  // 作業未繳每項扣
  homeworkPenalty: -70,

  // 全組完成獎勵
  groupAllDoneBonus: 100,

  // 平常考規則
  quizRules: {
    leader:    QUIZ_RULE_LEADER,
    assistant: QUIZ_RULE_ASSISTANT,
    memberA:   QUIZ_RULE_MEMBER,
    memberB:   QUIZ_RULE_MEMBER,
    memberC:   QUIZ_RULE_MEMBER,
    memberD:   QUIZ_RULE_MEMBER
  },

  // 段考規則
  examRule: EXAM_RULE
}
