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

      // ─ Google Drive ─
      googleGetCredentials: () => Promise<{ clientId: string; hasSecret: boolean } | null>
      googleSaveCredentials: (clientId: string, clientSecret: string) => Promise<{ ok: boolean }>
      googleIsConnected: () => Promise<boolean>
      googleStartAuth: () => Promise<{ ok: boolean; error?: string }>
      googleGetToken: () => Promise<string | null>
      googleDisconnect: () => Promise<{ ok: boolean }>
      googleDriveUpload: (token: string, jsonStr: string, fileName: string) => Promise<{ ok: boolean; fileId?: string; error?: string }>
      googleDriveList: (token: string) => Promise<{ id: string; name: string; modifiedTime: string; size?: string }[]>
      googleDriveDownload: (token: string, fileId: string) => Promise<{ ok: boolean; content?: string; error?: string }>
      googleDriveDelete: (token: string, fileId: string) => Promise<{ ok: boolean }>

      // ─ Gmail 寄信 ─
      gmailSendPasswordRecovery: (token: string, toEmail: string, password: string) => Promise<{ ok: boolean; error?: string }>

      // ─ 備份 / 還原 ─
      backupSave: (jsonStr: string, defaultName: string) => Promise<{ ok: boolean; filePath?: string; error?: string }>
      backupOpen: () => Promise<{ ok: boolean; content?: string; error?: string }>
    }
  }
}
