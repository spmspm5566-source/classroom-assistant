/**
 * googleAuth.ts — Google OAuth 2.0 流程 + token 管理
 *
 * 使用內建共用憑證，使用者不需自行設定 Client ID / Secret。
 * 每位老師用自己的 Gmail 授權，備份各自存在自己的 Google Drive。
 *
 * Drive scope 僅 drive.file（只能存取本 App 建立的檔案）。
 */

import { shell, app } from 'electron'
import { createServer } from 'http'
import { readFile, writeFile, unlink } from 'fs/promises'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// ── 共用憑證（桌面應用程式類型，Client Secret 非真正機密）──
// 從 google_oauth.json 讀取（不進版控；GitHub push protection 會擋住寫死的憑證）。
// 格式：{ "clientId": "...", "clientSecret": "..." }
// 開發時放專案根目錄；打包後由 extraResources 帶入 resources/ 目錄。

function loadBuiltInCredentials(): { clientId: string; clientSecret: string } {
  const candidates = [
    join(process.resourcesPath ?? '', 'google_oauth.json'),  // 打包後
    join(app.getAppPath(), 'google_oauth.json'),             // 開發時（專案根目錄）
    join(app.getAppPath(), '..', 'google_oauth.json')        // asar 旁
  ]
  for (const p of candidates) {
    try {
      if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'))
    } catch { /* try next */ }
  }
  return { clientId: '', clientSecret: '' }
}

const builtIn = loadBuiltInCredentials()
const BUILT_IN_CLIENT_ID     = builtIn.clientId
const BUILT_IN_CLIENT_SECRET = builtIn.clientSecret

// ── 常數 ─────────────────────────────────────────────────────

const SCOPES       = 'https://www.googleapis.com/auth/drive.file'
const OAUTH_PORT   = 42813
const REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}`

// ── 型別 ─────────────────────────────────────────────────────

interface StoredTokens {
  accessToken:  string
  refreshToken: string
  expiresAt:    number
}

// ── 檔案路徑 ─────────────────────────────────────────────────

function tokensPath(): string { return join(app.getPath('userData'), 'google_tokens.json') }

// ── Tokens ───────────────────────────────────────────────────

async function loadTokens(): Promise<StoredTokens | null> {
  try {
    return JSON.parse(await readFile(tokensPath(), 'utf-8'))
  } catch { return null }
}

async function persistTokens(t: StoredTokens): Promise<void> {
  await writeFile(tokensPath(), JSON.stringify(t), 'utf-8')
}

export async function clearTokens(): Promise<void> {
  try { await unlink(tokensPath()) } catch { /* already gone */ }
}

export async function isConnected(): Promise<boolean> {
  const t = await loadTokens()
  return !!t?.refreshToken
}

/**
 * getValidAccessToken
 * 傳回可直接使用的 access token；過期前 5 分鐘自動 refresh。
 */
export async function getValidAccessToken(): Promise<string | null> {
  let tokens = await loadTokens()
  if (!tokens) return null

  if (Date.now() < tokens.expiresAt - 5 * 60 * 1000) {
    return tokens.accessToken
  }

  // Refresh
  try {
    const res  = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     BUILT_IN_CLIENT_ID,
        client_secret: BUILT_IN_CLIENT_SECRET,
        refresh_token: tokens.refreshToken,
        grant_type:    'refresh_token'
      }).toString()
    })
    const data = await res.json() as Record<string, unknown>
    if (!data['access_token']) return null

    tokens = {
      accessToken:  String(data['access_token']),
      refreshToken: tokens.refreshToken,
      expiresAt:    Date.now() + Number(data['expires_in']) * 1000
    }
    await persistTokens(tokens)
    return tokens.accessToken
  } catch {
    return null
  }
}

/**
 * startOAuthFlow
 * 開啟瀏覽器讓老師用自己的 Gmail 授權，等待 callback，儲存 tokens。
 */
export async function startOAuthFlow(): Promise<{ ok: boolean; error?: string }> {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id',     BUILT_IN_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri',  REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope',         SCOPES)
  authUrl.searchParams.set('access_type',   'offline')
  authUrl.searchParams.set('prompt',        'consent')

  return new Promise((resolve) => {
    let settled = false
    const done = (result: { ok: boolean; error?: string }) => {
      if (settled) return
      settled = true
      server.close()
      resolve(result)
    }

    const server = createServer(async (req, res) => {
      const url   = new URL(req.url ?? '/', `http://127.0.0.1:${OAUTH_PORT}`)
      const code  = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      // 忽略 favicon、其他無關請求（不含 code/error 的一律跳過）
      if (!code && !error) {
        res.writeHead(200)
        res.end()
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>✅ 授權完成，請回到班級助手程式。</h2>
          <p style="color:#888">此頁面可以關閉。</p>
        </body></html>
      `)

      if (error || !code) { done({ ok: false, error: error ?? '未收到授權碼' }); return }

      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    new URLSearchParams({
            code,
            client_id:     BUILT_IN_CLIENT_ID,
            client_secret: BUILT_IN_CLIENT_SECRET,
            redirect_uri:  REDIRECT_URI,
            grant_type:    'authorization_code'
          }).toString()
        })
        const data = await tokenRes.json() as Record<string, unknown>
        if (!data['access_token']) {
          done({ ok: false, error: String(data['error_description'] ?? '無法取得 token') })
          return
        }
        await persistTokens({
          accessToken:  String(data['access_token']),
          refreshToken: String(data['refresh_token'] ?? ''),
          expiresAt:    Date.now() + Number(data['expires_in']) * 1000
        })
        done({ ok: true })
      } catch (e) {
        done({ ok: false, error: String(e) })
      }
    })

    server.listen(OAUTH_PORT, '127.0.0.1', () => {
      shell.openExternal(authUrl.toString())
    })

    // 3 分鐘逾時
    setTimeout(() => done({ ok: false, error: '等待授權逾時（3 分鐘），請重試' }), 3 * 60 * 1000)
  })
}

// ── 以下保留供 IPC 相容，不再使用 ────────────────────────────
export async function getCredentials() { return { clientId: BUILT_IN_CLIENT_ID, hasSecret: true } }
export async function saveCredentials(_c: unknown) { /* 不再需要 */ }
