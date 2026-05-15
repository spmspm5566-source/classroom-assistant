/**
 * backup.ts — 整包資料的 JSON 匯出 / 匯入
 *
 * 解決：換電腦或 C 槽被還原時資料消失的問題。
 *
 * 三種範圍：
 *  1. full     — 完整備份（包含所有班級、學生、分組、加分、成績、設定）
 *  2. roster   — 只匯出「學生名單 / 分組 / 角色」（換學期或臨時搬資料用）
 *  3. scoring  — 只匯出「加分事件 / 考試成績」（補回意外遺失的加分用）
 *
 * JSON 檔自帶 schema 版本檢查，避免日後升版後舊備份檔灌進新 schema 造成資料混亂。
 *
 * 匯入策略：**覆蓋模式**（先清空對應的資料表，再 bulkAdd 還原）。
 * 課堂工具情境簡單，覆蓋比合併更直觀且不會有 ID 衝突。
 */

import {
  db,
  type Class, type Student, type Group, type Session,
  type ExamPeriod, type Exam, type ExamScore, type ScoreEvent,
  type ConfigDoc
} from '../db/schema'

// 對應 schema.ts 目前的版本（v3）
const APP_NAME       = 'ClassroomAssistant'
const SCHEMA_VERSION = 3
const APP_VERSION    = '2.0.0'

export type BackupScope = 'full' | 'roster' | 'scoring'

export interface BackupFile {
  /** 必為 'ClassroomAssistant'；用來擋掉其他 App 的 JSON 檔 */
  appName:       typeof APP_NAME
  /** 必須與當前 schema 版本相同 */
  schemaVersion: number
  appVersion:    string
  /** ISO 8601 時間戳 */
  exportedAt:    string
  /** 匯出範圍 */
  scope:         BackupScope
  /** 各表資料；依 scope 不同含有不同子集 */
  data: {
    classes?:     Class[]
    students?:    Student[]
    groups?:      Group[]
    examPeriods?: ExamPeriod[]
    exams?:       Exam[]
    examScores?:  ExamScore[]
    scoreEvents?: ScoreEvent[]
    sessions?:    Session[]
    config?:      ConfigDoc
  }
}

// ── 匯出 ─────────────────────────────────────────────────────

/** 蒐集所選範圍的資料 */
async function collectData(scope: BackupScope): Promise<BackupFile['data']> {
  const data: BackupFile['data'] = {}

  // 學生名單範圍（含班級、分組、段考期，因為他們彼此關聯）
  if (scope === 'full' || scope === 'roster') {
    data.classes     = await db.classes.toArray()
    data.students    = await db.students.toArray()
    data.groups      = await db.groups.toArray()
    data.examPeriods = await db.examPeriods.toArray()
  }

  // 加分相關範圍
  if (scope === 'full' || scope === 'scoring') {
    data.exams       = await db.exams.toArray()
    data.examScores  = await db.examScores.toArray()
    data.scoreEvents = await db.scoreEvents.toArray()
    data.sessions    = await db.sessions.toArray()
  }

  // 完整備份才包含系統設定（含密碼、規則、語料庫）
  if (scope === 'full') {
    const cfg = await db.config.get('main')
    if (cfg) data.config = cfg
  }

  return data
}

/**
 * exportToFile
 * 直接觸發瀏覽器下載 JSON 備份檔。
 *
 * @returns 下載的檔名（呼叫端可顯示給使用者）
 */
export async function exportToFile(scope: BackupScope): Promise<string> {
  const backup: BackupFile = {
    appName:       APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    appVersion:    APP_VERSION,
    exportedAt:    new Date().toISOString(),
    scope,
    data:          await collectData(scope)
  }

  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)

  const scopeLabel =
    scope === 'full'    ? '完整' :
    scope === 'roster'  ? '分組角色' :
                          '加分成績'
  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-')
  const filename = `班級助手_備份_${scopeLabel}_${ts}.json`

  const a = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return filename
}

// ── 匯入 ─────────────────────────────────────────────────────

export interface ImportResult {
  scope:    BackupScope
  /** 每張表還原的筆數，例：{ students: 28, classes: 1 } */
  restored: Record<string, number>
}

/**
 * importFromFile
 * 讀取 JSON 備份檔並覆蓋對應的資料表。
 *
 * 安全檢查：
 *  - 必須是 ClassroomAssistant 備份
 *  - Schema 版本必須符合
 *
 * 注意：呼叫端通常要 `location.reload()` 讓所有 useLiveQuery 重新拉資料。
 */
export async function importFromFile(file: File): Promise<ImportResult> {
  const text = await file.text()

  let backup: BackupFile
  try {
    backup = JSON.parse(text) as BackupFile
  } catch {
    throw new Error('檔案不是有效的 JSON 格式')
  }

  // 驗證
  if (backup.appName !== APP_NAME) {
    throw new Error('這不是「班級助手」的備份檔（appName 不符）')
  }
  if (typeof backup.schemaVersion !== 'number') {
    throw new Error('備份檔缺少 schemaVersion 欄位')
  }
  if (backup.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `備份檔的 schema 版本（v${backup.schemaVersion}）與目前的版本（v${SCHEMA_VERSION}）不符。` +
      `請使用對應版本的班級助手匯入，或升版後重新匯出。`
    )
  }
  if (!backup.data) {
    throw new Error('備份檔缺少 data 欄位')
  }

  const restored: Record<string, number> = {}

  // 用 transaction 一次性還原，中斷不會留下半套資料
  await db.transaction(
    'rw',
    [
      db.classes, db.students, db.groups, db.sessions,
      db.examPeriods, db.exams, db.examScores, db.scoreEvents,
      db.config
    ],
    async () => {
      const d = backup.data

      // ── 學生名單範圍 ──
      if (d.classes) {
        await db.classes.clear()
        if (d.classes.length > 0) await db.classes.bulkAdd(d.classes)
        restored.classes = d.classes.length
      }
      if (d.students) {
        await db.students.clear()
        if (d.students.length > 0) await db.students.bulkAdd(d.students)
        restored.students = d.students.length
      }
      if (d.groups) {
        await db.groups.clear()
        if (d.groups.length > 0) await db.groups.bulkAdd(d.groups)
        restored.groups = d.groups.length
      }
      if (d.examPeriods) {
        await db.examPeriods.clear()
        if (d.examPeriods.length > 0) await db.examPeriods.bulkAdd(d.examPeriods)
        restored.examPeriods = d.examPeriods.length
      }

      // ── 加分相關範圍 ──
      if (d.exams) {
        await db.exams.clear()
        if (d.exams.length > 0) await db.exams.bulkAdd(d.exams)
        restored.exams = d.exams.length
      }
      if (d.examScores) {
        await db.examScores.clear()
        if (d.examScores.length > 0) await db.examScores.bulkAdd(d.examScores)
        restored.examScores = d.examScores.length
      }
      if (d.scoreEvents) {
        await db.scoreEvents.clear()
        if (d.scoreEvents.length > 0) await db.scoreEvents.bulkAdd(d.scoreEvents)
        restored.scoreEvents = d.scoreEvents.length
      }
      if (d.sessions) {
        await db.sessions.clear()
        if (d.sessions.length > 0) await db.sessions.bulkAdd(d.sessions)
        restored.sessions = d.sessions.length
      }

      // ── 設定（只完整備份才有）──
      if (d.config) {
        await db.config.put({ ...d.config, key: 'main' })
        restored.config = 1
      }
    }
  )

  return { scope: backup.scope, restored }
}

// ── 輔助：人類可讀的摘要 ─────────────────────────────────────

export function formatRestoredSummary(result: ImportResult): string {
  const parts: string[] = []
  const labels: Record<string, string> = {
    classes:     '班級',
    students:    '學生',
    groups:      '小組',
    examPeriods: '段考期',
    exams:       '考試',
    examScores:  '考試成績',
    scoreEvents: '加分事件',
    sessions:    '節次',
    config:      '系統設定'
  }
  for (const [key, count] of Object.entries(result.restored)) {
    if (count > 0) parts.push(`${labels[key] ?? key} ${count} 筆`)
  }
  return parts.join('、') || '（無資料）'
}
