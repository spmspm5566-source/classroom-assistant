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

// ── 信箱救援：用 email 加密原密碼（可逆） ───────────────────
//
// 設計用途：當老師忘記密碼時，可輸入當初設定的信箱來「解密」恢復密碼。
// 因為本機 App 無後端，無法真的寄信，這是替代方案。
//
// 流程：
//   設定密碼：把密碼用 (email 派生的金鑰) AES-GCM 加密，存到 prefs.encryptedPassword
//   忘記密碼：輸入 email → 嘗試解密 → 解密成功就顯示密碼，失敗代表 email 錯
//
// 安全性誠實標示：
//   ✓ 擋學生／同事偷看（要先知道老師信箱）
//   ✗ 不擋知道信箱的人；不擋拿到資料庫檔的駭客

/** 信箱正規化（小寫 + trim） */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** 用 PBKDF2 從 email 衍生 AES-256 金鑰 */
async function deriveKeyFromEmail(email: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizeEmail(email)),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt:       new TextEncoder().encode('classroom-assistant-email-salt-v1'),
      iterations: 100000,
      hash:       'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** 把 Uint8Array 轉 base64 */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/** base64 轉 Uint8Array */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * encryptPasswordWithEmail
 * 用信箱衍生的 AES 金鑰加密密碼，回傳 base64 字串（含 IV）。
 */
export async function encryptPasswordWithEmail(password: string, email: string): Promise<string> {
  const key = await deriveKeyFromEmail(email)
  const iv  = crypto.getRandomValues(new Uint8Array(12))
  const ct  = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(password)
  )
  // 串接 iv + ciphertext → base64
  const combined = new Uint8Array(iv.length + ct.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ct), iv.length)
  return bytesToBase64(combined)
}

/**
 * recoverPasswordWithEmail
 * 用信箱嘗試解密。成功回傳原密碼，失敗（信箱錯誤或資料無效）回傳 null。
 */
export async function recoverPasswordWithEmail(
  encryptedBase64: string,
  email:           string
): Promise<string | null> {
  try {
    const combined  = base64ToBytes(encryptedBase64)
    if (combined.length < 13) return null
    const iv         = combined.slice(0, 12)
    const ciphertext = combined.slice(12)
    const key        = await deriveKeyFromEmail(email)
    const plaintext  = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

