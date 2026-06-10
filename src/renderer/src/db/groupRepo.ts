/**
 * groupRepo.ts — 小組資料操作
 *
 * v2 之後每個小組都隸屬於一個段考期（Group.examPeriodId）。
 * 老師每次段考會重新分組 → 這意味著建立新段考期時會建立 6 個新組。
 * 學生 Student.groupId 永遠指向「目前段考期」的某組。
 */

import { nanoid } from 'nanoid'
import { db, type Group, type Student } from './schema'

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

/**
 * ensureGroupsUpTo（安全同步到 targetCount）
 * 確保某段考期的小組編號正好為 1..targetCount：
 *  - 新增缺少的編號
 *  - 移除「編號 > targetCount 且沒有學生」的空組
 * 絕不刪除有學生的組、不去重複、不動學生資料，因此可安全地在每次進入頁面時呼叫，
 * 不會弄丟學生分組（避免破壞性的 normalizeGroups 在班級切換競態下誤刪）。
 */
export async function ensureGroupsUpTo(
  classId:      string,
  examPeriodId: string,
  targetCount:  number
): Promise<void> {
  await db.transaction('rw', [db.groups, db.assignments], async () => {
    const existing = await db.groups.where('examPeriodId').equals(examPeriodId).toArray()
    const nums = new Set(existing.map(g => g.number))
    // 補缺號
    for (let i = 1; i <= targetCount; i++) {
      if (nums.has(i)) continue
      await db.groups.add({
        id:           nanoid(),
        classId,
        examPeriodId,
        number:       i,
        name:         `第${i}組`,
        color:        DEFAULT_GROUP_COLORS[(i - 1) % DEFAULT_GROUP_COLORS.length],
        createdAt:    Date.now()
      })
    }
    // 移除超過目標數且沒有指派的空組（依 assignments 即時確認，只刪空組）
    for (const g of existing) {
      if (g.number <= targetCount) continue
      const cntClassroom = await db.assignments.where('groupId').equals(g.id).count()
      const cntLab       = await db.assignments.where('labGroupId').equals(g.id).count()
      if (cntClassroom === 0 && cntLab === 0) await db.groups.delete(g.id)
    }
  })
}

/**
 * syncGroupCount
 * 將某段考期的小組數同步到 targetCount。增加組數時只補不刪（安全）；
 * 減少組數的清理請改用 normalizeGroups（會刪空組）。
 */
export async function syncGroupCount(
  classId:      string,
  examPeriodId: string,
  targetCount:  number
): Promise<void> {
  await ensureGroupsUpTo(classId, examPeriodId, targetCount)
}

/**
 * normalizeGroups
 * 在單一交易內整理某段考期的小組，確保資料乾淨且為 1..targetCount：
 *  1. 去除「重複編號」的組 — 保留成員最多的那一個，其餘組的成員併入保留組後刪除
 *  2. 補齊缺少的編號（1..targetCount）
 *  3. 移除「編號 > targetCount 且沒有成員」的多餘空組
 *
 * 此函式冪等，重複呼叫安全，可用來修復先前競態產生的重複組。
 */
export async function normalizeGroups(
  classId:      string,
  examPeriodId: string,
  targetCount:  number
): Promise<void> {
  await db.transaction('rw', [db.groups, db.students], async () => {
    const groups   = await db.groups.where('examPeriodId').equals(examPeriodId).toArray()
    const students = await db.students.where('classId').equals(classId).toArray()
    const memberCount = (gid: string): number => students.filter(s => s.groupId === gid).length

    // 1. 依編號分組，重複者保留成員最多的，其餘併入後刪除
    //    注意：labGroupId 非索引欄位，不能用 .where()，改以主鍵逐筆更新。
    const byNumber = new Map<number, Group[]>()
    for (const g of groups) {
      if (!byNumber.has(g.number)) byNumber.set(g.number, [])
      byNumber.get(g.number)!.push(g)
    }
    for (const list of byNumber.values()) {
      if (list.length <= 1) continue
      list.sort((a, b) => memberCount(b.id) - memberCount(a.id))
      const keep = list[0]
      const removeIds = new Set(list.slice(1).map(g => g.id))
      // 把待刪除組的成員（教室與實驗桌座位）改派到保留組
      for (const s of students) {
        const patch: Partial<Student> = {}
        if (s.groupId && removeIds.has(s.groupId))       patch.groupId = keep.id
        if (s.labGroupId && removeIds.has(s.labGroupId)) patch.labGroupId = keep.id
        if (Object.keys(patch).length > 0) await db.students.update(s.id, patch)
      }
      for (const id of removeIds) await db.groups.delete(id)
    }

    // 2. 補齊缺少的編號
    const remaining = await db.groups.where('examPeriodId').equals(examPeriodId).toArray()
    const nums = new Set(remaining.map(g => g.number))
    for (let i = 1; i <= targetCount; i++) {
      if (nums.has(i)) continue
      await db.groups.add({
        id:           nanoid(),
        classId,
        examPeriodId,
        number:       i,
        name:         `第${i}組`,
        color:        DEFAULT_GROUP_COLORS[(i - 1) % DEFAULT_GROUP_COLORS.length],
        createdAt:    Date.now()
      })
    }

    // 3. 移除超過目標數且沒有成員的空組
    //    用即時的索引查詢確認成員數（groupId 有索引），避免用過時的陣列誤刪有學生的組。
    for (const g of remaining) {
      if (g.number <= targetCount) continue
      const cnt = await db.students.where('groupId').equals(g.id).count()
      if (cnt === 0) {
        await db.groups.delete(g.id)
      }
    }
  })
}

// ── 更新 ─────────────────────────────────────────────────────

export async function updateGroup(id: string, patch: Partial<Group>): Promise<void> {
  await db.groups.update(id, patch)
}

/**
 * reorderGroups
 * 依傳入的 group id 陣列（代表使用者排好的新順序），
 * 將每個 group.number 更新為其在陣列中的位置（1-based）。
 */
export async function reorderGroups(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.groups, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.groups.update(orderedIds[i], { number: i + 1 })
    }
  })
}

// ── 刪除 ─────────────────────────────────────────────────────

/**
 * deleteGroup
 * 刪除小組會把指派到此組的學生解除分組（清除對應的 assignment 欄位）。
 */
export async function deleteGroup(id: string): Promise<void> {
  await db.transaction('rw', [db.groups, db.assignments], async () => {
    await db.assignments.where('groupId').equals(id).modify({ groupId: null, role: null })
    await db.assignments.where('labGroupId').equals(id).modify({ labGroupId: null, labRole: null })
    await db.groups.delete(id)
  })
}
