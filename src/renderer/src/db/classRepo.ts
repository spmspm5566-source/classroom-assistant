/**
 * classRepo.ts — 班級資料操作（Repository Pattern）
 *
 * 將 Dexie 的 CRUD 集中在一處，避免 React 元件直接接觸資料庫，
 * 方便日後切換儲存方式（如改成 Apps Script 同步）或加入 cache。
 */

import { nanoid } from 'nanoid'
import { db, type Class, type ExamPeriod } from './schema'

// ── 查詢 ─────────────────────────────────────────────────────

export async function listClasses(): Promise<Class[]> {
  // 依年級、班名排序
  const all = await db.classes.toArray()
  return all.sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade
    return a.name.localeCompare(b.name)
  })
}

export async function getClass(id: string): Promise<Class | undefined> {
  return db.classes.get(id)
}

// ── 新增 ─────────────────────────────────────────────────────

export interface CreateClassInput {
  name:              string
  grade:             number
  rows?:             number    // 預設 6
  cols?:             number    // 預設 6
  semester:          string
  defaultGroupCount?: number   // 每段考期預設小組數（預設 6）
}

/**
 * createClass
 * 建立班級。注意：此函式只建立 Class 記錄。
 * 第一次段考 + 預設 6 組 由呼叫端用 examPeriodRepo.createExamPeriod 建立，
 * 以避免 schema 內循環相依。
 */
export async function createClass(input: CreateClassInput): Promise<Class> {
  const cls: Class = {
    id:                nanoid(),
    name:              input.name,
    grade:             input.grade,
    rows:              input.rows ?? 6,
    cols:              input.cols ?? 6,
    semester:          input.semester,
    defaultGroupCount: input.defaultGroupCount ?? 6,
    createdAt:         Date.now()
  }
  await db.classes.add(cls)
  return cls
}

/**
 * createClassWithFirstPeriod
 * 一次性建立班級 + 第一次段考 + 6 組預設小組。
 * 這是大多數情境（建立新班級）會用的便利函式。
 */
export async function createClassWithFirstPeriod(input: CreateClassInput): Promise<{
  cls: Class
  period: ExamPeriod
}> {
  const cls = await createClass(input)

  // 用 dynamic import 避免循環相依
  const { createExamPeriod } = await import('./examPeriodRepo')
  const { period } = await createExamPeriod({
    classId:    cls.id,
    number:     1,
    name:       '第一次段考',
    groupCount: cls.defaultGroupCount ?? 6
  })

  return { cls, period }
}

// ── 更新 ─────────────────────────────────────────────────────

export async function updateClass(id: string, patch: Partial<Class>): Promise<void> {
  await db.classes.update(id, patch)
}

// ── 刪除（連同所有相關資料）──────────────────────────────────

/**
 * deleteClass
 * 刪除班級會連帶清除所有學生、小組、加分記錄、考試成績、段考期。
 * 使用 transaction 確保資料一致性。
 */
export async function deleteClass(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.classes, db.students, db.groups, db.sessions, db.scoreEvents, db.examPeriods, db.examScores],
    async () => {
      await db.scoreEvents.where('classId').equals(id).delete()
      await db.examScores.where('classId').equals(id).delete()
      await db.examPeriods.where('classId').equals(id).delete()
      await db.sessions.where('classId').equals(id).delete()
      await db.groups.where('classId').equals(id).delete()
      await db.students.where('classId').equals(id).delete()
      await db.classes.delete(id)
    }
  )
}
