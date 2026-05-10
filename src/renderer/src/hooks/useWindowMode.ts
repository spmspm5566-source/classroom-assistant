/**
 * useWindowMode.ts — 視窗模式自訂 Hook（雙軌制）
 *
 * Electron 模式：透過 IPC 呼叫主程序，真的調整作業系統視窗
 * Web 模式：純 React state，計時器/抽籤器以全螢幕覆蓋呈現；
 *           懸浮模式被禁用（瀏覽器無法做到視窗縮小+永遠最上層）
 *
 * 兩種模式對外接口完全相同，呼叫端不必判斷環境。
 */

import { useState, useEffect, useCallback } from 'react'
import { isElectron } from '../utils/platform'

// ── 視窗模式型別 ─────────────────────────────────────────────

export type WindowMode = 'normal' | 'timer' | 'drawer' | 'mini'

// ── Hook 回傳型別 ─────────────────────────────────────────────

export interface UseWindowModeReturn {
  mode:           WindowMode
  isMini:         boolean
  isTimer:        boolean
  isDrawer:       boolean
  isFloating:     boolean   // timer / drawer / mini
  isNormal:       boolean
  /** 是否能切到 mini 模式（web 環境傳 false） */
  canFloat:       boolean

  // 模式切換
  setMode:        (mode: WindowMode) => Promise<void>
  toggleMiniMode: () => Promise<void>
  goNormal:       () => Promise<void>

  // 標題列控制（web 環境為 no-op）
  minimize:       () => Promise<void>
  maximize:       () => Promise<void>
  close:          () => Promise<void>
}

// ── Hook 實作 ─────────────────────────────────────────────────

export function useWindowMode(): UseWindowModeReturn {
  const electron = isElectron()
  const [mode, setModeState] = useState<WindowMode>('normal')

  useEffect(() => {
    if (!electron) return

    // Electron：查詢目前模式 + 訂閱主程序廣播
    window.electronAPI!.getMode().then(setModeState)
    const unsubscribe = window.electronAPI!.onModeChanged(setModeState)
    return unsubscribe
  }, [electron])

  // ── setMode：依環境分流 ──
  const setMode = useCallback(async (m: WindowMode): Promise<void> => {
    // Web 環境忽略 mini 請求（瀏覽器無懸浮能力）
    if (!electron && m === 'mini') {
      console.warn('[useWindowMode] mini 模式僅 Electron 桌面版支援，已忽略')
      return
    }
    if (electron) {
      await window.electronAPI!.setMode(m)
    } else {
      // Web：純 React state 切換，由 App.tsx 渲染對應的全螢幕覆蓋
      setModeState(m)
    }
  }, [electron])

  const toggleMiniMode = useCallback(async (): Promise<void> => {
    if (electron) {
      await window.electronAPI!.toggleMiniMode()
    } else {
      console.warn('[useWindowMode] mini 模式僅 Electron 桌面版支援')
    }
  }, [electron])

  const goNormal = useCallback(async (): Promise<void> => {
    if (electron) {
      await window.electronAPI!.setMode('normal')
    } else {
      setModeState('normal')
    }
  }, [electron])

  // 視窗操作（web 環境直接 no-op）
  const minimize = useCallback(async (): Promise<void> => {
    if (electron) await window.electronAPI!.minimize()
  }, [electron])
  const maximize = useCallback(async (): Promise<void> => {
    if (electron) await window.electronAPI!.maximize()
  }, [electron])
  const close = useCallback(async (): Promise<void> => {
    if (electron) {
      await window.electronAPI!.close()
    } else {
      // Web：嘗試關閉分頁，但瀏覽器多半會擋下
      window.close()
    }
  }, [electron])

  return {
    mode,
    isMini:     mode === 'mini',
    isTimer:    mode === 'timer',
    isDrawer:   mode === 'drawer',
    isNormal:   mode === 'normal',
    isFloating: mode !== 'normal',
    canFloat:   electron,
    setMode,
    toggleMiniMode,
    goNormal,
    minimize,
    maximize,
    close
  }
}
