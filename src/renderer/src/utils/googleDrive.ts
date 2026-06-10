/**
 * googleDrive.ts — Google Drive REST API 封裝
 *
 * 備份策略：
 *  - 在 Google Drive 根目錄建立「班級助手備份」資料夾（若不存在則自動建立）
 *  - 每次備份以日期命名（班級助手備份_20260609.json）
 *  - 同名檔案則更新（PATCH），不同日期則新建（POST）
 *  - 最多保留 10 個備份，超過自動刪除最舊的
 *
 * Access token 由主程序管理，渲染層透過 IPC 取得。
 */

const DRIVE_API   = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API  = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_NAME = '班級助手備份'
const MAX_BACKUPS = 10

export interface DriveFile {
  id:           string
  name:         string
  modifiedTime: string
  size?:        string
}

// ── 內部工具 ─────────────────────────────────────────────────

async function driveGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  return res.json() as Promise<T>
}

/** 取得（或自動建立）備份資料夾的 Drive ID */
async function getFolderIdOrCreate(token: string): Promise<string> {
  const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const data = await driveGet<{ files: DriveFile[] }>(
    `/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    token
  )
  if (data.files?.length) return data.files[0].id

  const res = await fetch(`${DRIVE_API}/files`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  })
  const folder = await res.json() as { id: string }
  return folder.id
}

// ── 公開 API ─────────────────────────────────────────────────

/**
 * uploadBackup
 * 上傳備份 JSON 到 Google Drive。同名檔案覆蓋，超過 MAX_BACKUPS 刪舊。
 */
export async function uploadBackup(
  token:    string,
  jsonStr:  string,
  fileName: string
): Promise<{ ok: boolean; fileId?: string; error?: string }> {
  try {
    const folderId = await getFolderIdOrCreate(token)

    // 查詢同名現有檔案（用於 PATCH）
    const q = `name='${fileName}' and '${folderId}' in parents and trashed=false`
    const existing = await driveGet<{ files: DriveFile[] }>(
      `/files?q=${encodeURIComponent(q)}&fields=files(id)`,
      token
    )
    const existingId = existing.files?.[0]?.id

    const metadata = existingId
      ? { name: fileName }
      : { name: fileName, parents: [folderId] }

    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    form.append('file',     new Blob([jsonStr], { type: 'application/json' }))

    const url    = existingId
      ? `${UPLOAD_API}/files/${existingId}?uploadType=multipart`
      : `${UPLOAD_API}/files?uploadType=multipart`
    const method = existingId ? 'PATCH' : 'POST'

    const res  = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      body:    form
    })
    const data = await res.json() as { id?: string; error?: { message: string } }

    if (!data.id) return { ok: false, error: data.error?.message ?? '上傳失敗' }

    // 清理舊備份（超過上限時刪最舊）
    await pruneOldBackups(token, folderId)

    return { ok: true, fileId: data.id }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** 列出備份資料夾內所有備份（最新在前） */
export async function listBackups(token: string): Promise<DriveFile[]> {
  try {
    const folderId = await getFolderIdOrCreate(token)
    const q = `'${folderId}' in parents and trashed=false and mimeType='application/json'`
    const data = await driveGet<{ files: DriveFile[] }>(
      `/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc`,
      token
    )
    return data.files ?? []
  } catch {
    return []
  }
}

/** 下載指定備份的 JSON 內容 */
export async function downloadBackup(token: string, fileId: string): Promise<string | null> {
  try {
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    return await res.text()
  } catch {
    return null
  }
}

/** 刪除指定備份 */
export async function deleteBackup(token: string, fileId: string): Promise<boolean> {
  try {
    await fetch(`${DRIVE_API}/files/${fileId}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    return true
  } catch {
    return false
  }
}

// ── 內部：清理舊備份 ─────────────────────────────────────────

async function pruneOldBackups(token: string, folderId: string): Promise<void> {
  const q = `'${folderId}' in parents and trashed=false and mimeType='application/json'`
  const data = await driveGet<{ files: DriveFile[] }>(
    `/files?q=${encodeURIComponent(q)}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`,
    token
  )
  const files = data.files ?? []
  if (files.length <= MAX_BACKUPS) return

  for (const f of files.slice(MAX_BACKUPS)) {
    await fetch(`${DRIVE_API}/files/${f.id}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
  }
}
