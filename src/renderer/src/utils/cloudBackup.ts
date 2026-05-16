/**
 * cloudBackup.ts — 雲端備份（每班一格，加密上傳 / 解密下載）
 *
 * 解決：老師在不同教室電腦操作不同班級，整庫一包上傳會互相覆蓋。
 *
 * 設計：
 *  - 雲端 `user_class_backups` 表，主鍵 (user_id, class_id)，**每班一筆**
 *  - 上傳某班 → 只 upsert 那一筆，其他班雲端資料不動
 *  - 下載某班 → 只覆蓋本機那一班，其他本機班級保留（合併，不清空）
 *
 * 安全：每班的資料包在離開本機前用通行碼 AES-GCM 加密，雲端只存密文。
 * 注意：系統設定（規則/語料庫/密碼）屬全域，**不**含在每班備份內，
 *       需要時請用「完整 JSON 備份」。
 */

import { supabase } from '../lib/supabaseClient'
import {
  db,
  type Class, type Student, type Group, type Session,
  type ExamPeriod, type Exam, type ExamScore, type ScoreEvent
} from '../db/schema'

const APP_NAME       = 'ClassroomAssistant'
const SCHEMA_VERSION = 3
const TABLE          = 'user_class_backups'

/** 單一班級的資料包（加密前的明文結構） */
interface ClassBundle {
  appName:       typeof APP_NAME
  schemaVersion: number
  exportedAt:    string
  classId:       string
  className:     string
  data: {
    klass:       Class
    students:    Student[]
    groups:      Group[]
    examPeriods: ExamPeriod[]
    exams:       Exam[]
    examScores:  ExamScore[]
    scoreEvents: ScoreEvent[]
    sessions:    Session[]
  }
}

// ── 加密工具（AES-GCM + PBKDF2）─────────────────────────────

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt:       new TextEncoder().encode('classroom-assistant-cloud-salt-v1'),
      iterations: 100000,
      hash:       'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function encryptJson(obj: unknown, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase)
  const iv  = crypto.getRandomValues(new Uint8Array(12))
  const ct  = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(obj))
  )
  const combined = new Uint8Array(iv.length + ct.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ct), iv.length)
  return bytesToBase64(combined)
}

async function decryptJson<T>(cipherB64: string, passphrase: string): Promise<T> {
  const combined   = base64ToBytes(cipherB64)
  const iv         = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const key        = await deriveKey(passphrase)
  const plaintext  = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

// ── 共用：取得登入使用者 id ─────────────────────────────────

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('尚未登入雲端帳號')
  return data.user.id
}

// ── 列出本機 / 雲端班級（給選取 UI）─────────────────────────

export interface LocalClassInfo {
  classId:   string
  className: string
  students:  number
}

/** 本機目前有哪些班級（含學生數，給上傳選單） */
export async function listLocalClasses(): Promise<LocalClassInfo[]> {
  const classes = await db.classes.toArray()
  const out: LocalClassInfo[] = []
  for (const c of classes) {
    const n = await db.students.where('classId').equals(c.id).count()
    out.push({ classId: c.id, className: c.name, students: n })
  }
  return out.sort((a, b) => a.className.localeCompare(b.className))
}

export interface CloudClassInfo {
  classId:   string
  className: string
  updatedAt: string
  sizeBytes: number
}

/** 雲端目前有哪些班級備份（給下載選單，不解密） */
export async function listCloudClasses(): Promise<CloudClassInfo[]> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from(TABLE)
    .select('class_id, class_name, updated_at, size_bytes')
    .eq('user_id', userId)
  if (error) throw new Error('讀取雲端清單失敗：' + error.message)
  return (data ?? [])
    .map(r => ({
      classId:   r.class_id as string,
      className: (r.class_name as string) ?? '(未命名)',
      updatedAt: r.updated_at as string,
      sizeBytes: (r.size_bytes as number) ?? 0
    }))
    .sort((a, b) => a.className.localeCompare(b.className))
}

// ── 蒐集單班資料 ───────────────────────────────────────────

async function collectClassBundle(classId: string): Promise<ClassBundle> {
  const klass = await db.classes.get(classId)
  if (!klass) throw new Error('找不到班級 ' + classId)

  const exams   = await db.exams.where('classId').equals(classId).toArray()
  const examIds = exams.map(e => e.id)
  const examScores = examIds.length > 0
    ? await db.examScores.where('examId').anyOf(examIds).toArray()
    : []

  return {
    appName:       APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    exportedAt:    new Date().toISOString(),
    classId,
    className:     klass.name,
    data: {
      klass,
      students:    await db.students.where('classId').equals(classId).toArray(),
      groups:      await db.groups.where('classId').equals(classId).toArray(),
      examPeriods: await db.examPeriods.where('classId').equals(classId).toArray(),
      exams,
      examScores,
      scoreEvents: await db.scoreEvents.where('classId').equals(classId).toArray(),
      sessions:    await db.sessions.where('classId').equals(classId).toArray()
    }
  }
}

// ── 上傳（選定班級）────────────────────────────────────────

export interface UploadResult {
  uploaded: { className: string; sizeBytes: number }[]
  failed:   { className: string; error: string }[]
}

/**
 * uploadClasses
 * 把選定的班級各自加密 upsert 到雲端（每班一筆）。其他班雲端資料不受影響。
 */
export async function uploadClasses(
  classIds:   string[],
  passphrase: string
): Promise<UploadResult> {
  if (!passphrase) throw new Error('缺少加密通行碼')
  const userId = await requireUserId()

  const result: UploadResult = { uploaded: [], failed: [] }

  for (const classId of classIds) {
    try {
      const bundle = await collectClassBundle(classId)
      const cipher = await encryptJson(bundle, passphrase)
      const { error } = await supabase
        .from(TABLE)
        .upsert(
          {
            user_id:        userId,
            class_id:       classId,
            class_name:     bundle.className,
            data:           { cipher },
            schema_version: SCHEMA_VERSION,
            size_bytes:     cipher.length,
            updated_at:     new Date().toISOString()
          },
          { onConflict: 'user_id,class_id' }
        )
      if (error) throw new Error(error.message)
      result.uploaded.push({ className: bundle.className, sizeBytes: cipher.length })
    } catch (e: any) {
      result.failed.push({
        className: classId,
        error:     e?.message ?? String(e)
      })
    }
  }
  return result
}

// ── 下載（選定班級，合併不清空其他班）──────────────────────

export interface DownloadResult {
  restored: { className: string; counts: Record<string, number> }[]
  failed:   { className: string; error: string }[]
}

/**
 * downloadClasses
 * 從雲端取回選定班級 → 解密 → 只覆蓋本機那幾班，其他本機班級保留。
 *
 * 注意：呼叫端通常要 location.reload() 讓 useLiveQuery 重新拉資料。
 */
export async function downloadClasses(
  classIds:   string[],
  passphrase: string
): Promise<DownloadResult> {
  if (!passphrase) throw new Error('缺少解密通行碼')
  const userId = await requireUserId()

  const result: DownloadResult = { restored: [], failed: [] }

  for (const classId of classIds) {
    let className = classId
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('data, class_name, schema_version')
        .eq('user_id', userId)
        .eq('class_id', classId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('雲端查無此班備份')
      className = (data.class_name as string) ?? classId

      if ((data.schema_version as number) !== SCHEMA_VERSION) {
        throw new Error(
          `雲端備份 schema 版本（v${data.schema_version}）與目前（v${SCHEMA_VERSION}）不符`
        )
      }

      const cipher = (data.data as { cipher?: string })?.cipher
      if (!cipher) throw new Error('雲端備份資料毀損（缺密文）')

      let bundle: ClassBundle
      try {
        bundle = await decryptJson<ClassBundle>(cipher, passphrase)
      } catch {
        throw new Error('通行碼錯誤，無法解密')
      }
      if (bundle.appName !== APP_NAME) throw new Error('資料不是班級助手備份')

      const d = bundle.data
      const counts: Record<string, number> = {}

      await db.transaction(
        'rw',
        [
          db.classes, db.students, db.groups, db.sessions,
          db.examPeriods, db.exams, db.examScores, db.scoreEvents
        ],
        async () => {
          // 只清這一班的本機資料，其他班不動
          const oldExams = await db.exams.where('classId').equals(classId).toArray()
          const oldExamIds = oldExams.map(e => e.id)
          if (oldExamIds.length > 0) {
            await db.examScores.where('examId').anyOf(oldExamIds).delete()
          }
          await db.exams.where('classId').equals(classId).delete()
          await db.scoreEvents.where('classId').equals(classId).delete()
          await db.sessions.where('classId').equals(classId).delete()
          await db.groups.where('classId').equals(classId).delete()
          await db.examPeriods.where('classId').equals(classId).delete()
          await db.students.where('classId').equals(classId).delete()
          await db.classes.delete(classId)

          // 寫回雲端那一班
          await db.classes.put(d.klass)
          if (d.students?.length)    await db.students.bulkPut(d.students)
          if (d.groups?.length)      await db.groups.bulkPut(d.groups)
          if (d.examPeriods?.length) await db.examPeriods.bulkPut(d.examPeriods)
          if (d.exams?.length)       await db.exams.bulkPut(d.exams)
          if (d.examScores?.length)  await db.examScores.bulkPut(d.examScores)
          if (d.scoreEvents?.length) await db.scoreEvents.bulkPut(d.scoreEvents)
          if (d.sessions?.length)    await db.sessions.bulkPut(d.sessions)

          counts.students    = d.students?.length    ?? 0
          counts.groups      = d.groups?.length       ?? 0
          counts.examPeriods = d.examPeriods?.length  ?? 0
          counts.scoreEvents = d.scoreEvents?.length  ?? 0
          counts.examScores  = d.examScores?.length   ?? 0
        }
      )

      result.restored.push({ className, counts })
    } catch (e: any) {
      result.failed.push({ className, error: e?.message ?? String(e) })
    }
  }
  return result
}
