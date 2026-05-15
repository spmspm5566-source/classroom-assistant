/**
 * main/index.ts — Electron 主程序進入點
 *
 * 職責：
 *  - 在 Electron 初始化儲存前，把 userData 路徑改到「不會被還原的位置」
 *    （學校電腦 C: 每次開機還原問題）
 *  - 初始化 Electron app 生命週期
 *  - 呼叫 windowManager 建立視窗並載入頁面
 */

import { app, BrowserWindow } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { createMainWindow, registerIpcHandlers } from './windowManager'

// ── 持久化資料位置（解決學校 C: 槽還原問題） ────────────────
//
// 重點：必須在 app.whenReady() 之前呼叫 app.setPath('userData', ...)，
//      因為一旦 Electron 初始化，userData 位置就鎖定了。
//
// 策略（依序嘗試，第一個能寫的就用）：
//   1. D:\ClassroomAssistant_Data  ← 學校電腦 C: 還原但 D: 保留，最常見配置
//   2. <可執行檔同目錄>\data         ← 隨身碟攜帶（portable .exe + USB）
//   3. （fallback）Electron 預設位置 = %APPDATA%（C: 槽）
//
// 開發模式（npm run dev）不改路徑，避免污染 D: 槽。

function isWritableDir(path: string): boolean {
  try {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true })
    }
    // 真正寫入測試（光碟機 D:\ 存在但不可寫）
    const testFile = join(path, '.write-test')
    writeFileSync(testFile, '')
    unlinkSync(testFile)
    return true
  } catch {
    return false
  }
}

function setupPersistentUserData(): void {
  if (!app.isPackaged) {
    // 開發模式不動
    console.log('[userData] dev 模式，使用預設位置')
    return
  }

  const candidates: { path: string; label: string }[] = []

  // 1. D: 槽（學校電腦最常見的還原排除區）
  if (process.platform === 'win32') {
    candidates.push({ path: 'D:\\ClassroomAssistant_Data', label: 'D 槽資料區' })
  }

  // 2. 可執行檔同目錄旁的 data 資料夾
  //    portable .exe 的特殊環境變數，指向使用者雙擊 .exe 的位置（不是 temp 解壓位置）
  const portableExeDir = process.env.PORTABLE_EXECUTABLE_DIR
  if (portableExeDir) {
    candidates.push({ path: join(portableExeDir, 'data'), label: 'portable .exe 同目錄' })
  } else {
    // 非 portable：執行檔目錄旁
    const exeDir = dirname(process.execPath)
    candidates.push({ path: join(exeDir, 'data'), label: '可執行檔同目錄' })
  }

  for (const { path, label } of candidates) {
    if (isWritableDir(path)) {
      app.setPath('userData', path)
      console.log(`[userData] 使用持久化位置：${path}（${label}）`)
      return
    }
    console.log(`[userData] ${path} 不可寫，嘗試下一個`)
  }

  // 全部失敗 → 用 Electron 預設值（%APPDATA%）
  console.warn('[userData] 找不到持久化位置，將使用 C: 槽預設位置；資料可能在開機時被還原！')
}

// ── 視窗載入輔助 ──────────────────────────────────────────────

/**
 * loadWindow
 * 開發時連接 Vite dev server（熱更新），生產時載入打包後的 HTML。
 */
function loadWindow(win: BrowserWindow): void {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']

  if (devServerUrl) {
    win.loadURL(devServerUrl)
    // 需要除錯時可手動按 Ctrl+Shift+I 開啟 DevTools
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── 應用程式主要初始化流程 ───────────────────────────────────

// ⚠ 必須在 app.whenReady() 之前執行
setupPersistentUserData()

app.whenReady().then(() => {
  registerIpcHandlers()
  const win = createMainWindow()
  loadWindow(win)
})

// ── 跨平台視窗管理 ────────────────────────────────────────────

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const win = createMainWindow()
    loadWindow(win)
  }
})
