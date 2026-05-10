/**
 * useStudentScores.ts — 取得班級全體學生的累計總分（即時更新）
 *
 * 用 dexie-react-hooks 的 useLiveQuery 監聽 scoreEvents 表，
 * 回傳 Record<studentId, number>，UI 元件直接查表即可。
 *
 * 因為查全班所有事件、reduce 加總，量大時可能影響效能。
 * 之後若有效能問題，可改用 IndexedDB 的彙總或快取機制。
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'

/**
 * useStudentScores
 * @param classId   班級 id
 * @returns         { studentId: 累計總分 } 對應表
 */
export function useStudentScores(classId: string | null): Record<string, number> {
  return useLiveQuery(
    async () => {
      if (!classId) return {}
      const events = await db.scoreEvents.where('classId').equals(classId).toArray()
      const map: Record<string, number> = {}
      for (const e of events) {
        map[e.studentId] = (map[e.studentId] ?? 0) + e.score
      }
      return map
    },
    [classId],
    {}
  ) ?? {}
}

/**
 * useGroupScores
 * 計算每組的累計總分。
 * 將學生分數依 groupId 加總，未分組者忽略。
 */
export function useGroupScores(
  classId:   string | null,
  studentScores: Record<string, number>,
  studentToGroupId: Record<string, string | null>
): Record<string, number> {
  const groupScores: Record<string, number> = {}
  for (const [studentId, score] of Object.entries(studentScores)) {
    const groupId = studentToGroupId[studentId]
    if (!groupId) continue
    groupScores[groupId] = (groupScores[groupId] ?? 0) + score
  }
  return groupScores
}
