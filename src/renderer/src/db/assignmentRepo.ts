/**
 * assignmentRepo.ts — 段考期分組指派操作
 *
 * 每位學生在「每個段考期」各自有分組與角色（Assignment）。
 * 這取代舊的「單一 Student.groupId」設計，讓不同段考期可獨立分組且都保留。
 *
 * 顯示：用 scopeStudents() 把指定段考期的指派合併進 Student 物件
 *       （填入 groupId/role/labGroupId/labRole），讓既有顯示元件不必改讀法。
 * 寫入：所有分組/角色變更都透過本檔的函式，指定 examPeriodId。
 */

import { nanoid } from 'nanoid'
import { db, type Student, type Assignment, type StudentRole } from './schema'

// ── 查詢 ─────────────────────────────────────────────────────

/** 取得某段考期所有指派，鍵為 studentId */
export async function getMap(examPeriodId: string): Promise<Map<string, Assignment>> {
  const list = await db.assignments.where('examPeriodId').equals(examPeriodId).toArray()
  const m = new Map<string, Assignment>()
  for (const a of list) m.set(a.studentId, a)
  return m
}

/**
 * scopeStudents
 * 把某段考期的指派合併進學生陣列：回傳的 Student 物件，其
 * groupId/role/labGroupId/labRole 來自該段考期的指派（無指派則為 null）。
 * 不修改 DB，只是顯示用的合併。
 */
export async function scopeStudents(students: Student[], examPeriodId: string | null): Promise<Student[]> {
  if (!examPeriodId) {
    return students.map(s => ({ ...s, groupId: null, role: null, labGroupId: null, labRole: null }))
  }
  const map = await getMap(examPeriodId)
  return students.map(s => {
    const a = map.get(s.id)
    return {
      ...s,
      groupId:    a?.groupId    ?? null,
      role:       a?.role       ?? null,
      labGroupId: a?.labGroupId ?? null,
      labRole:    a?.labRole    ?? null
    }
  })
}

// ── 寫入（單筆 upsert） ───────────────────────────────────────

async function upsert(
  examPeriodId: string,
  classId:      string,
  studentId:    string,
  patch:        Partial<Pick<Assignment, 'groupId' | 'role' | 'labGroupId' | 'labRole'>>
): Promise<void> {
  const existing = await db.assignments
    .where('[examPeriodId+studentId]').equals([examPeriodId, studentId]).first()
  if (existing) {
    await db.assignments.update(existing.id, patch)
  } else {
    await db.assignments.add({
      id:           nanoid(),
      classId,
      examPeriodId,
      studentId,
      groupId:      patch.groupId ?? null,
      role:         patch.role ?? null,
      labGroupId:   patch.labGroupId ?? null,
      labRole:      patch.labRole ?? null
    })
  }
}

/**
 * assignClassroom
 * 指派學生到教室小組與角色（指定段考期）。
 * 自動鏡射：若實驗桌座位尚未設定過，把同值寫入 lab 欄位（首次一致，之後獨立）。
 */
export async function assignClassroom(
  examPeriodId: string,
  classId:      string,
  studentId:    string,
  groupId:      string | null,
  role:         StudentRole | null
): Promise<void> {
  const existing = await db.assignments
    .where('[examPeriodId+studentId]').equals([examPeriodId, studentId]).first()

  const patch: Partial<Assignment> = { groupId, role }
  if (!existing || ((existing.labGroupId ?? null) === null && (existing.labRole ?? null) === null)) {
    patch.labGroupId = groupId
    patch.labRole    = role
  }
  await upsert(examPeriodId, classId, studentId, patch)
}

/** 指派學生到實驗桌小組與角色（指定段考期），不影響教室座位 */
export async function assignLab(
  examPeriodId: string,
  classId:      string,
  studentId:    string,
  labGroupId:   string | null,
  labRole:      StudentRole | null
): Promise<void> {
  await upsert(examPeriodId, classId, studentId, { labGroupId, labRole })
}

/** 直接寫入完整指派（匯入用） */
export async function setFull(
  examPeriodId: string,
  classId:      string,
  studentId:    string,
  fields:       Pick<Assignment, 'groupId' | 'role' | 'labGroupId' | 'labRole'>
): Promise<void> {
  await upsert(examPeriodId, classId, studentId, fields)
}

// ── 複製整個段考期的指派（建立新段考時用） ───────────────────

/**
 * copyAssignments
 * 把來源段考期的分組指派複製到新段考期，依「組別編號」對應到新段考期的同號組。
 * @param srcPeriodId  來源段考期
 * @param dstPeriodId  目標（新）段考期
 * @param srcGroups    來源段考期的組（id→number）
 * @param dstGroups    目標段考期的組（number→id）
 */
export async function copyAssignments(
  srcPeriodId: string,
  dstPeriodId: string,
  srcGroups:   { id: string; number: number }[],
  dstGroups:   { id: string; number: number }[]
): Promise<void> {
  const srcNumById = new Map<string, number>(srcGroups.map(g => [g.id, g.number]))
  const dstIdByNum = new Map<number, string>(dstGroups.map(g => [g.number, g.id]))
  const mapGroup = (gid: string | null): string | null => {
    if (!gid) return null
    const num = srcNumById.get(gid)
    if (num == null) return null
    return dstIdByNum.get(num) ?? null
  }

  const srcAssignments = await db.assignments.where('examPeriodId').equals(srcPeriodId).toArray()
  await db.transaction('rw', db.assignments, async () => {
    for (const a of srcAssignments) {
      await upsert(dstPeriodId, a.classId, a.studentId, {
        groupId:    mapGroup(a.groupId),
        role:       a.role,
        labGroupId: mapGroup(a.labGroupId),
        labRole:    a.labRole
      })
    }
  })
}

// ── 清理（刪除學生 / 刪除段考期時） ──────────────────────────

export async function deleteByStudent(studentId: string): Promise<void> {
  await db.assignments.where('studentId').equals(studentId).delete()
}

export async function deleteByPeriod(examPeriodId: string): Promise<void> {
  await db.assignments.where('examPeriodId').equals(examPeriodId).delete()
}
