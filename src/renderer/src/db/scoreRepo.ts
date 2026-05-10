/**
 * scoreRepo.ts — 加分扣分事件操作
 *
 * 這是最重要、寫入量最大的資料表。
 * 每次答對/答錯/手動加分都會產生一筆 ScoreEvent，
 * 透過 timestamp + classId + examPeriodId + studentId 索引快速計算累計。
 *
 * v2 之後每筆 ScoreEvent 都有 examPeriodId（段考期），
 * 方便依段考期分別統計分數與排名。
 */

import { nanoid } from 'nanoid'
import { db, type ScoreEvent, type ScoreEventType, type StudentRole } from './schema'

// ── 新增事件 ─────────────────────────────────────────────────

export interface CreateScoreEventInput {
  studentId:    string
  classId:      string
  sessionId:    string
  examPeriodId: string         // v2 必填：哪個段考期
  groupId:      string | null
  score:        number
  type:         ScoreEventType
  meta?: {
    role?:        StudentRole
    streak?:      number
    wrongCount?:  number
    examScore?:   number
    examNumber?:  number
  }
  note?: string
}

export async function addScoreEvent(input: CreateScoreEventInput): Promise<ScoreEvent> {
  const evt: ScoreEvent = {
    id:        nanoid(),
    timestamp: Date.now(),
    ...input
  }
  await db.scoreEvents.add(evt)
  return evt
}

/**
 * bulkAddScoreEvents
 * 用於「全班作答」一次寫入多筆。
 */
export async function bulkAddScoreEvents(inputs: CreateScoreEventInput[]): Promise<void> {
  const events: ScoreEvent[] = inputs.map(i => ({
    id:        nanoid(),
    timestamp: Date.now(),
    ...i
  }))
  await db.scoreEvents.bulkAdd(events)
}

// ── 查詢：學生累計 ──────────────────────────────────────────

/** 取得學生的累計總分（全期間） */
export async function getStudentTotalScore(studentId: string): Promise<number> {
  const events = await db.scoreEvents.where('studentId').equals(studentId).toArray()
  return events.reduce((sum, e) => sum + e.score, 0)
}

/** 取得學生在某段考期的累計分數 */
export async function getStudentPeriodScore(
  studentId:    string,
  examPeriodId: string
): Promise<number> {
  const events = await db.scoreEvents
    .where('studentId').equals(studentId)
    .and(e => e.examPeriodId === examPeriodId)
    .toArray()
  return events.reduce((sum, e) => sum + e.score, 0)
}

/** 取得學生在某節課的累計分數 */
export async function getStudentSessionScore(studentId: string, sessionId: string): Promise<number> {
  const events = await db.scoreEvents
    .where('studentId').equals(studentId)
    .and(e => e.sessionId === sessionId)
    .toArray()
  return events.reduce((sum, e) => sum + e.score, 0)
}

/** 取得學生在某節課的答錯次數（用於計算下次扣分） */
export async function getStudentSessionWrongCount(studentId: string, sessionId: string): Promise<number> {
  return db.scoreEvents
    .where('studentId').equals(studentId)
    .and(e => e.sessionId === sessionId && (e.type === 'wrong' || e.type === 'group_wrong'))
    .count()
}

/** 取得學生連對次數（往前找連續 'correct' 事件） */
export async function getStudentCorrectStreak(studentId: string, sessionId: string): Promise<number> {
  const events = await db.scoreEvents
    .where('studentId').equals(studentId)
    .and(e => e.sessionId === sessionId)
    .reverse()
    .sortBy('timestamp')

  let streak = 0
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'correct') streak++
    else break
  }
  return streak
}

// ── 查詢：班級期間累計 ──────────────────────────────────────

/** 取得班級在指定日期範圍內所有事件（依時間排序） */
export async function listClassEventsInRange(
  classId:   string,
  startDate: string,    // YYYY-MM-DD
  endDate:   string
): Promise<ScoreEvent[]> {
  const startTs = new Date(`${startDate}T00:00:00`).getTime()
  const endTs   = new Date(`${endDate}T23:59:59`).getTime()

  return db.scoreEvents
    .where('[classId+timestamp]')
    .between([classId, startTs], [classId, endTs])
    .toArray()
}

/** 取得班級在某段考期的所有事件 */
export async function listPeriodEvents(
  classId:      string,
  examPeriodId: string
): Promise<ScoreEvent[]> {
  return db.scoreEvents
    .where('[classId+examPeriodId]').equals([classId, examPeriodId])
    .toArray()
}

/** 取得班級在某節課的所有事件 */
export async function listSessionEvents(sessionId: string): Promise<ScoreEvent[]> {
  return db.scoreEvents.where('sessionId').equals(sessionId).toArray()
}

// ── 刪除（救援用） ────────────────────────────────────────────

export async function deleteScoreEvent(id: string): Promise<void> {
  await db.scoreEvents.delete(id)
}

/** 撤銷某節課最後一筆事件（可重複呼叫做多重 undo） */
export async function undoLastSessionEvent(sessionId: string): Promise<ScoreEvent | null> {
  const events = await db.scoreEvents.where('sessionId').equals(sessionId).toArray()
  if (events.length === 0) return null
  events.sort((a, b) => b.timestamp - a.timestamp)
  const last = events[0]
  await db.scoreEvents.delete(last.id)
  return last
}
