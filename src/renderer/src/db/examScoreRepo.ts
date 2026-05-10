/**
 * examScoreRepo.ts — 學生個別考試成績 + 套用加分到 ScoreEvent
 *
 * 一場考試（Exam）對應多筆 ExamScore（每位學生一筆）。
 * 「套用加分」會把每位學生的 bonusEarned 寫成一筆 ScoreEvent，
 * 並標記 Exam.appliedAt。
 */

import { nanoid } from 'nanoid'
import { db, type ExamScore, type Exam, type Student, type ScoringRules } from './schema'
import { calcQuizBonus, calcExamPeriodBonus } from '../utils/scoring'
import { getOrCreateTodaySession } from './sessionRepo'

// ── 查詢 ─────────────────────────────────────────────────────

/** 取得某場考試所有學生分數（依座號排序，由呼叫端用 students 對照） */
export async function listByExam(examId: string): Promise<ExamScore[]> {
  return db.examScores.where('examId').equals(examId).toArray()
}

/** 取得某學生在某場考試的成績（若無則回傳 null） */
export async function getByExamAndStudent(
  examId:    string,
  studentId: string
): Promise<ExamScore | null> {
  const list = await db.examScores
    .where('[examId+studentId]').equals([examId, studentId])
    .toArray()
  return list[0] ?? null
}

// ── 計算 bonusEarned（不寫 DB） ─────────────────────────────

/**
 * computeBonus
 * 給一位學生 + 分數，回傳該得多少加分。
 * 平常考用角色標準（rules.quizRules[role]），段考用學生個人標準（student.standardScore.exam）。
 */
export function computeBonus(
  exam:    Exam,
  student: Student,
  score:   number,
  rules:   ScoringRules
): number {
  if (exam.type === 'quiz') {
    return calcQuizBonus(score, student.role, rules)
  }
  // 段考：用學生個人標準
  const standard = student.standardScore?.exam ?? rules.examRule.standard ?? 0
  return calcExamPeriodBonus(score, standard, rules)
}

// ── 寫入分數（草稿，不影響加分） ────────────────────────────

export interface UpsertScoreInput {
  examId:      string
  studentId:   string
  score:       number
  bonusEarned: number
}

/**
 * upsertExamScore
 * 寫入或更新一位學生在某場考試的成績。
 * 不影響 ScoreEvent，只是儲存「打算給的分數」。
 */
export async function upsertExamScore(input: UpsertScoreInput): Promise<ExamScore> {
  const existing = await getByExamAndStudent(input.examId, input.studentId)
  if (existing) {
    await db.examScores.update(existing.id, {
      score:       input.score,
      bonusEarned: input.bonusEarned
    })
    return { ...existing, score: input.score, bonusEarned: input.bonusEarned }
  }
  const rec: ExamScore = {
    id:          nanoid(),
    examId:      input.examId,
    studentId:   input.studentId,
    score:       input.score,
    bonusEarned: input.bonusEarned,
    createdAt:   Date.now()
  }
  await db.examScores.add(rec)
  return rec
}

/**
 * bulkUpsertExamScores
 * 批次寫入多位學生的成績（撰寫整張表時用）。
 */
export async function bulkUpsertExamScores(inputs: UpsertScoreInput[]): Promise<void> {
  await db.transaction('rw', db.examScores, async () => {
    for (const i of inputs) {
      await upsertExamScore(i)
    }
  })
}

// ── 套用加分（寫入 ScoreEvent） ─────────────────────────────

/**
 * applyExamBonuses
 * 為一場考試的所有學生產生 ScoreEvent（type='quiz' 或 'exam'），
 * 並把 Exam.appliedAt 設為當下時間戳。
 *
 * 重套：先撤銷該考試的舊 ScoreEvent，再寫入新事件。
 */
export async function applyExamBonuses(exam: Exam, students: Student[]): Promise<{
  applied:    number   // 寫入幾筆事件
  totalBonus: number   // 全班加總（給 toast 顯示）
}> {
  // 取得當天 session
  const session = await getOrCreateTodaySession(exam.classId)

  // 取得所有 ExamScore
  const scores = await listByExam(exam.id)
  if (scores.length === 0) {
    return { applied: 0, totalBonus: 0 }
  }

  let applied = 0
  let totalBonus = 0

  await db.transaction('rw', [db.scoreEvents, db.exams], async () => {
    // 1. 先撤銷該考試之前的 ScoreEvent（若曾套用過）
    await db.scoreEvents.filter(e => e.meta?.examId === exam.id).delete()

    // 2. 為每位學生產生新的 ScoreEvent
    for (const sc of scores) {
      const stu = students.find(s => s.id === sc.studentId)
      if (!stu) continue   // 學生已被刪除，跳過

      await db.scoreEvents.add({
        id:           nanoid(),
        studentId:    sc.studentId,
        classId:      exam.classId,
        sessionId:    session.id,
        examPeriodId: exam.examPeriodId,
        groupId:      stu.groupId,
        timestamp:    Date.now(),
        score:        sc.bonusEarned,
        type:         exam.type === 'quiz' ? 'quiz' : 'exam',
        meta: {
          role:       stu.role ?? undefined,
          examScore:  sc.score,
          examNumber: exam.number,
          examId:     exam.id,
          examName:   exam.name
        }
      })
      applied++
      totalBonus += sc.bonusEarned
    }

    // 3. 標記 Exam 已套用
    await db.exams.update(exam.id, { appliedAt: Date.now() })
  })

  return { applied, totalBonus }
}

/**
 * unapplyExamBonuses
 * 撤銷某場考試的所有 ScoreEvent（不刪除考試與成績本身）。
 * 用於「我想重新編輯分數，先撤回」情境。
 */
export async function unapplyExamBonuses(examId: string): Promise<number> {
  let count = 0
  await db.transaction('rw', [db.scoreEvents, db.exams], async () => {
    const evs = await db.scoreEvents.filter(e => e.meta?.examId === examId).toArray()
    count = evs.length
    await db.scoreEvents.filter(e => e.meta?.examId === examId).delete()
    await db.exams.update(examId, { appliedAt: null })
  })
  return count
}
