/**
 * groupRepo.ts — 小組資料操作
 *
 * v2 之後每個小組都隸屬於一個段考期（Group.examPeriodId）。
 * 老師每次段考會重新分組 → 這意味著建立新段考期時會建立 6 個新組。
 * 學生 Student.groupId 永遠指向「目前段考期」的某組。
 */

import { nanoid } from 'nanoid'
import { db, type Group } from './schema'

// ── 預設組別顏色 ─────────────────────────────────────────────
const DEFAULT_GROUP_COLORS = [
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#a855f7'
]

const DEFAULT_GROUP_COUNT = 6

// ── 查詢 ─────────────────────────────────────────────────────

/** 列出某班所有小組（跨段考期，依 number 排序） */
export async function listByClass(classId: string): Promise<Group[]> {
  const list = await db.groups.where('classId').equals(classId).toArray()
  return list.sort((a, b) => a.number - b.number)
}

/** 列出某段考期的小組（依 number 排序）— 主要查詢方式 */
export async function listByPeriod(examPeriodId: string): Promise<Group[]> {
  const list = await db.groups.where('examPeriodId').equals(examPeriodId).toArray()
  return list.sort((a, b) => a.number - b.number)
}

export async function getGroup(id: string): Promise<Group | undefined> {
  return db.groups.get(id)
}

// ── 新增 ─────────────────────────────────────────────────────

export async function createGroup(
  classId:      string,
  examPeriodId: string,
  number:       number,
  name?:        string,
  color?:       string
): Promise<Group> {
  const grp: Group = {
    id:           nanoid(),
    classId,
    examPeriodId,
    number,
    name:         name ?? `第${number}組`,
    color:        color ?? DEFAULT_GROUP_COLORS[(number - 1) % DEFAULT_GROUP_COLORS.length],
    createdAt:    Date.now()
  }
  await db.groups.add(grp)
  return grp
}

/**
 * ensureDefaultGroups
 * 為某段考期建立預設 6 組（若已存在則不重複建立）。
 * 通常在 examPeriodRepo.createExamPeriod 已呼叫，這裡作為保險用。
 */
export async function ensureDefaultGroups(
  classId:      string,
  examPeriodId: string
): Promise<Group[]> {
  const existing = await listByPeriod(examPeriodId)
  if (existing.length >= DEFAULT_GROUP_COUNT) return existing

  const groups: Group[] = [...existing]
  for (let i = 1; i <= DEFAULT_GROUP_COUNT; i++) {
    if (existing.find(g => g.number === i)) continue
    const grp = await createGroup(classId, examPeriodId, i)
    groups.push(grp)
  }
  return groups.sort((a, b) => a.number - b.number)
}

// ── 更新 ─────────────────────────────────────────────────────

export async function updateGroup(id: string, patch: Partial<Group>): Promise<void> {
  await db.groups.update(id, patch)
}

// ── 刪除 ─────────────────────────────────────────────────────

/**
 * deleteGroup
 * 刪除小組會把組內所有學生解除分組（groupId 與 role 設為 null）。
 */
export async function deleteGroup(id: string): Promise<void> {
  await db.transaction('rw', [db.groups, db.students], async () => {
    await db.students.where('groupId').equals(id).modify({ groupId: null, role: null })
    await db.groups.delete(id)
  })
}
