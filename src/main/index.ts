/**
 * main/index.ts — Electron 主程序進入點
 *
 * 職責：
 *  - 初始化 Electron app 生命週期
 *  - 呼叫 windowManager 建立視窗並載入頁面
 *  - 處理 macOS Dock 點擊行為（可選）
 */

import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { createMainWindow, registerIpcHandlers } from './windowManager'

// ── 開發環境輔助 ──────────────────────────────────────────────

// ── 視窗載入輔助 ──────────────────────────────────────────────

/**
 * loadWindow
 * 開發時連接 Vite dev server（熱更新），
 * 生產時載入打包後的 HTML 靜態檔。
 *
 * electron-vite 在 dev 模式注入的環境變數為 ELECTRON_RENDERER_URL，
 * 指向渲染層 Vite dev server（預設 http://localhost:5173）。
 */
function loadWindow(win: BrowserWindow): void {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']

  if (devServerUrl) {
    // 開發模式：載入本地 dev server（支援 HMR 熱更新）
    win.loadURL(devServerUrl)
    // 需要除錯時可手動按 Ctrl+Shift+I 開啟 DevTools
  } else {
    // 生產模式：載入打包後的 index.html
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── 應用程式主要初始化流程 ───────────────────────────────────

app.whenReady().then(() => {
  // 1. 先註冊所有 IPC 處理器（避免渲染層先發訊號）
  registerIpcHandlers()

  // 2. 建立主視窗
  const win = createMainWindow()

  // 3. 載入頁面
  loadWindow(win)
})

// ── 跨平台視窗管理 ────────────────────────────────────────────

// 所有視窗關閉時結束程式（Windows / Linux 慣例）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// macOS：Dock 圖示被點擊且無視窗時重新建立視窗
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const win = createMainWindow()
    loadWindow(win)
  }
})
