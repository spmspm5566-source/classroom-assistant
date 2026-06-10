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
    const handler = (_event: Electron.IpcRendererEvent, mode: WindowMode): void => {
      callback(mode)
    }
    ipcRenderer.on('window:modeChanged', handler)
    return () => {
      ipcRenderer.removeListener('window:modeChanged', handler)
    }
  },

  // ─ Google Drive ─
  googleGetCredentials: (): Promise<{ clientId: string; hasSecret: boolean } | null> =>
    ipcRenderer.invoke('google:getCredentials'),

  googleSaveCredentials: (clientId: string, clientSecret: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('google:saveCredentials', clientId, clientSecret),

  googleIsConnected: (): Promise<boolean> =>
    ipcRenderer.invoke('google:isConnected'),

  googleStartAuth: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('google:startAuth'),

  googleGetToken: (): Promise<string | null> =>
    ipcRenderer.invoke('google:getToken'),

  googleDisconnect: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('google:disconnect'),

  googleDriveUpload: (token: string, jsonStr: string, fileName: string): Promise<{ ok: boolean; fileId?: string; error?: string }> =>
    ipcRenderer.invoke('google:driveUpload', token, jsonStr, fileName),

  googleDriveList: (token: string): Promise<{ id: string; name: string; modifiedTime: string; size?: string }[]> =>
    ipcRenderer.invoke('google:driveList', token),

  googleDriveDownload: (token: string, fileId: string): Promise<{ ok: boolean; content?: string; error?: string }> =>
    ipcRenderer.invoke('google:driveDownload', token, fileId),

  googleDriveDelete: (token: string, fileId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('google:driveDelete', token, fileId),

  // ─ Gmail 寄送忘記密碼信 ─
  gmailSendPasswordRecovery: (token: string, toEmail: string, password: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('gmail:sendPasswordRecovery', token, toEmail, password),

  // ─ 備份：儲存 JSON 到本機（開啟系統儲存對話框）─
  backupSave: (jsonStr: string, defaultName: string): Promise<{ ok: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('backup:save', jsonStr, defaultName),

  // ─ 還原：從本機開啟 JSON（開啟系統檔案對話框）─
  backupOpen: (): Promise<{ ok: boolean; content?: string; error?: string }> =>
    ipcRenderer.invoke('backup:open')
})
