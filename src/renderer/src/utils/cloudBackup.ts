/**
 * cloudBackup.ts — 雲端備份（加密上傳 / 解密下載）
 *
 * 解決：換電腦、換教室時資料不見。登入同一個雲端帳號即可把整包資料拉回來。
 *
 * 安全設計：
 *  - 整包 JSON 備份在離開本機前，先用「使用者通行碼」AES-GCM 加密
 *  - Supabase 雲端只儲存密文（ciphertext），看不到學生姓名等內容
 *  - 通行碼不上傳；忘記通行碼 = 雲端那份永遠解不開（這是刻意的）
 *
 * 與本機 JSON 備份（backup.ts）共用同一個 BackupFile 結構與還原邏輯，
 * 差別只在「儲存媒介」是 Supabase 而非本機檔案。
 */

import { supabase } from '../lib/supabaseClient'
import {
  db,
  type Class, type Student, type Group, type Session,
  type ExamPeriod, type Exam, type ExamScore, type ScoreEvent,
  type ConfigDoc
} from '../db/schema'

const APP_NAME       = 'ClassroomAssistant'
const SCHEMA_VERSION = 3
const APP_VERSION    = '2.0.0'
const TABLE          = 'user_backups'

interface CloudPayload {
  appName:       typeof APP_NAME
  schemaVersion: number
  appVersion:    string
  exportedAt:    string
  data: {
    classes:     Class[]
    students:    Student[]
    groups:      Group[]
    examPeriods: ExamPeriod[]
    exams:       Exam[]
    examScores:  ExamScore[]
    scoreEvents: ScoreEvent[]
    sessions:    Session[]
    config?:     ConfigDoc
  }
}

// ── 加密工具（AES-GCM + PBKDF2，與 auth.ts 同套路）─────────────

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

// ── 上傳 ─────────────────────────────────────────────────────

export interface CloudSyncResult {
  ok:        boolean
  updatedAt: string
  /** 加密後位元組大小（給 UI 顯示用） */
  sizeBytes: number
}

/**
 * uploadBackup
 * 蒐集完整資料 → 加密 → upsert 到 Supabase user_backups（每帳號一列）。
 *
 * @param passphrase 加解密通行碼（通常 = 雲端帳號密碼）
 */
export async function uploadBackup(passphrase: string): Promise<CloudSyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('目前沒有網路連線，請連上網路後再試')
  }
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) {
    throw new Error('尚未登入雲端帳號')
  }
  if (!passphrase) {
    throw new Error('缺少加密通行碼')
  }

  const payload: CloudPayload = {
    appName:       APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    appVersion:    APP_VERSION,
    exportedAt:    new Date().toISOString(),
    data: {
      classes:     await db.classes.toArray(),
      students:    await db.students.toArray(),
      groups:      await db.groups.toArray(),
      examPeriods: await db.examPeriods.toArray(),
      exams:       await db.exams.toArray(),
      examScores:  await db.examScores.toArray(),
      scoreEvents: await db.scoreEvents.toArray(),
      sessions:    await db.sessions.toArray(),
      config:      await db.config.get('main') ?? undefined
    }
  }

  const cipher    = await encryptJson(payload, passphrase)
  const sizeBytes = cipher.length
  const updatedAt = new Date().toISOString()

  const { error } = await supabase
    .from(TABLE)
    .upsert(
      {
        user_id:        userData.user.id,
        data:           { cipher },     // jsonb 欄位包一層
        schema_version: SCHEMA_VERSION,
        size_bytes:     sizeBytes,
        updated_at:     updatedAt
      },
      { onConflict: 'user_id' }
    )

  if (error) {
    throw new Error('上傳失敗：' + error.message)
  }
  return { ok: true, updatedAt, sizeBytes }
}

// ── 下載 ─────────────────────────────────────────────────────

export interface CloudRestoreResult {
  restored:  Record<string, number>
  updatedAt: string
}

/**
 * getCloudMeta
 * 只取雲端那份的更新時間 / 大小，不解密（給 UI 顯示「雲端有無備份」）。
 */
export async function getCloudMeta(): Promise<{ updatedAt: string; sizeBytes: number } | null> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('updated_at, size_bytes')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (error || !data) return null
  return { updatedAt: data.updated_at, sizeBytes: data.size_bytes ?? 0 }
}

/**
 * downloadBackup
 * 從 Supabase 取回密文 → 解密 → 覆蓋本機 IndexedDB（覆蓋模式）。
 *
 * 注意：呼叫端通常要 location.reload() 讓 useLiveQuery 重新拉資料。
 *
 * @param passphrase 與上傳時相同的通行碼；錯誤會丟「通行碼錯誤」
 */
export async function downloadBackup(passphrase: string): Promise<CloudRestoreResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('目前沒有網路連線，請連上網路後再試')
  }
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) {
    throw new Error('尚未登入雲端帳號')
  }
  if (!passphrase) {
    throw new Error('缺少解密通行碼')
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('data, updated_at')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (error) {
    throw new Error('讀取雲端失敗：' + error.message)
  }
  if (!data) {
    throw new Error('雲端尚無備份；請先在有資料的電腦上傳一次')
  }

  const cipher = (data.data as { cipher?: string })?.cipher
  if (!cipher) {
    throw new Error('雲端備份資料毀損（缺少密文）')
  }

  let payload: CloudPayload
  try {
    payload = await decryptJson<CloudPayload>(cipher, passphrase)
  } catch {
    throw new Error('通行碼錯誤，無法解密雲端備份')
  }

  if (payload.appName !== APP_NAME) {
    throw new Error('雲端資料不是「班級助手」備份')
  }
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `雲端備份的 schema 版本（v${payload.schemaVersion}）與目前版本（v${SCHEMA_VERSION}）不符`
    )
  }

  const d = payload.data
  const restored: Record<string, number> = {}

  await db.transaction(
    'rw',
    [
      db.classes, db.students, db.groups, db.sessions,
      db.examPeriods, db.exams, db.examScores, db.scoreEvents,
      db.config
    ],
    async () => {
      await db.classes.clear()
      if (d.classes?.length)     await db.classes.bulkAdd(d.classes)
      restored.classes = d.classes?.length ?? 0

      await db.students.clear()
      if (d.students?.length)    await db.students.bulkAdd(d.students)
      restored.students = d.students?.length ?? 0

      await db.groups.clear()
      if (d.groups?.length)      await db.groups.bulkAdd(d.groups)
      restored.groups = d.groups?.length ?? 0

      await db.examPeriods.clear()
      if (d.examPeriods?.length) await db.examPeriods.bulkAdd(d.examPeriods)
      restored.examPeriods = d.examPeriods?.length ?? 0

      await db.exams.clear()
      if (d.exams?.length)       await db.exams.bulkAdd(d.exams)
      restored.exams = d.exams?.length ?? 0

      await db.examScores.clear()
      if (d.examScores?.length)  await db.examScores.bulkAdd(d.examScores)
      restored.examScores = d.examScores?.length ?? 0

      await db.scoreEvents.clear()
      if (d.scoreEvents?.length) await db.scoreEvents.bulkAdd(d.scoreEvents)
      restored.scoreEvents = d.scoreEvents?.length ?? 0

      await db.sessions.clear()
      if (d.sessions?.length)    await db.sessions.bulkAdd(d.sessions)
      restored.sessions = d.sessions?.length ?? 0

      if (d.config) {
        await db.config.put({ ...d.config, key: 'main' })
        restored.config = 1
      }
    }
  )

  return { restored, updatedAt: payload.exportedAt }
}
