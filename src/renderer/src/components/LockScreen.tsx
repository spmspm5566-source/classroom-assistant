/**
 * LockScreen.tsx — 鎖屏畫面
 *
 * 三種模式：
 *
 *  🆕 setup  模式：第一次啟動，要求設定信箱 + 密碼
 *  🔒 unlock 模式：之後啟動，要求輸入密碼解鎖
 *  📧 forgot 模式：忘記密碼 → 輸入信箱 → 自動寄密碼 / 顯示密碼
 *
 * 忘記密碼流程：
 *  1. 若已連線 Google → 透過 Gmail API 把密碼寄到信箱
 *  2. 若未連線 Google → 直接把密碼顯示在畫面（信箱驗證後）
 */

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuthStore, AUTH_LIMITS } from '../store/useAuthStore'
import {
  getConfig,
  setPassword,
  resetEverything
} from '../db/configRepo'

const LockScreen: React.FC = () => {
  const config = useLiveQuery(() => getConfig(), [], null)

  if (!config) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-brand-700 to-brand-900 text-white text-sm">
        載入中…
      </div>
    )
  }

  const hasPassword = !!config.prefs.passwordHash
  return hasPassword
    ? <UnlockForm
        hash={config.prefs.passwordHash!}
        hint={config.prefs.passwordHint ?? ''}
        storedEmail={config.prefs.email ?? ''}
        passwordEncoded={config.prefs.passwordEncoded ?? ''}
      />
    : <SetupForm />
}

// ── 子元件：首次設定密碼 ─────────────────────────────────────

const SetupForm: React.FC = () => {
  const markAuthed = useAuthStore(s => s.markAuthed)

  // Electron 視窗焦點修正：避免需要截圖才能輸入
  React.useEffect(() => { window.focus() }, [])

  const [email, setEmail]   = React.useState('')
  const [pw1, setPw1]       = React.useState('')
  const [pw2, setPw2]       = React.useState('')
  const [hint, setHint]     = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError]   = React.useState('')

  const handleSubmit = async () => {
    setError('')
    if (!email.includes('@')) { setError('請輸入有效的信箱地址'); return }
    if (pw1.length < 4)       { setError('密碼至少 4 字元'); return }
    if (pw1 !== pw2)          { setError('兩次密碼不一致'); return }
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
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-7">
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🔐</div>
          <h2 className="text-xl font-bold text-gray-800">第一次使用，請設定密碼</h2>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            這支密碼擋的是課堂上偷看的學生／同事。<br/>
            <span className="text-amber-600 font-medium">⚠ 忘記密碼時，可透過信箱取回密碼。</span>
          </p>
        </div>

        <div className="space-y-3">
          <Field
            label="信箱（用於忘記密碼時取回）"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="your@email.com"
            autoFocus
          />
          <Field
            label="設定密碼"
            type="password"
            value={pw1}
            onChange={setPw1}
            placeholder="至少 4 字元"
          />
          <Field
            label="再輸入一次"
            type="password"
            value={pw2}
            onChange={setPw2}
            onEnter={handleSubmit}
          />
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
          disabled={saving || !email || !pw1 || !pw2}
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

const UnlockForm: React.FC<{
  hash:            string
  hint:            string
  storedEmail:     string
  passwordEncoded: string
}> = ({ hash, hint, storedEmail, passwordEncoded }) => {
  const unlock         = useAuthStore(s => s.unlock)
  const failedAttempts = useAuthStore(s => s.failedAttempts)
  const lockedUntil    = useAuthStore(s => s.lockedUntil)

  // Electron 視窗焦點修正：避免需要截圖才能輸入
  React.useEffect(() => { window.focus() }, [])

  const [pw, setPw]                 = React.useState('')
  const [error, setError]           = React.useState('')
  const [unlocking, setUnlocking]   = React.useState(false)
  const [now, setNow]               = React.useState(Date.now())
  const [showForgot, setShowForgot] = React.useState(false)

  // 鎖死倒數刷新
  React.useEffect(() => {
    if (lockedUntil <= Date.now()) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [lockedUntil])

  const lockedRemaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  const isLockedOut = lockedRemaining > 0

  const handleSubmit = async () => {
    if (isLockedOut) return
    if (!pw) return
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

  if (showForgot) {
    return (
      <ForgotForm
        storedEmail={storedEmail}
        passwordEncoded={passwordEncoded}
        onBack={() => setShowForgot(false)}
      />
    )
  }

  return (
    <Backdrop>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-7">
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

        {/* 忘記密碼 */}
        <div className="mt-5 text-center">
          <button
            onClick={() => setShowForgot(true)}
            className="text-[11px] text-gray-400 hover:text-brand-600 underline"
          >
            忘記密碼？
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

// ── 子元件：忘記密碼 ─────────────────────────────────────────

const ForgotForm: React.FC<{
  storedEmail:     string
  passwordEncoded: string
  onBack:          () => void
}> = ({ storedEmail, passwordEncoded, onBack }) => {
  const [email, setEmail]           = React.useState('')
  const [status, setStatus]         = React.useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [msg, setMsg]               = React.useState('')
  const [revealedPw, setRevealedPw] = React.useState('')
  const [resetting, setResetting]   = React.useState(false)

  // 解碼密碼（btoa(unescape(encodeURIComponent(pw)))）
  const decodePw = (encoded: string): string => {
    try { return decodeURIComponent(escape(atob(encoded))) }
    catch { return '' }
  }

  const handleRecover = async () => {
    setMsg('')
    setRevealedPw('')
    const inputEmail = email.trim().toLowerCase()

    if (!inputEmail.includes('@')) {
      setMsg('請輸入有效的信箱地址')
      return
    }

    if (!storedEmail) {
      setMsg('此帳號未設定信箱，無法取回密碼。\n請點下方「重設（清空資料）」。')
      return
    }

    if (inputEmail !== storedEmail) {
      setMsg('信箱不符，請輸入設定時填寫的信箱。')
      return
    }

    const password = decodePw(passwordEncoded)
    if (!password) {
      setMsg('密碼資料損壞，請重設。')
      return
    }

    // 直接顯示密碼（信箱驗證通過即可看到）
    setRevealedPw(password)
    setMsg('')
    setStatus('done')
  }

  const handleReset = async () => {
    const ok1 = window.confirm(
      '⚠ 警告：重設密碼會「清空所有資料」（班級、學生、加分記錄、考試成績全部消失），無法還原。\n\n要繼續嗎？'
    )
    if (!ok1) return
    const ok2 = window.confirm(
      '最後確認：所有資料將永久刪除。\n\n按確定後 App 會自動重啟為空白狀態。'
    )
    if (!ok2) return
    setResetting(true)
    try {
      await resetEverything()
      location.reload()
    } catch (e) {
      window.alert('重設失敗：' + e)
      setResetting(false)
    }
  }

  return (
    <Backdrop>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-7">
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">📧</div>
          <h2 className="text-xl font-bold text-gray-800">取回密碼</h2>
          <p className="text-xs text-gray-500 mt-1">
            輸入您設定的信箱，系統將把密碼寄給您。
          </p>
        </div>

        {status !== 'done' ? (
          <>
            <Field
              label="信箱"
              type="email"
              value={email}
              onChange={setEmail}
              onEnter={handleRecover}
              placeholder="your@email.com"
              autoFocus
            />

            {msg && (
              <p className="mt-3 text-xs text-red-600 whitespace-pre-line">{msg}</p>
            )}

            <button
              onClick={handleRecover}
              disabled={status === 'sending' || !email}
              className="
                mt-4 w-full h-11 rounded-xl
                bg-gradient-to-br from-brand-600 to-brand-700
                hover:shadow-lg active:scale-95
                text-white font-semibold text-sm
                transition-all
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {status === 'sending' ? '寄送中…' : '取回密碼'}
            </button>
          </>
        ) : (
          <>
            {msg && (
              <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800 text-center">
                {msg}
              </div>
            )}
            {revealedPw && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-center">
                <p className="text-xs text-amber-700 mb-1">您的密碼是：</p>
                <p className="text-2xl font-bold text-amber-900 tracking-widest select-all">{revealedPw}</p>
                <p className="text-[10px] text-amber-600 mt-1">請截圖或記下後回去輸入密碼</p>
              </div>
            )}
            <button
              onClick={onBack}
              className="
                mt-4 w-full h-11 rounded-xl
                bg-gradient-to-br from-brand-600 to-brand-700
                hover:shadow-lg active:scale-95
                text-white font-semibold text-sm
                transition-all
              "
            >
              回去輸入密碼
            </button>
          </>
        )}

        {/* 下方工具列 */}
        <div className="mt-5 flex justify-between items-center">
          <button
            onClick={onBack}
            className="text-[11px] text-gray-400 hover:text-gray-600"
          >
            ← 返回
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="text-[11px] text-red-400 hover:text-red-600 underline disabled:opacity-50"
          >
            重設（清空所有資料）
          </button>
        </div>
      </div>
    </Backdrop>
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
  type:         'text' | 'password' | 'email'
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
