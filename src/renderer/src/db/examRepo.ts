/**
 * examRepo.ts — 考試元資料操作（一筆 = 一場考試）
 *
 * 一場考試（Exam）擁有多筆 ExamScore（每位學生一筆）。
 * 元資料（名稱、日期、是否已套用加分）放這張表，
 * 個別分數放 examScores 表（透過 examId 關聯）。
 *
 * 套用加分流程：
 *  1. 老師輸入每位學生的分數 → 寫入 ExamScore（含 bonusEarned 計算結果）
 *  2. 點「套用加分」 → 為每位學生產生一筆 ScoreEvent（type='quiz' or 'exam'），
 *     並把 Exam.appliedAt 設為當下時間戳。
 *  3. 之後若想「重新套用」（例如修改分數），需先撤銷舊 ScoreEvent 再重套。
 */

import Dexie from 'dexie'
import { nanoid } from 'nanoid'
import { db, type Exam } from './schema'

// ── 查詢 ─────────────────────────────────────────────────────

/** 列出某班某段考期下、特定類型的所有考試（依日期遞減） */
export async function listByPeriod(
  classId:      string,
  examPeriodId: string,
  type?:        'quiz' | 'exam'
): Promise<Exam[]> {
  let list: Exam[]
  if (type) {
    list = await db.exams
      .where('[classId+examPeriodId+type]')
      .equals([classId, examPeriodId, type])
      .toArray()
  } else {
    list = await db.exams
      .where('classId').equals(classId)
      .and(e => e.examPeriodId === examPeriodId)
      .toArray()
  }
  return list.sort((a, b) => b.date.localeCompare(a.date))
}

/** 取得下一個考試編號（同段考期、同類型） */
export async function getNextNumber(
  classId:      string,
  examPeriodId: string,
  type:         'quiz' | 'exam'
): Promise<number> {
  const list = await listByPeriod(classId, examPeriodId, type)
  if (list.length === 0) return 1
  return Math.max(...list.map(e => e.number)) + 1
}

export async function getById(id: string): Promise<Exam | undefined> {
  return db.exams.get(id)
}

// ── 新增 ─────────────────────────────────────────────────────

export interface CreateExamInput {
  classId:      string
  examPeriodId: string
  type:         'quiz' | 'exam'
  number?:      number
  name?:        string
  date?:        string   // YYYY-MM-DD，省略則用今日
}

export async function createExam(input: CreateExamInput): Promise<Exam> {
  const number = input.number ?? await getNextNumber(input.classId, input.examPeriodId, input.type)
  const today  = new Date().toISOString().slice(0, 10)
  const typeLabel = input.type === 'quiz' ? '平常考' : '段考'

  const exam: Exam = {
    id:           nanoid(),
    classId:      input.classId,
    examPeriodId: input.examPeriodId,
    type:         input.type,
    number,
    name:         input.name ?? `第${number}次${typeLabel}`,
    date:         input.date ?? today,
    appliedAt:    null,
    createdAt:    Date.now()
  }
  await db.exams.add(exam)
  return exam
}

// ── 更新 ─────────────────────────────────────────────────────

export async function updateExam(id: string, patch: Partial<Exam>): Promise<void> {
  await db.exams.update(id, patch)
}

// ── 刪除（連同分數與該考試已套用的 ScoreEvent）──────────────

export async function deleteExam(id: string): Promise<void> {
  await db.transaction('rw', [db.exams, db.examScores, db.scoreEvents], async () => {
    // 移除該考試所有學生分數
    await db.examScores.where('examId').equals(id).delete()
    // 移除已套用的 ScoreEvent（透過 meta 中的 examId 標記）
    await db.scoreEvents
      .filter(e => e.meta?.examId === id)
      .delete()
    // 刪除考試本身
    await db.exams.delete(id)
  })
}

// 為避免 TypeScript 移除未使用的 import 警告（Dexie 型別有時會需要）
void Dexie
