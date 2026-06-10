/**
 * windowManager.ts — 視窗狀態管理模組
 *
 * 職責：
 *  - 持有唯一的 BrowserWindow 實例
 *  - 管理多種視窗模式之間的切換（normal / timer / drawer / mini）
 *  - 暴露視窗控制方法（最小化、最大化、關閉）
 *  - 透過 IPC 事件通知渲染層當前模式
 *
 * 視窗模式設計：
 *  - normal : 1200×750  完整主控台
 *  - timer  : 360×220   計時器浮動視窗（階段 3）
 *  - drawer : 720×600   抽籤器浮動視窗（階段 4）
 *  - mini   : 280×72    細長條浮動小元件
 *
 * 為何只用單一 BrowserWindow？
 *  - 簡化狀態同步（不需 IPC 多視窗廣播）
 *  - Zustand store 在單一 renderer 內就完整可用
 *  - 切換時只需 setBounds + 通知 React 切換頁面
 */

import { BrowserWindow, ipcMain, shell, screen, dialog } from 'electron'
import { join } from 'path'
import { writeFile, readFile } from 'fs/promises'
import {
  getCredentials, saveCredentials,
  getValidAccessToken, startOAuthFlow,
  isConnected, clearTokens
} from './googleAuth'

// ── 視窗模式定義 ──────────────────────────────────────────────

export type WindowMode = 'normal' | 'timer' | 'drawer' | 'mini'

/** 各模式對應的尺寸 */
const MODE_SIZES: Record<WindowMode, { width: number, height: number }> = {
  normal: { width: 1200, height: 750 },
  timer:  { width: 360,  height: 220 },
  drawer: { width: 720,  height: 600 },
  mini:   { width: 280,  height: 72  }
}

/** 浮動模式（alwaysOnTop + 不可調整大小） */
const FLOATING_MODES: WindowMode[] = ['timer', 'drawer', 'mini']

// ── 模組私有狀態 ──────────────────────────────────────────────

let mainWindow:  BrowserWindow | null = null
let currentMode: WindowMode = 'normal'

// ── 視窗建立 ─────────────────────────────────────────────────

/**
 * createMainWindow
 * 建立並傳回主視窗。
 * 使用 frame:false 移除原生標題列，改由 React 元件自訂。
 */
export function createMainWindow(): BrowserWindow {
  const { width, height } = MODE_SIZES.normal

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth:  MODE_SIZES.mini.width,
    minHeight: MODE_SIZES.mini.height,
    frame: false,
    transparent: false,
    resizable: true,
    center: true,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    // 確保渲染層取得鍵盤焦點（避免鎖屏輸入框需截圖才能輸入）
    mainWindow?.focus()
    mainWindow?.webContents.focus()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

// ── 視窗模式切換 ──────────────────────────────────────────────

/**
 * setWindowMode
 * 統一的模式切換函式，依目標模式設定大小、位置、最上層屬性。
 *
 * 浮動模式（timer/drawer/mini）：
 *   - 定位至工作區右上角，避免遮擋 Windows 工作列
 *   - 設為 alwaysOnTop ('pop-up-menu' 層級)
 *   - 不可調整大小
 *
 * normal 模式：
 *   - 取消置頂
 *   - 還原最小尺寸限制
 *   - 視窗置中
 */
export function setWindowMode(mode: WindowMode): void {
  if (!mainWindow) return
  if (mode === currentMode) return

  currentMode = mode

  // 先通知渲染層，讓 React 切換 UI（避免縮小後還顯示主控台）
  mainWindow.webContents.send('window:modeChanged', mode)

  const size      = MODE_SIZES[mode]
  const isFloat   = FLOATING_MODES.includes(mode)

  // ── 浮動模式 ──
  if (isFloat) {
    mainWindow.setResizable(false)
    mainWindow.setMinimumSize(0, 0)
    mainWindow.setAlwaysOnTop(true, 'pop-up-menu')

    // 定位至工作區右上角（與工作列保留 20px 邊距）
    const { workArea } = screen.getPrimaryDisplay()
    mainWindow.setBounds({
      x:      workArea.x + workArea.width - size.width - 20,
      y:      workArea.y + 20,
      width:  size.width,
      height: size.height
    })
    return
  }

  // ── normal 模式 ──
  mainWindow.setAlwaysOnTop(false)
  mainWindow.setResizable(true)
  mainWindow.setMinimumSize(MODE_SIZES.mini.width, MODE_SIZES.mini.height)
  mainWindow.setSize(size.width, size.height)
  mainWindow.center()
}

/**
 * toggleMiniMode
 * 在 normal 與 mini 之間切換（保留舊 API 以相容主控台懸浮模式按鈕）。
 */
export function toggleMiniMode(): void {
  setWindowMode(currentMode === 'mini' ? 'normal' : 'mini')
}

// ── IPC 處理器註冊 ────────────────────────────────────────────

export function registerIpcHandlers(): void {

  // 視窗控制
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())

  ipcMain.handle('window:maximize', () => {
    if (!mainWindow || FLOATING_MODES.includes(currentMode)) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else                          mainWindow.maximize()
  })

  ipcMain.handle('window:close', () => mainWindow?.close())

  // 模式切換
  ipcMain.handle('window:toggleMiniMode', () => toggleMiniMode())

  ipcMain.handle('window:setMode', (_event, mode: WindowMode) => {
    setWindowMode(mode)
  })

  ipcMain.handle('window:getMode', () => currentMode)

  // ── Google Drive ──
  ipcMain.handle('google:getCredentials',  async () => {
    const c = await getCredentials()
    // 只傳 clientId，不把 secret 傳給渲染層
    return c ? { clientId: c.clientId, hasSecret: true } : null
  })

  ipcMain.handle('google:saveCredentials', async (_e, clientId: string, clientSecret: string) => {
    await saveCredentials({ clientId, clientSecret })
    return { ok: true }
  })

  ipcMain.handle('google:isConnected',  () => isConnected())
  ipcMain.handle('google:startAuth',    () => startOAuthFlow())
  ipcMain.handle('google:getToken',     () => getValidAccessToken())
  ipcMain.handle('google:disconnect',   async () => { await clearTokens(); return { ok: true } })

  // ── Google Drive 上傳（在主程序執行，繞過渲染層 CSP）──
  ipcMain.handle('google:driveUpload', async (_e, token: string, jsonStr: string, fileName: string) => {
    try {
      const DRIVE_API  = 'https://www.googleapis.com/drive/v3'
      const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
      const FOLDER     = '班級助手備份'

      // 1. 找或建資料夾
      const searchRes = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const searchData = await searchRes.json() as any
      let folderId: string = searchData.files?.[0]?.id
      if (!folderId) {
        const cr = await fetch(`${DRIVE_API}/files`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' })
        })
        folderId = (await cr.json() as any).id
      }

      // 2. 查同名檔
      const exRes  = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`)}&fields=files(id)`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const existingId: string | undefined = (await exRes.json() as any).files?.[0]?.id

      // 3. multipart 上傳（用 Buffer 組裝，主程序可直接用 Node）
      const boundary = '-------314159265358979323846'
      const meta     = JSON.stringify(existingId ? { name: fileName } : { name: fileName, parents: [folderId] })
      const body     = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        meta,
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        jsonStr,
        `--${boundary}--`
      ].join('\r\n')

      const url    = existingId
        ? `${UPLOAD_API}/files/${existingId}?uploadType=multipart`
        : `${UPLOAD_API}/files?uploadType=multipart`
      const upRes  = await fetch(url, {
        method:  existingId ? 'PATCH' : 'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      })
      const data = await upRes.json() as any
      if (data.id) return { ok: true, fileId: data.id }
      return { ok: false, error: data.error?.message ?? '上傳失敗' }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Google Drive 列出備份 ──
  ipcMain.handle('google:driveList', async (_e, token: string) => {
    try {
      const DRIVE_API = 'https://www.googleapis.com/drive/v3'
      const FOLDER    = '班級助手備份'
      const srRes  = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const folderId: string = (await srRes.json() as any).files?.[0]?.id
      if (!folderId) return []
      const res  = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType='application/json'`)}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return (await res.json() as any).files ?? []
    } catch { return [] }
  })

  // ── Google Drive 下載 ──
  ipcMain.handle('google:driveDownload', async (_e, token: string, fileId: string) => {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return { ok: true, content: await res.text() }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Google Drive 刪除 ──
  ipcMain.handle('google:driveDelete', async (_e, token: string, fileId: string) => {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Gmail 寄送密碼回覆信 ──
  ipcMain.handle('gmail:sendPasswordRecovery', async (_e, token: string, toEmail: string, password: string) => {
    try {
      // 組 RFC 2822 格式郵件
      const subject = '=?UTF-8?B?' + Buffer.from('【班級助手】您的密碼').toString('base64') + '?='
      const body    = [
        `您好，`,
        ``,
        `您申請找回班級助手的密碼。`,
        ``,
        `您的密碼是：${password}`,
        ``,
        `（此信由班級助手自動寄出，請勿回覆）`
      ].join('\r\n')
      const mime = [
        `To: ${toEmail}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: base64`,
        ``,
        Buffer.from(body).toString('base64')
      ].join('\r\n')
      const raw = Buffer.from(mime).toString('base64url')
      const res  = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw })
      })
      if (res.ok) return { ok: true }
      const err = await res.json() as any
      return { ok: false, error: err?.error?.message ?? '寄信失敗' }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ── 備份：儲存 JSON 到本機 ──
  ipcMain.handle('backup:save', async (_event, jsonStr: string, defaultName: string) => {
    if (!mainWindow) return { ok: false, error: '視窗不存在' }
    const result = await dialog.showSaveDialog(mainWindow, {
      title:       '儲存備份',
      defaultPath: defaultName,
      filters:     [{ name: 'JSON 備份', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false }
    try {
      await writeFile(result.filePath, jsonStr, 'utf-8')
      return { ok: true, filePath: result.filePath }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ── 還原：從本機開啟 JSON ──
  ipcMain.handle('backup:open', async () => {
    if (!mainWindow) return { ok: false, error: '視窗不存在' }
    const result = await dialog.showOpenDialog(mainWindow, {
      title:      '開啟備份',
      filters:    [{ name: 'JSON 備份', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false }
    try {
      const content = await readFile(result.filePaths[0], 'utf-8')
      return { ok: true, content }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })
}
