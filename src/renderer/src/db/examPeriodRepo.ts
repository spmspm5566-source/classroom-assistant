/**
 * examPeriodRepo.ts — 段考期間（第一次/第二次/第三次段考）操作
 *
 * 設計重點：
 *  - 每班級可有多個段考期，編號 1,2,3...
 *  - 每段考期擁有自己的 6 個小組（Group.examPeriodId）
 *  - 學生在不同段考期可分到不同組（透過 Student.groupId 指向當前段考期的組）
 *  - 加分事件（ScoreEvent.examPeriodId）會標記所屬段考期，方便後續分期統計排名
 */

import { nanoid } from 'nanoid'
import { db, type ExamPeriod, type Group } from './schema'

// ── 預設組別顏色 ─────────────────────────────────────────────
const DEFAULT_GROUP_COLORS = [
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#a855f7'
]

// ── 查詢 ─────────────────────────────────────────────────────

/** 列出某班所有段考期（依 number 升冪排序） */
export async function listByClass(classId: string): Promise<ExamPeriod[]> {
  const list = await db.examPeriods.where('classId').equals(classId).toArray()
  return list.sort((a, b) => a.number - b.number)
}

export async function getById(id: string): Promise<ExamPeriod | undefined> {
  return db.examPeriods.get(id)
}

/**
 * getNextNumber
 * 取得「下一次段考」的編號（用於自動建立第 N 次段考）
 */
export async function getNextNumber(classId: string): Promise<number> {
  const list = await listByClass(classId)
  if (list.length === 0) return 1
  return Math.max(...list.map(p => p.number)) + 1
}

// ── 新增 ─────────────────────────────────────────────────────

export interface CreateExamPeriodInput {
  classId:    string
  number?:    number    // 不傳則自動取下一個
  name?:      string    // 不傳則用「第N次段考」
  startDate?: string
  endDate?:   string
  weekCount?: number
  /** 從某段考期複製學生分組到新期。若不傳則新期 6 組為空。 */
  copyAssignmentsFromPeriodId?: string
}

/**
 * createExamPeriod
 * 建立段考期 + 自動建立 6 個預設小組。
 * 若指定 copyAssignmentsFromPeriodId，會把學生從舊組對應到新組（同 number 的組）。
 */
export async function createExamPeriod(input: CreateExamPeriodInput): Promise<{
  period: ExamPeriod
  groups: Group[]
}> {
  const number = input.number ?? await getNextNumber(input.classId)

  return db.transaction('rw', [db.examPeriods, db.groups, db.students], async () => {
    // 1. 建立段考期
    const period: ExamPeriod = {
      id:        nanoid(),
      classId:   input.classId,
      number,
      name:      input.name ?? `第${chineseNumber(number)}次段考`,
      startDate: input.startDate ?? '',
      endDate:   input.endDate ?? '',
      weekCount: input.weekCount ?? 8,
      createdAt: Date.now()
    }
    await db.examPeriods.add(period)

    // 2. 建立 6 個預設小組
    const groups: Group[] = []
    for (let i = 1; i <= 6; i++) {
      const grp: Group = {
        id:           nanoid(),
        classId:      input.classId,
        examPeriodId: period.id,
        number:       i,
        name:         `第${i}組`,
        color:        DEFAULT_GROUP_COLORS[(i - 1) % DEFAULT_GROUP_COLORS.length],
        createdAt:    Date.now()
      }
      await db.groups.add(grp)
      groups.push(grp)
    }

    // 3. 若指定來源段考期，把學生分組複製過來（依 group number 對應）
    if (input.copyAssignmentsFromPeriodId) {
      const oldGroups = await db.groups
        .where('examPeriodId').equals(input.copyAssignmentsFromPeriodId)
        .toArray()
      const oldNumberToNew = new Map<number, string>()
      for (const og of oldGroups) {
        const newG = groups.find(g => g.number === og.number)
        if (newG) oldNumberToNew.set(og.number, newG.id)
      }
      // 找出舊期的學生分組，對應到新期的組
      const students = await db.students.where('classId').equals(input.classId).toArray()
      for (const stu of students) {
        if (!stu.groupId) continue
        const oldGroup = oldGroups.find(og => og.id === stu.groupId)
        if (!oldGroup) continue
        const newGroupId = oldNumberToNew.get(oldGroup.number)
        if (newGroupId) {
          await db.students.update(stu.id, { groupId: newGroupId })
          // role 保留
        }
      }
    }

    return { period, groups }
  })
}

// ── 更新 ─────────────────────────────────────────────────────

export async function updateExamPeriod(id: string, patch: Partial<ExamPeriod>): Promise<void> {
  await db.examPeriods.update(id, patch)
}

// ── 刪除（連同小組與該期加分事件）───────────────────────────

/**
 * deleteExamPeriod
 * 刪除段考期會連帶刪除：
 *  - 該期的所有小組（Group.examPeriodId === id）
 *  - 該期的所有加分事件（ScoreEvent.examPeriodId === id）
 *  - 把指向這些小組的學生 groupId/role 設為 null
 *
 * 注意：不可刪除班級唯一一個段考期（須先建立另一個）。
 */
export async function deleteExamPeriod(id: string): Promise<void> {
  const period = await db.examPeriods.get(id)
  if (!period) return

  const allInClass = await listByClass(period.classId)
  if (allInClass.length <= 1) {
    throw new Error('每班至少需保留一個段考期，無法刪除唯一一個。')
  }

  await db.transaction(
    'rw',
    [db.examPeriods, db.groups, db.scoreEvents, db.students],
    async () => {
      // 找出該期所有小組
      const groups = await db.groups.where('examPeriodId').equals(id).toArray()
      const groupIds = new Set(groups.map(g => g.id))

      // 把指向這些組的學生解除分組
      for (const gid of groupIds) {
        await db.students.where('groupId').equals(gid).modify({ groupId: null, role: null })
      }

      // 刪除小組
      await db.groups.where('examPeriodId').equals(id).delete()
      // 刪除加分事件
      await db.scoreEvents.where('examPeriodId').equals(id).delete()
      // 刪除段考期
      await db.examPeriods.delete(id)
    }
  )
}

// ── 工具 ─────────────────────────────────────────────────────

/** 把 1, 2, 3 轉成「一」「二」「三」 */
function chineseNumber(n: number): string {
  const map = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  if (n <= 10) return map[n] ?? String(n)
  if (n < 20) return `十${map[n - 10] ?? ''}`
  return String(n)
}
