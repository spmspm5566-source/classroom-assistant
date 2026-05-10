/**
 * useAuthStore.ts — 登入/鎖屏狀態（瞬時，重啟必重新解鎖）
 *
 * 不持久化。每次啟動 App 預設 isAuthed=false，
 * 鎖屏元件依 ConfigDoc.prefs.passwordHash 判斷是「首次設定」還是「驗證解鎖」。
 *
 * 防硬猜：連續錯 5 次 → 鎖死 60 秒，期間 input 禁用、顯示倒數。
 */

import { create } from 'zustand'
import { verifyPassword, hashPassword } from '../utils/auth'

const MAX_ATTEMPTS_BEFORE_LOCKOUT = 5
const LOCKOUT_SECONDS = 60

interface AuthState {
  isAuthed:       boolean    // 已通過密碼驗證
  failedAttempts: number     // 已連續錯幾次
  lockedUntil:    number     // 暫時封鎖到此 timestamp（>now 表示鎖死中）

  // ── Actions ──
  /** 用密碼解鎖。回傳是否成功。 */
  unlock: (password: string, storedHash: string) => Promise<boolean>
  /** 不需密碼直接設為已驗證（首次設定密碼後呼叫） */
  markAuthed: () => void
  /** 立即鎖回鎖屏（手動鎖、自動鎖、修改密碼後皆呼叫） */
  lock: () => void
  /** 重設防猜計數（密碼成功 / 重設密碼後使用） */
  resetAttempts: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthed:       false,
  failedAttempts: 0,
  lockedUntil:    0,

  unlock: async (password, storedHash) => {
    // 暫時封鎖期間禁止嘗試
    if (Date.now() < get().lockedUntil) return false

    const ok = await verifyPassword(password, storedHash)
    if (ok) {
      set({ isAuthed: true, failedAttempts: 0, lockedUntil: 0 })
      return true
    }

    const failed = get().failedAttempts + 1
    if (failed >= MAX_ATTEMPTS_BEFORE_LOCKOUT) {
      set({
        failedAttempts: failed,
        lockedUntil:    Date.now() + LOCKOUT_SECONDS * 1000
      })
    } else {
      set({ failedAttempts: failed })
    }
    return false
  },

  markAuthed: () => set({ isAuthed: true, failedAttempts: 0, lockedUntil: 0 }),

  lock: () => set({ isAuthed: false }),

  resetAttempts: () => set({ failedAttempts: 0, lockedUntil: 0 })
}))

// 暴露常數給 UI 顯示
export const AUTH_LIMITS = {
  MAX_ATTEMPTS_BEFORE_LOCKOUT,
  LOCKOUT_SECONDS
}

// 確保 hashPassword 不被誤刪（之後 LockScreen 設定流程會用到）
void hashPassword
