/**
 * preload/index.ts — 安全 IPC 橋接腳本
 *
 * 在「隔離的渲染程序」與「主程序」之間建立橋樑。
 * 使用 contextBridge 將有限的 API 暴露給 window.electronAPI，
 * 渲染層的 React 程式碼只能透過這個白名單 API 與主程序溝通。
 *
 * 安全原則：
 *  - 不暴露任何 Node.js / Electron 模組本身
 *  - 只暴露明確定義的函式，避免任意 IPC channel 被呼叫
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { WindowMode } from '../main/windowManager'

// ── 型別定義（同步至渲染層 window.d.ts）─────────────────────

export type ModeChangedCallback = (mode: WindowMode) => void

// ── 暴露給渲染層的 API ────────────────────────────────────────

contextBridge.exposeInMainWorld('electronAPI', {
  // ─ 視窗基本控制 ─
  minimize: (): Promise<void> =>
    ipcRenderer.invoke('window:minimize'),

  maximize: (): Promise<void> =>
    ipcRenderer.invoke('window:maximize'),

  close: (): Promise<void> =>
    ipcRenderer.invoke('window:close'),

  // ─ 懸浮模式切換（normal ↔ mini）─
  toggleMiniMode: (): Promise<void> =>
    ipcRenderer.invoke('window:toggleMiniMode'),

  // ─ 切換到指定模式（normal/timer/drawer/mini）─
  setMode: (mode: WindowMode): Promise<void> =>
    ipcRenderer.invoke('window:setMode', mode),

  // ─ 查詢目前模式（初始化用）─
  getMode: (): Promise<WindowMode> =>
    ipcRenderer.invoke('window:getMode'),

  // ─ 訂閱模式變更事件 ─
  onModeChanged: (callback: ModeChangedCallback): (() => void) => {
    // 包裝 ipcRenderer 事件，去掉 Electron 內部的 event 參數
    const handler = (_event: Electron.IpcRendererEvent, mode: WindowMode): void => {
      callback(mode)
    }
    ipcRenderer.on('window:modeChanged', handler)

    // 傳回解除訂閱函式，讓 React useEffect 的 cleanup 可以呼叫
    return () => {
      ipcRenderer.removeListener('window:modeChanged', handler)
    }
  }
})
