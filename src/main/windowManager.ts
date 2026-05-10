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

import { BrowserWindow, ipcMain, shell, screen } from 'electron'
import { join } from 'path'

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
}
