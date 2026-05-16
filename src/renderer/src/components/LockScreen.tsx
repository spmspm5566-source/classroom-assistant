/**
 * LockScreen.tsx — 鎖屏畫面（v2：信箱救援取代清空資料）
 *
 * 兩種模式（自動依「目前是否設了密碼」切換）：
 *
 *  🆕 setup 模式：第一次啟動 App，要求設定新密碼
 *     - 兩次密碼比對
 *     - 救援信箱（必填）— 之後忘記密碼可以用信箱解密復原
 *     - 選填的密碼提示
 *
 *  🔒 unlock 模式：之後啟動 App，要求輸入密碼解鎖
 *     - 顯示密碼提示
 *     - 連錯 5 次 → 鎖死 60 秒倒數
 *     - 「忘記密碼」按鈕 → 輸入當初設定的信箱 → 顯示密碼（不寄信，純本機解密）
 *     - 若舊資料沒設救援信箱 → fallback 提供「清空所有資料」的最後手段
 *
 * 設計原則：UI 全螢幕覆蓋，背景做漸層 + 鎖頭圖；不允許繞過。
 *
 * 關於信箱救援（v2 新增）：
 *  - 沒有後端，無法真的寄信
 *  - 設定時，密碼用「信箱當金鑰」AES-GCM 加密存到 IndexedDB
 *  - 忘記時，輸入信箱嘗試解密 → 成功就顯示密碼
 *  - 等效於「寄到信箱」，但更安全（資料不離開電腦）
 */

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuthStore, AUTH_LIMITS } from '../store/useAuthStore'
import {
  getConfig,
  setPassword,
  recoverPasswordByEmail,
  resetEverything
} from '../db/configRepo'
import { isElectron } from '../utils/platform'

/**
 * 鎖屏時的視窗控制列（最小化 / 關閉）。
 * 只在 Electron 桌面版顯示——鎖屏會蓋掉 TitleBar，沒這個就無法關視窗。
 * 網頁版沒有視窗概念，不顯示。
 */
const LockWindowControls: React.FC = () => {
  if (!isElectron()) return null
  const api = window.electronAPI
  if (!api) return null
  return (
    <div className="fixed top-3 right-3 z-[10001] flex gap-1.5 no-drag">
      <button
        onClick={() => api.minimize()}
        title="最小化"
        className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/30 text-white text-lg flex items-center justify-center backdrop-blur"
      >
        —
      </button>
      <button
        onClick={() => api.close()}
        title="關閉"
        className="w-9 h-9 rounded-lg bg-white/15 hover:bg-red-600 text-white text-lg flex items-center justify-center backdrop-blur"
      >
        ✕
      </button>
    </div>
  )
}

const LockScreen: React.FC = () => {
  const config = useLiveQuery(() => getConfig(), [], null)

  if (!config) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-brand-700 to-brand-900 text-white text-sm">
        <LockWindowControls />
        載入中…
      </div>
    )
  }

  const hasPassword = !!config.prefs.passwordHash
  return (
    <>
      <LockWindowControls />
      {hasPassword
        ? <UnlockForm
            hash={config.prefs.passwordHash!}
            hint={config.prefs.passwordHint ?? ''}
            hasEmailRecovery={!!config.prefs.encryptedPassword}
          />
        : <SetupForm />}
    </>
  )
}

// ── 子元件：首次設定密碼 ─────────────────────────────────────

const SetupForm: React.FC = () => {
  const markAuthed = useAuthStore(s => s.markAuthed)
  const [pw1, setPw1]       = React.useState('')
  const [pw2, setPw2]       = React.useState('')
  const [email, setEmail]   = React.useState('')
  const [hint, setHint]     = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError]   = React.useState('')

  // 簡易 email 格式檢查（接受 a@b.c）
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const handleSubmit = async () => {
    setError('')
    if (pw1.length < 4)     { setError('密碼至少 4 字元'); return }
    if (pw1 !== pw2)        { setError('兩次密碼不一致'); return }
    if (!email.trim())      { setError('請輸入救援信箱（之後忘記密碼必備）'); return }
    if (!emailLooksValid)   { setError('信箱格式看起來不太對，請再檢查一次'); return }

    setSaving(true)
    try {
      await setPassword(pw1, hint, email)
      markAuthed()
    } catch (e) {
      console.error(e)
      setError('儲存失敗：' + e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Backdrop>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-7 max-h-[95vh] overflow-y-auto">
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🔐</div>
          <h2 className="text-xl font-bold text-gray-800">第一次使用，請設定密碼</h2>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            這支密碼擋的是課堂上偷看的學生／同事。<br/>
            <span className="text-amber-600 font-medium">⚠ 信箱請務必使用您熟記的</span>，
            這是忘記密碼時的唯一救援方式。
          </p>
        </div>

        <div className="space-y-3">
          <Field
            label="設定密碼"
            type="password"
            value={pw1}
            onChange={setPw1}
            placeholder="至少 4 字元"
            autoFocus
          />
          <Field
            label="再輸入一次"
            type="password"
            value={pw2}
            onChange={setPw2}
          />
          <Field
            label="救援信箱（必填）"
            type="text"
            value={email}
            onChange={setEmail}
            placeholder="例：teacher@example.com"
            maxLength={80}
          />
          <p className="text-[11px] text-amber-700 leading-relaxed">
            💡 此信箱只儲存在您的本機，<b>不會真的寄信</b>。<br/>
            忘記密碼時，輸入相同信箱即可看回原密碼（資料不離開電腦）。
          </p>
          <Field
            label="密碼提示（選填，公開顯示在鎖屏）"
            type="text"
            value={hint}
            onChange={setHint}
            placeholder="例：你的舊家門牌號、貓的名字"
            maxLength={40}
          />
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving || !pw1 || !pw2 || !email}
          className="
            mt-5 w-full h-11 rounded-xl
            bg-gradient-to-br from-brand-600 to-brand-700
            hover:shadow-lg active:scale-95
            text-white font-semibold text-sm
            transition-all
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {saving ? '儲存中…' : '設定並進入 App'}
        </button>
      </div>
    </Backdrop>
  )
}

// ── 子元件：解鎖 ──────────────────────────────────────────────

interface UnlockProps {
  hash:             string
  hint:             string
  hasEmailRecovery: boolean
}

const UnlockForm: React.FC<UnlockProps> = ({ hash, hint, hasEmailRecovery }) => {
  const unlock          = useAuthStore(s => s.unlock)
  const failedAttempts  = useAuthStore(s => s.failedAttempts)
  const lockedUntil     = useAuthStore(s => s.lockedUntil)

  const [pw, setPw]               = React.useState('')
  const [error, setError]         = React.useState('')
  const [unlocking, setUnlocking] = React.useState(false)
  const [now, setNow]             = React.useState(Date.now())
  const [showRecover, setShowRecover] = React.useState(false)

  // 鎖死倒數刷新
  React.useEffect(() => {
    if (lockedUntil <= Date.now()) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [lockedUntil])

  const lockedRemaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  const isLockedOut = lockedRemaining > 0

  const handleSubmit = async () => {
    if (isLockedOut || !pw || unlocking) return
    setUnlocking(true)
    setError('')
    try {
      const ok = await unlock(pw, hash)
      if (!ok) {
        const newAttempts = failedAttempts + 1
        const left = AUTH_LIMITS.MAX_ATTEMPTS_BEFORE_LOCKOUT - newAttempts
        if (left > 0) {
          setError(`密碼錯誤（剩 ${left} 次嘗試後將鎖死 ${AUTH_LIMITS.LOCKOUT_SECONDS} 秒）`)
        } else {
          setError(`連錯 ${AUTH_LIMITS.MAX_ATTEMPTS_BEFORE_LOCKOUT} 次，鎖死 ${AUTH_LIMITS.LOCKOUT_SECONDS} 秒`)
        }
        setPw('')
      }
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <Backdrop>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-7 max-h-[95vh] overflow-y-auto">
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🔒</div>
          <h2 className="text-xl font-bold text-gray-800">班級助手</h2>
          <p className="text-xs text-gray-500 mt-1">請輸入密碼以解鎖</p>
          {hint && (
            <p className="
              mt-3 inline-block px-3 py-1.5 rounded-md
              bg-amber-50 border border-amber-200
              text-xs text-amber-800
            ">
              💡 提示：{hint}
            </p>
          )}
        </div>

        <Field
          label=""
          type="password"
          value={pw}
          onChange={setPw}
          onEnter={handleSubmit}
          placeholder={isLockedOut ? `鎖死中… ${lockedRemaining} 秒後可再試` : '輸入密碼'}
          disabled={isLockedOut}
          autoFocus
        />

        {error && <p className="mt-2 text-xs text-red-600 text-center">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={unlocking || isLockedOut || !pw}
          className="
            mt-4 w-full h-11 rounded-xl
            bg-gradient-to-br from-brand-600 to-brand-700
            hover:shadow-lg active:scale-95
            text-white font-semibold text-sm
            transition-all
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {unlocking ? '驗證中…' : isLockedOut ? `${lockedRemaining} 秒後可再試` : '解鎖'}
        </button>

        {/* 忘記密碼入口 */}
        <div className="mt-5 text-center">
          <button
            onClick={() => setShowRecover(true)}
            className="text-[11px] text-gray-500 hover:text-brand-700 underline"
          >
            忘記密碼？
          </button>
        </div>

        {/* 信箱救援 / 清空資料 對話框 */}
        {showRecover && (
          <RecoverDialog
            hasEmailRecovery={hasEmailRecovery}
            onClose={() => setShowRecover(false)}
          />
        )}
      </div>
    </Backdrop>
  )
}

// ── 子元件：忘記密碼救援 ─────────────────────────────────────

interface RecoverDialogProps {
  hasEmailRecovery: boolean
  onClose:          () => void
}

const RecoverDialog: React.FC<RecoverDialogProps> = ({ hasEmailRecovery, onClose }) => {
  const [email, setEmail]     = React.useState('')
  const [recovered, setRecovered] = React.useState<string | null>(null)
  const [error, setError]     = React.useState('')
  const [busy, setBusy]       = React.useState(false)

  const handleRecover = async () => {
    if (!email.trim()) { setError('請輸入信箱'); return }
    setError('')
    setBusy(true)
    try {
      const pw = await recoverPasswordByEmail(email)
      if (pw === null) {
        setError('信箱不正確（或資料無效），請再確認當初設定的信箱')
      } else {
        setRecovered(pw)
      }
    } catch (e) {
      console.error(e)
      setError('救援失敗：' + e)
    } finally {
      setBusy(false)
    }
  }

  // ── 最後手段：清空資料 ──
  const handleHardReset = async () => {
    const ok1 = window.confirm(
      '⚠ 警告：清空資料會「永久刪除所有班級、學生、加分記錄、考試成績」，無法還原。\n\n要繼續嗎？'
    )
    if (!ok1) return
    const ok2 = window.confirm(
      '最後確認：所有資料將永久刪除。\n\n按確定後 App 會自動重啟為空白狀態。'
    )
    if (!ok2) return
    try {
      await resetEverything()
      location.reload()
    } catch (e) {
      console.error(e)
      window.alert('重設失敗：' + e)
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-800">忘記密碼</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        {recovered === null ? (
          <>
            {hasEmailRecovery ? (
              <>
                <p className="text-xs text-gray-600 leading-relaxed mb-3">
                  請輸入當初設定時的<b>救援信箱</b>，正確後會直接顯示您的密碼。<br/>
                  <span className="text-amber-600">※ 不會真的寄信</span>，密碼是用該信箱在本機加密儲存的，
                  輸入正確信箱即可解密。
                </p>
                <Field
                  label="救援信箱"
                  type="text"
                  value={email}
                  onChange={setEmail}
                  onEnter={handleRecover}
                  placeholder="例：teacher@example.com"
                  autoFocus
                />
                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
                <button
                  onClick={handleRecover}
                  disabled={busy || !email.trim()}
                  className="
                    mt-4 w-full h-10 rounded-lg
                    bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold
                    disabled:opacity-50
                  "
                >
                  {busy ? '驗證中…' : '顯示密碼'}
                </button>
              </>
            ) : (
              <p className="text-xs text-gray-600 leading-relaxed mb-3">
                此資料庫是舊版設定的，<b>沒有救援信箱</b>。<br/>
                唯一恢復方式是清空所有資料重新開始。
              </p>
            )}

            {/* 最後手段 */}
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-[11px] text-gray-400 text-center mb-2">
                若救援信箱也忘了，最後手段：
              </p>
              <button
                onClick={handleHardReset}
                className="
                  w-full h-9 rounded-lg
                  bg-red-50 border border-red-300 text-red-700 text-xs font-semibold
                  hover:bg-red-100
                "
              >
                🗑 清空所有資料重設（無法復原）
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-4">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm text-gray-700">您的密碼是：</p>
            </div>
            <div className="
              p-4 rounded-xl
              bg-gradient-to-br from-emerald-50 to-green-50
              border-2 border-emerald-300
              text-center
            ">
              <code className="text-2xl font-mono font-bold text-emerald-800 select-all">
                {recovered}
              </code>
            </div>
            <p className="text-[11px] text-gray-500 text-center mt-3">
              請記下，按下方關閉後輸入密碼解鎖。
            </p>
            <button
              onClick={onClose}
              className="
                mt-4 w-full h-10 rounded-lg
                bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold
              "
            >
              我記住了，回去輸入密碼
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── 共用：背景與輸入框 ───────────────────────────────────────

const Backdrop: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="
    fixed inset-0 z-[9999]
    w-screen h-screen
    flex items-center justify-center
    bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900
    p-4
  ">
    {children}
  </div>
)

interface FieldProps {
  label:        string
  type:         'text' | 'password'
  value:        string
  onChange:     (v: string) => void
  onEnter?:     () => void
  placeholder?: string
  disabled?:    boolean
  autoFocus?:   boolean
  maxLength?:   number
}

const Field: React.FC<FieldProps> = ({
  label, type, value, onChange, onEnter,
  placeholder, disabled, autoFocus, maxLength
}) => (
  <div>
    {label && (
      <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
    )}
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      maxLength={maxLength}
      className="
        w-full h-11 px-3 text-sm
        bg-gray-50 border border-gray-200 rounded-xl
        focus:outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
        disabled:bg-gray-100 disabled:cursor-not-allowed
      "
    />
  </div>
)

export default LockScreen
