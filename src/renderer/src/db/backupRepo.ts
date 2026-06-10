/**
 * backupRepo.ts — 整包資料備份 / 還原
 *
 * 備份格式（JSON）：
 *  {
 *    version:    number,       // DB schema 版本
 *    exportedAt: number,       // 匯出時間戳
 *    tables: {
 *      classes, students, groups, assignments,
 *      sessions, scoreEvents, examPeriods,
 *      exams, examScores, config
 *    }
 *  }
 *
 * - 匯出：讀出全部資料表，序列化為 JSON 字串
 * - 匯入：清空全部資料表，逐表批次寫回
 * - 不含密碼還原：還原後保留現有 config（可選）
 */

import { db } from './schema'

const BACKUP_VERSION = 4

export interface BackupData {
  version:    number
  exportedAt: number
  tables: {
    classes:     unknown[]
    students:    unknown[]
    groups:      unknown[]
    assignments: unknown[]
    sessions:    unknown[]
    scoreEvents: unknown[]
    examPeriods: unknown[]
    exams:       unknown[]
    examScores:  unknown[]
    config:      unknown[]
  }
}

/** 匯出全部資料，傳回 JSON 字串 */
export async function exportBackup(): Promise<string> {
  const [
    classes, students, groups, assignments,
    sessions, scoreEvents, examPeriods,
    exams, examScores, config
  ] = await Promise.all([
    db.classes.toArray(),
    db.students.toArray(),
    db.groups.toArray(),
    db.assignments.toArray(),
    db.sessions.toArray(),
    db.scoreEvents.toArray(),
    db.examPeriods.toArray(),
    db.exams.toArray(),
    db.examScores.toArray(),
    db.config.toArray()
  ])

  const backup: BackupData = {
    version:    BACKUP_VERSION,
    exportedAt: Date.now(),
    tables: {
      classes, students, groups, assignments,
      sessions, scoreEvents, examPeriods,
      exams, examScores, config
    }
  }

  return JSON.stringify(backup, null, 2)
}

/** 還原備份（清空全部資料表後寫回） */
export async function importBackup(jsonStr: string): Promise<void> {
  let backup: BackupData
  try {
    backup = JSON.parse(jsonStr) as BackupData
  } catch {
    throw new Error('備份檔格式錯誤：無法解析 JSON')
  }

  if (!backup.tables) {
    throw new Error('備份檔格式錯誤：缺少 tables 欄位')
  }

  const t = backup.tables

  await db.transaction(
    'rw',
    [
      db.classes, db.students, db.groups, db.assignments,
      db.sessions, db.scoreEvents, db.examPeriods,
      db.exams, db.examScores, db.config
    ],
    async () => {
      await Promise.all([
        db.classes.clear(),
        db.students.clear(),
        db.groups.clear(),
        db.assignments.clear(),
        db.sessions.clear(),
        db.scoreEvents.clear(),
        db.examPeriods.clear(),
        db.exams.clear(),
        db.examScores.clear(),
        db.config.clear()
      ])

      await Promise.all([
        t.classes?.length     ? db.classes.bulkAdd(t.classes     as any[]) : Promise.resolve(),
        t.students?.length    ? db.students.bulkAdd(t.students    as any[]) : Promise.resolve(),
        t.groups?.length      ? db.groups.bulkAdd(t.groups        as any[]) : Promise.resolve(),
        t.assignments?.length ? db.assignments.bulkAdd(t.assignments as any[]) : Promise.resolve(),
        t.sessions?.length    ? db.sessions.bulkAdd(t.sessions    as any[]) : Promise.resolve(),
        t.scoreEvents?.length ? db.scoreEvents.bulkAdd(t.scoreEvents as any[]) : Promise.resolve(),
        t.examPeriods?.length ? db.examPeriods.bulkAdd(t.examPeriods as any[]) : Promise.resolve(),
        t.exams?.length       ? db.exams.bulkAdd(t.exams          as any[]) : Promise.resolve(),
        t.examScores?.length  ? db.examScores.bulkAdd(t.examScores as any[]) : Promise.resolve(),
        t.config?.length      ? db.config.bulkAdd(t.config        as any[]) : Promise.resolve()
      ])
    }
  )
}

/** 產生備份檔名（含日期） */
export function backupFileName(): string {
  const now = new Date()
  const y  = now.getFullYear()
  const m  = String(now.getMonth() + 1).padStart(2, '0')
  const d  = String(now.getDate()).padStart(2, '0')
  return `班級助手備份_${y}${m}${d}.json`
}
