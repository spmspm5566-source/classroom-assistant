/**
 * LockScreen.tsx — 鎖屏畫面
 *
 * 兩種模式（自動依「目前是否設了密碼」切換）：
 *
 *  🆕 setup 模式：第一次啟動 App，要求設定新密碼
 *     - 兩次密碼比對
 *     - 可選的密碼提示（顯示給以後忘記密碼的自己看）
 *
 *  🔒 unlock 模式：之後啟動 App，要求輸入密碼解鎖
 *     - 顯示密碼提示
 *     - 連錯 5 次 → 鎖死 60 秒倒數
 *     - 「忘記密碼」按鈕 → 雙重確認後砍掉整個資料庫重來
 *
 * 設計原則：UI 全螢幕覆蓋，背景做漸層 + 鎖頭圖；不允許繞過。
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
    ? <UnlockForm hash={config.prefs.passwordHash!} hint={config.prefs.passwordHint ?? ''} />
    : <SetupForm />
}

// ── 子元件：首次設定密碼 ─────────────────────────────────────

const SetupForm: React.FC = () => {
  const markAuthed = useAuthStore(s => s.markAuthed)
  const [pw1, setPw1]       = React.useState('')
  const [pw2, setPw2]       = React.useState('')
  const [hint, setHint]     = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError]   = React.useState('')

  const handleSubmit = async () => {
    setError('')
    if (pw1.length < 4) { setError('密碼至少 4 字元'); return }
    if (pw1 !== pw2)    { setError('兩次密碼不一致'); return }
    setSaving(true)
    try {
      await setPassword(pw1, hint)
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
            <span className="text-amber-600 font-medium">⚠ 忘記密碼將會清空所有資料</span>，請務必記住。
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
            onEnter={handleSubmit}
          />
          <Field
            label="提示文字（選填，公開顯示在鎖屏）"
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
          disabled={saving || !pw1 || !pw2}
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

const UnlockForm: React.FC<{ hash: string; hint: string }> = ({ hash, hint }) => {
  const unlock          = useAuthStore(s => s.unlock)
  const failedAttempts  = useAuthStore(s => s.failedAttempts)
  const lockedUntil     = useAuthStore(s => s.lockedUntil)

  const [pw, setPw]         = React.useState('')
  const [error, setError]   = React.useState('')
  const [unlocking, setUnlocking] = React.useState(false)
  const [now, setNow]       = React.useState(Date.now())

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

  // ── 忘記密碼 ──
  const handleForgot = async () => {
    const ok1 = window.confirm(
      '⚠ 警告：重設密碼會「清空所有資料」（班級、學生、加分記錄、考試成績全部消失），無法還原。\n\n要繼續嗎？'
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
            onClick={handleForgot}
            className="text-[11px] text-gray-400 hover:text-red-600 underline"
          >
            忘記密碼？（會清空所有資料）
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
