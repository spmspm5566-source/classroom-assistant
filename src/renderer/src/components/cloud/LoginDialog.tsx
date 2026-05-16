/**
 * LoginDialog.tsx — 雲端帳號登入 / 註冊對話框
 *
 * 由「加分規則 → 資料備份 → ☁ 雲端備份」開啟。
 * 登入後，BackupSection 會顯示「上傳到雲端 / 從雲端下載」按鈕。
 *
 * 雙模式：登入 / 註冊。註冊預設不需收驗證信（已在 Supabase 後台關閉 Confirm email）。
 */

import React from 'react'
import { useCloudAuthStore } from '../../store/useCloudAuthStore'

interface Props {
  onClose: () => void
}

/** 把 Supabase 的英文錯誤訊息轉成老師看得懂的中文 */
function translateError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('failed to fetch') || m.includes('networkerror')) {
    return '無法連線到雲端伺服器，請檢查網路連線'
  }
  if (m.includes('invalid login credentials')) {
    return '帳號或密碼錯誤（若還沒註冊過，請先點下方「點此註冊」）'
  }
  if (m.includes('email not confirmed')) {
    return '此帳號尚未完成 Email 驗證'
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return '這個 Email 已註冊過，請改用「登入」'
  }
  if (m.includes('password should be at least')) {
    return '密碼太短，請至少 6 個字'
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return 'Email 格式不正確'
  }
  return msg
}

const LoginDialog: React.FC<Props> = ({ onClose }) => {
  const signIn  = useCloudAuthStore(s => s.signIn)
  const signUp  = useCloudAuthStore(s => s.signUp)

  const [mode,     setMode]     = React.useState<'signin' | 'signup'>('signin')
  const [email,    setEmail]    = React.useState('')
  const [password, setPassword] = React.useState('')
  const [busy,     setBusy]     = React.useState(false)
  const [error,    setError]    = React.useState<string | null>(null)
  const [info,     setInfo]     = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!email.trim() || !password) {
      setError('請輸入 Email 與密碼')
      return
    }
    if (mode === 'signup' && password.length < 6) {
      setError('密碼至少 6 個字')
      return
    }
    setBusy(true)
    try {
      const fn  = mode === 'signin' ? signIn : signUp
      const res = await fn(email.trim(), password)
      if (res.error) {
        setError(translateError(res.error))
      } else if (mode === 'signup') {
        // Confirm email 已關閉的話 signUp 後通常會自動取得 session
        setInfo('註冊成功！可關閉此視窗開始備份。')
        setTimeout(onClose, 1200)
      } else {
        onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            ☁ {mode === 'signin' ? '登入雲端帳號' : '註冊雲端帳號'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
          雲端帳號用於「跨電腦備份」。學生姓名等資料會在上傳前先加密，
          雲端只能看到密文。換電腦時用同一組帳號登入即可下載。
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="teacher@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">密碼</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder={mode === 'signup' ? '至少 6 個字' : ''}
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              ⚠ {error}
            </p>
          )}
          {info && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
              ✓ {info}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-10 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? '處理中…' : (mode === 'signin' ? '登入' : '註冊')}
          </button>
        </form>

        <div className="mt-4 text-center">
          {mode === 'signin' ? (
            <button
              onClick={() => { setMode('signup'); setError(null); setInfo(null) }}
              className="text-xs text-brand-600 hover:underline"
            >
              還沒有帳號？點此註冊
            </button>
          ) : (
            <button
              onClick={() => { setMode('signin'); setError(null); setInfo(null) }}
              className="text-xs text-brand-600 hover:underline"
            >
              已有帳號？點此登入
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default LoginDialog
