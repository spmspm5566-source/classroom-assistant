/**
 * useCloudAuthStore.ts — 雲端帳號登入狀態
 *
 * 與本機鎖屏密碼（useAuthStore）獨立：
 *   - useAuthStore：本機 App 鎖屏密碼（SHA-256 hash 存 IndexedDB）
 *   - useCloudAuthStore：Supabase 雲端帳號（用於跨電腦備份）
 *
 * 大多數老師只用本機；想用雲備份的才登入這個。
 */

import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

interface CloudAuthState {
  session:  Session | null
  user:     User | null
  loading:  boolean
  /**
   * 加密通行碼 = 登入密碼，僅暫存記憶體（不寫入任何地方）。
   * 重整 / 重開 App 後會是 null，此時備份操作需請使用者重新輸入。
   */
  passphrase: string | null
  setPassphrase: (p: string) => void
  /** 啟動時呼叫一次，掛載 Supabase auth listener。 */
  init:     () => void
  signUp:   (email: string, password: string) => Promise<{ error: string | null }>
  signIn:   (email: string, password: string) => Promise<{ error: string | null }>
  signOut:  () => Promise<void>
}

export const useCloudAuthStore = create<CloudAuthState>((set) => ({
  session:    null,
  user:       null,
  loading:    true,
  passphrase: null,

  setPassphrase: (p) => set({ passphrase: p }),

  init: () => {
    // 啟動時抓一次目前 session
    supabase.auth.getSession().then(({ data }) => {
      set({
        session: data.session,
        user:    data.session?.user ?? null,
        loading: false
      })
    })
    // 之後變動時自動同步
    supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user:    session?.user ?? null,
        loading: false
      })
    })
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (!error) set({ passphrase: password })
    return { error: error?.message ?? null }
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) set({ passphrase: password })
    return { error: error?.message ?? null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ passphrase: null })
  }
}))
