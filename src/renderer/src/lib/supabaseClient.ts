/**
 * supabaseClient.ts — Supabase 連線設定
 *
 * 個人用備份雲端（免費 tier）。
 * 學生姓名等敏感資料上傳前會用使用者登入密碼 AES-GCM 加密，
 * 雲端只看到 ciphertext。
 */

import { createClient } from '@supabase/supabase-js'

// 公開金鑰（publishable key），不是 service role
const SUPABASE_URL  = 'https://nmmfazqbyknitoisqrkt.supabase.co'
const SUPABASE_ANON = 'sb_publishable_AGwnwG7mQUA46MTXlTjdXQ_w4WHLYsa'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:   true,
    autoRefreshToken: true,
    storageKey:       'classroom-assistant-auth'
  }
})

/** 雲端備份資料表 row 結構（對應 SQL 建立的 user_backups 表）。 */
export interface CloudBackupRow {
  user_id:    string
  data:       unknown        // jsonb：加密後的備份 payload
  updated_at: string         // ISO timestamp
  size_bytes: number | null
}
