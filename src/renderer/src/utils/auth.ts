/**
 * auth.ts — 密碼雜湊與驗證工具
 *
 * 用 Web Crypto API 的 SHA-256（Electron 與瀏覽器都原生支援，
 * 無需第三方套件，也避免動態載入）。
 *
 * 安全性說明（誠實標示，避免老師誤以為是銀行級加密）：
 *  - 用途：擋下「課堂上學生想偷看老師資料」「同事不小心點到 App」
 *  - 不能擋：能拿到電腦的駭客（IndexedDB 資料本身仍是明文）
 *  - 真正想保護資料 → 需「整本資料庫加密」（工時 ×3，且忘記密碼=資料全沒）
 *
 * 加鹽：使用固定 salt（適合單一使用者本機應用，避免「忘記密碼」流程過於複雜）。
 */

const SALT = 'classroom-assistant-salt-v1'

/**
 * hashPassword
 * 用 SHA-256 把密碼轉成 64 字元的 hex 字串。同一密碼一律產生相同結果，
 * 寫入 ConfigDoc.prefs.passwordHash 與輸入比對即可驗證。
 */
export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + SALT)
  const buf  = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * verifyPassword
 * 比對輸入密碼是否與儲存的雜湊吻合。
 */
export async function verifyPassword(input: string, storedHash: string): Promise<boolean> {
  if (!input || !storedHash) return false
  const inputHash = await hashPassword(input)
  return inputHash === storedHash
}

/**
 * isStrongEnough
 * 寬鬆驗證：至少 4 字元（老師方便用，課堂工具不需要強密碼）。
 */
export function isStrongEnough(password: string): boolean {
  return password.length >= 4
}
