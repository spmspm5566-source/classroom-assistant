/**
 * studentRepo.ts — 學生資料操作
 *
 * 主要 API：
 *  - listByClass(classId)            列出某班所有學生（依座號排序）
 *  - createStudent(input)            新增單筆
 *  - bulkImport(classId, rows)       Excel/CSV 批次匯入
 *  - updateStudent(id, patch)        修改單筆
 *  - deleteStudent(id)               刪除單筆
 *  - assignGroup(studentId, ...)     分組與角色指派
 *  - updatePosition(...)             更新座位位置
 */

import { nanoid } from 'nanoid'
import { db, type Student, type StudentRole } from './schema'

// ── 查詢 ─────────────────────────────────────────────────────

export async function listByClass(classId: string): Promise<Student[]> {
  const list = await db.students.where('classId').equals(classId).toArray()
  return list.sort((a, b) => a.seatNo - b.seatNo)
}

export async function getStudent(id: string): Promise<Student | undefined> {
  return db.students.get(id)
}

export async function listByGroup(groupId: string): Promise<Student[]> {
  const list = await db.students.where('groupId').equals(groupId).toArray()
  // 角色順序：組長 → 助教 → 組員 A→B→C→D
  const order: Record<StudentRole, number> = {
    leader: 0, assistant: 1, memberA: 2, memberB: 3, memberC: 4, memberD: 5
  }
  return list.sort((a, b) => {
    const oa = a.role ? order[a.role] : 99
    const ob = b.role ? order[b.role] : 99
    if (oa !== ob) return oa - ob
    return a.seatNo - b.seatNo
  })
}

// ── 新增 ─────────────────────────────────────────────────────

export interface CreateStudentInput {
  classId: string
  seatNo:  number
  name:    string
  groupId?: string | null
  role?:    StudentRole | null
  remarks?: string
}

export async function createStudent(input: CreateStudentInput): Promise<Student> {
  const stu: Student = {
    id:        nanoid(),
    classId:   input.classId,
    seatNo:    input.seatNo,
    name:      input.name,
    groupId:   input.groupId ?? null,
    role:      input.role ?? null,
    position:  null,
    remarks:   input.remarks,
    createdAt: Date.now()
  }
  await db.students.add(stu)
  return stu
}

const ALL_ROLES: StudentRole[] = ['leader', 'assistant', 'memberA', 'memberB', 'memberC', 'memberD']

/**
 * bulkImport
 * 用於 Excel/CSV 匯入。會先刪除該班所有學生再寫入新清單。
 * 若傳入 groups（當前段考期的組列表），會依 groupNumber 自動對應 groupId。
 *
 * 座位排定：座位與角色無關。只要學生有分到組，就會自動排進該組的一個空座位
 * （角色槽），讓全部組員立刻看得到。Excel 有指定角色的優先佔該角色，
 * 其餘成員隨機塞進剩下的空位；老師可之後手動拖曳調整。
 */
export async function bulkImport(
  classId: string,
  rows: { seatNo: number; name: string; groupNumber?: number; role?: StudentRole; remarks?: string }[],
  examPeriodId?: string
): Promise<void> {
  await db.transaction('rw', [db.students, db.groups, db.assignments], async () => {
    // 組別編號 → 當下實際組 id
    const groupMap = new Map<number, string>()
    if (examPeriodId) {
      const groups = await db.groups.where('examPeriodId').equals(examPeriodId).toArray()
      for (const g of groups) {
        if (!groupMap.has(g.number)) groupMap.set(g.number, g.id)
      }
    }

    // 每位學生的基本資料（不含分組；分組存到 assignments）
    const records: Student[] = rows.map(r => ({
      id:         nanoid(),
      classId,
      seatNo:     r.seatNo,
      name:       r.name,
      groupId:    null,
      role:       null,
      labGroupId: null,
      labRole:    null,
      position:   null,
      remarks:    r.remarks,
      createdAt:  Date.now()
    }))

    // 算出每位學生的分組與角色（依 Excel 的組別/角色）
    type Plan = { studentId: string; groupId: string | null; role: StudentRole | null }
    const plans: Plan[] = records.map((s, i) => {
      const r = rows[i]
      const groupId = r.groupNumber ? (groupMap.get(r.groupNumber) ?? null) : null
      const role    = groupId ? (r.role ?? null) : null
      return { studentId: s.id, groupId, role }
    })

    // 自動排座位：同組學生填進空角色槽（座位與角色無關，先排好）
    const byGroup = new Map<string, Plan[]>()
    for (const p of plans) {
      if (!p.groupId) continue
      if (!byGroup.has(p.groupId)) byGroup.set(p.groupId, [])
      byGroup.get(p.groupId)!.push(p)
    }
    for (const members of byGroup.values()) {
      const used = new Set<StudentRole>()
      for (const p of members) {
        if (p.role && !used.has(p.role)) used.add(p.role)
        else if (p.role && used.has(p.role)) p.role = null
      }
      const free = ALL_ROLES.filter(r => !used.has(r))
      let fi = 0
      for (const p of members) {
        if (p.role) continue
        if (fi >= free.length) break
        p.role = free[fi++]
      }
    }

    // 清空該班學生 + 其所有指派，再寫入
    const oldStudents = await db.students.where('classId').equals(classId).toArray()
    const oldIds = oldStudents.map(s => s.id)
    await db.students.where('classId').equals(classId).delete()
    for (const id of oldIds) await db.assignments.where('studentId').equals(id).delete()
    await db.students.bulkAdd(records)

    // 寫入「目前段考期」的分組指派
    if (examPeriodId) {
      for (const p of plans) {
        if (!p.groupId) continue
        await db.assignments.add({
          id:           nanoid(),
          classId,
          examPeriodId,
          studentId:    p.studentId,
          groupId:      p.groupId,
          role:         p.role,
          labGroupId:   p.groupId,   // 首次鏡射到實驗桌
          labRole:      p.role
        })
      }
    }
  })
}

// ── 更新 ─────────────────────────────────────────────────────

export async function updateStudent(id: string, patch: Partial<Student>): Promise<void> {
  await db.students.update(id, patch)
}

/**
 * assignGroup
 * 指派學生到指定小組與角色（教室）。若 groupId/role 為 null 即解除分組。
 *
 * 自動鏡射：若該學生「實驗桌」的座位欄位（labGroupId/labRole）尚未設定過，
 * 會把同一份資料複製到實驗桌欄位，讓兩個檢視第一眼看起來一致；
 * 之後在實驗桌檢視拖曳會直接寫 lab 欄位，從此兩邊獨立。
 */
export async function assignGroup(
  studentId: string,
  groupId:   string | null,
  role:      StudentRole | null
): Promise<void> {
  const stu = await db.students.get(studentId)
  if (!stu) return

  const updates: Partial<Student> = { groupId, role }

  // 若 lab 從未指派 → 同步鏡射
  if ((stu.labGroupId ?? null) === null && (stu.labRole ?? null) === null) {
    updates.labGroupId = groupId
    updates.labRole    = role
  }

  await db.students.update(studentId, updates)
}

/**
 * updatePosition
 * 更新學生在教室座位表的位置。null 表示尚未排定。
 */
export async function updatePosition(
  studentId: string,
  position:  { row: number, col: number } | null
): Promise<void> {
  await db.students.update(studentId, { position })
}

/**
 * swapPositions
 * 交換兩名學生的座位位置（用於拖曳排座位）。
 */
export async function swapPositions(studentIdA: string, studentIdB: string): Promise<void> {
  await db.transaction('rw', db.students, async () => {
    const a = await db.students.get(studentIdA)
    const b = await db.students.get(studentIdB)
    if (!a || !b) return
    await db.students.update(studentIdA, { position: b.position })
    await db.students.update(studentIdB, { position: a.position })
  })
}

// ── 刪除 ─────────────────────────────────────────────────────

export async function deleteStudent(id: string): Promise<void> {
  await db.transaction('rw', [db.students, db.assignments, db.scoreEvents, db.examScores], async () => {
    // 加分歷史記錄保留（用 studentId 追蹤）；分組指派則清除
    await db.assignments.where('studentId').equals(id).delete()
    await db.students.delete(id)
  })
}
