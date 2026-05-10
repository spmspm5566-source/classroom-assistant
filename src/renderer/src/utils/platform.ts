/**
 * platform.ts — 執行環境偵測
 *
 * 雙軌制（Electron 桌面版 / PWA 網頁版）共用同一份 React 程式碼。
 * 由此 hook 判斷目前在哪個環境，UI 自動隱藏／替換 Electron 專屬功能：
 *
 *  Electron 模式（有 window.electronAPI）：
 *   - 自訂無邊框視窗
 *   - 標題列：最小化／最大化／關閉、永遠最上層
 *   - 計時器／抽籤器以「獨立 popup 視窗」呈現
 *   - 懸浮模式（迷你小球）
 *
 *  Web/PWA 模式（瀏覽器）：
 *   - 一般瀏覽器視窗
 *   - 標題列：簡化、不顯示視窗操作
 *   - 計時器／抽籤器以「全螢幕覆蓋」呈現（在同一網頁中）
 *   - 懸浮模式：隱藏（瀏覽器無法把視窗縮成 280×72 浮在最上層）
 */

/** 是否在 Electron 環境執行 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI
}

/** 是否在純瀏覽器（web / PWA）環境執行 */
export function isWeb(): boolean {
  return !isElectron()
}

/** 是否為 PWA 安裝模式（從主畫面開啟，不在瀏覽器分頁中） */
export function isPWAStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari
  if ((window.navigator as any).standalone === true) return true
  // Android / 桌面 Chrome 等
  return window.matchMedia('(display-mode: standalone)').matches
}

/** 是否為觸控裝置（用於決定按鈕大小） */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0
}

/** 取得平台描述（顯示用） */
export function getPlatformLabel(): string {
  if (isElectron()) return '桌面版'
  if (isPWAStandalone()) return 'PWA'
  return '瀏覽器'
}
