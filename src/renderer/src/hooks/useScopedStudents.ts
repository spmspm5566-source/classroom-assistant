/**
 * useScopedStudents.ts — 取得「合併指定段考期分組指派」的學生陣列
 *
 * 回傳的 Student 物件，其 groupId/role/labGroupId/labRole 來自該段考期的指派，
 * 讓既有顯示元件（座位表、學生列、抽籤器）不必改讀法即可支援每段考獨立分組。
 *
 * 反應式：監聽 students 與 assignments 兩張表，資料變更時自動更新。
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Student } from '../db/schema'

export function useScopedStudents(
  classId:      string | null,
  examPeriodId: string | null
): Student[] {
  return useLiveQuery(
    async (): Promise<Student[]> => {
      if (!classId) return []
      const students = await db.students.where('classId').equals(classId).toArray()
      students.sort((a, b) => a.seatNo - b.seatNo)
      if (!examPeriodId) {
        return students.map(s => ({ ...s, groupId: null, role: null, labGroupId: null, labRole: null }))
      }
      const assignments = await db.assignments.where('examPeriodId').equals(examPeriodId).toArray()
      const map = new Map(assignments.map(a => [a.studentId, a]))
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
    },
    [classId, examPeriodId],
    []
  ) ?? []
}
