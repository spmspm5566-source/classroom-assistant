/**
 * useStudentScores.ts — 取得班級全體學生的累計總分（即時更新）
 *
 * 用 dexie-react-hooks 的 useLiveQuery 監聽 scoreEvents 表，
 * 回傳 Record<studentId, number>，UI 元件直接查表即可。
 *
 * 特殊事件：
 *  - group_done：studentId = '__group__'，代表「全組團體加分」，
 *    不計入任何個人分數，僅由 useGroupScores 依 groupId 加總到小組分數。
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'

/** 群組事件的 studentId 哨兵值（全組完成 +N，不計入個人） */
export const GROUP_EVENT_STUDENT_ID = '__group__'

/**
 * useStudentScores
 * @param classId   班級 id
 * @returns         { studentId: 累計總分 } 對應表（排除 group_done 群組事件）
 */
export function useStudentScores(classId: string | null): Record<string, number> {
  return useLiveQuery(
    async () => {
      if (!classId) return {}
      const events = await db.scoreEvents.where('classId').equals(classId).toArray()
      const map: Record<string, number> = {}
      for (const e of events) {
        // 排除全組團體加分事件（不計入個人分數）
        if (e.studentId === GROUP_EVENT_STUDENT_ID) continue
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
 * 計算每組的累計總分，包含：
 *  1. 所有成員個人加分之總和
 *  2. 「全組完成」群組加分（studentId = '__group__'，直接依 groupId 加總）
 */
export function useGroupScores(
  classId:          string | null,
  examPeriodId:     string | null,
  studentScores:    Record<string, number>,
  studentToGroupId: Record<string, string | null>
): Record<string, number> {
  // 查詢群組事件（全組完成，不依附於個人）
  const groupOnlyEvents = useLiveQuery(
    async () => {
      if (!classId) return []
      return db.scoreEvents
        .where('classId')
        .equals(classId)
        .and(e =>
          e.studentId === GROUP_EVENT_STUDENT_ID &&
          (examPeriodId ? e.examPeriodId === examPeriodId : true)
        )
        .toArray()
    },
    [classId, examPeriodId],
    []
  ) ?? []

  // 1. 個人分數加總到小組
  const groupScores: Record<string, number> = {}
  for (const [studentId, score] of Object.entries(studentScores)) {
    const groupId = studentToGroupId[studentId]
    if (!groupId) continue
    groupScores[groupId] = (groupScores[groupId] ?? 0) + score
  }

  // 2. 群組事件直接依 groupId 加總（全組完成 +N）
  for (const e of groupOnlyEvents) {
    if (!e.groupId) continue
    groupScores[e.groupId] = (groupScores[e.groupId] ?? 0) + e.score
  }

  return groupScores
}
