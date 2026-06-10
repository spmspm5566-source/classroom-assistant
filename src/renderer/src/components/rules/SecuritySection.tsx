/**
 * SecuritySection.tsx — 安全設定區塊（嵌在規則頁）
 *
 * 提供：
 *  - 修改密碼（要先輸入舊密碼，避免人離開電腦時被改）
 *
 * 鎖屏快捷（自動鎖屏時間 + 立即鎖屏按鈕）已移至首頁 HomePage。
 */

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  getConfig,
  setPassword
} from '../../db/configRepo'
import { verifyPassword } from '../../utils/auth'
import RuleSection from './RuleSection'
import Button      from '../shared/Button'

const SecuritySection: React.FC = () => {
  const config = useLiveQuery(() => getConfig(), [], null)

  const [showChange, setShowChange] = React.useState(false)
  const [oldPw, setOldPw]   = React.useState('')
  const [newPw, setNewPw]   = React.useState('')
  const [newPw2, setNewPw2] = React.useState('')
  const [hint, setHint]     = React.useState('')
  const [email, setEmail]   = React.useState('')
  const [err, setErr]       = React.useState('')
  const [busy, setBusy]     = React.useState(false)

  if (!config) return null

  // ── 開啟修改密碼面板：先填入目前 hint ──
  const openChange = (): void => {
    setHint(config.prefs.passwordHint ?? '')
    setEmail(config.prefs.email ?? '')
    setOldPw(''); setNewPw(''); setNewPw2(''); setErr('')
    setShowChange(true)
  }

  const handleSave = async (): Promise<void> => {
    setErr('')
    if (!oldPw) { setErr('請輸入目前密碼'); return }
    if (newPw.length < 4) { setErr('新密碼至少 4 字元'); return }
    if (newPw !== newPw2) { setErr('兩次新密碼不一致'); return }
    if (email && !email.includes('@')) { setErr('信箱格式不正確'); return }

    setBusy(true)
    try {
      const ok = await verifyPassword(oldPw, config.prefs.passwordHash ?? '')
      if (!ok) { setErr('目前密碼錯誤'); setBusy(false); return }
      await setPassword(newPw, hint, email)
      setShowChange(false)
      window.alert('✅ 密碼已更新')
    } catch (e) {
      setErr('儲存失敗：' + e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <RuleSection
      icon="🔐"
      title="登入密碼"
      description="修改密碼或更新找回密碼的信箱。鎖屏快捷按鈕請至「首頁」使用。"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── 修改密碼 ── */}
        <div className="bg-gray-50 rounded-xl p-4 md:col-span-2">
          {!showChange ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">登入密碼</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  提示：<span className="font-mono">{config.prefs.passwordHint || '（未設定）'}</span>
                  　信箱：<span className="font-mono">{config.prefs.email || '（未設定）'}</span>
                </p>
              </div>
              <Button variant="secondary" onClick={openChange}>修改密碼</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <PWField label="目前密碼" value={oldPw} onChange={setOldPw} autoFocus />
              <PWField label="新密碼（至少 4 字元）" value={newPw} onChange={setNewPw} />
              <PWField label="再輸入新密碼一次" value={newPw2} onChange={setNewPw2} />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  信箱（用於忘記密碼時取回）
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  新提示文字（選填）
                </label>
                <input
                  type="text"
                  value={hint}
                  onChange={e => setHint(e.target.value)}
                  maxLength={40}
                  placeholder="例：你的舊家門牌號"
                  className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500"
                />
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="secondary" onClick={() => setShowChange(false)}>取消</Button>
                <Button loading={busy} disabled={busy} onClick={handleSave}>儲存新密碼</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </RuleSection>
  )
}

// 小型密碼輸入欄
const PWField: React.FC<{
  label:    string
  value:    string
  onChange: (v: string) => void
  autoFocus?: boolean
}> = ({ label, value, onChange, autoFocus }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <input
      type="password"
      value={value}
      onChange={e => onChange(e.target.value)}
      autoFocus={autoFocus}
      className="
        w-full h-9 px-3 text-sm font-mono
        bg-white border border-gray-200 rounded-lg
        focus:outline-none focus:border-brand-500
      "
    />
  </div>
)

export default SecuritySection
