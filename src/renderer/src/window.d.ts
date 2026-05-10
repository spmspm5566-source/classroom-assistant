/**
 * window.d.ts — 全域型別擴充
 *
 * 讓 TypeScript 認識 preload 腳本透過 contextBridge 注入的
 * window.electronAPI，提供完整的型別提示與安全檢查。
 */

import type { WindowMode } from './hooks/useWindowMode'

export type ModeChangedCallback = (mode: WindowMode) => void

declare global {
  interface Window {
    /**
     * Electron preload 注入的 IPC 介面。
     * 在 Web/PWA 模式下不存在（為 undefined）— 用 utils/platform.isElectron() 偵測。
     */
    electronAPI?: {
      // ─ 視窗控制 ─
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close:    () => Promise<void>

      // ─ 懸浮模式 ─
      toggleMiniMode: () => Promise<void>
      setMode:        (mode: WindowMode) => Promise<void>
      getMode:        () => Promise<WindowMode>

      // ─ 事件訂閱，傳回解除訂閱函式 ─
      onModeChanged: (callback: ModeChangedCallback) => () => void
    }
  }
}
