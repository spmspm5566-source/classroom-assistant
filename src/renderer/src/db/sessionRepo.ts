/**
 * sessionRepo.ts — 課堂節次操作
 *
 * 一節課對應一筆 Session。
 * 開始第一個操作（抽籤/加分）時自動建立，下一節課再建立新筆。
 *
 * 「該節課」的範圍很重要：
 *  - 第一次答錯不扣分
 *  - 連對加成
 *  - 抽籤機率調整
 *  全部以 sessionId 為單位重置。
 */

import { nanoid } from 'nanoid'
import { db, type Session } from './schema'

// ── 取得 / 建立今日 session ──────────────────────────────────

/**
 * getOrCreateTodaySession
 * 取得「今天且該班」的 session。若不存在則建立新的。
 *
 * 注意：教師可能一天上同一個班 2 節課（一二節連堂、五六節再上），
 * 預設一天一筆。若需區分，可改用 startNewSession() 強制建立新節。
 */
export async function getOrCreateTodaySession(classId: string): Promise<Session> {
  const today = new Date().toISOString().slice(0, 10)   // YYYY-MM-DD

  const existing = await db.sessions
    .where('[classId+date]')
    .equals([classId, today])
    .first()

  if (existing) return existing

  const sess: Session = {
    id:      nanoid(),
    classId,
    date:    today,
    startAt: Date.now()
  }
  await db.sessions.add(sess)
  return sess
}

/** 強制建立新節次（同一天的下一節） */
export async function startNewSession(classId: string, note?: string): Promise<Session> {
  const today = new Date().toISOString().slice(0, 10)
  const sess: Session = {
    id:      nanoid(),
    classId,
    date:    today,
    startAt: Date.now(),
    note
  }
  await db.sessions.add(sess)
  return sess
}

/** 結束 session（記錄結束時間） */
export async function endSession(id: string): Promise<void> {
  await db.sessions.update(id, { endAt: Date.now() })
}

// ── 查詢 ─────────────────────────────────────────────────────

export async function getSession(id: string): Promise<Session | undefined> {
  return db.sessions.get(id)
}

export async function listClassSessions(classId: string, limit = 50): Promise<Session[]> {
  const list = await db.sessions.where('classId').equals(classId).reverse().sortBy('startAt')
  return list.slice(0, limit)
}
