/**
 * BackupSection.tsx — 資料備份 / 還原（嵌在規則頁）
 *
 * 為什麼這個功能存在：
 *  - 學校電腦 C 槽每次開機還原 → 已用 D 槽 userData 解決
 *  - 換電腦、換瀏覽器、IndexedDB 損毀 → 需要這個 JSON 備份救命
 *
 * 三種範圍各自獨立匯出/匯入：
 *  📦 完整備份         — 含所有資料 + 系統設定（密碼、規則、語料庫）
 *  👥 學生分組與角色  — 只含班級、學生、分組、段考期
 *  📊 加分與考試成績  — 只含加分事件、考試、考試成績
 *
 * 匯入是「覆蓋」模式：對應資料表會先清空再還原。
 * 操作完會 location.reload() 確保所有 useLiveQuery 拿到新資料。
 */

import React from 'react'
import RuleSection from './RuleSection'
import Button      from '../shared/Button'
import {
  exportToFile,
  importFromFile,
  formatRestoredSummary,
  type BackupScope
} from '../../utils/backup'
import { useCloudAuthStore } from '../../store/useCloudAuthStore'
import {
  uploadBackup,
  downloadBackup,
  getCloudMeta
} from '../../utils/cloudBackup'
import LoginDialog from '../cloud/LoginDialog'

interface ScopeMeta {
  scope:       BackupScope
  icon:        string
  title:       string
  description: string
  warn:        string
}

const SCOPES: ScopeMeta[] = [
  {
    scope:       'full',
    icon:        '📦',
    title:       '完整備份',
    description: '所有資料 + 系統設定（含密碼、規則、語料庫）。換電腦時最方便。',
    warn:        '匯入會覆蓋目前所有資料，包含密碼。'
  },
  {
    scope:       'roster',
    icon:        '👥',
    title:       '學生分組與角色',
    description: '只包含班級、學生名單、分組、段考期。加分記錄、考試成績不會匯出。',
    warn:        '匯入會覆蓋目前所有班級、學生與分組；加分歷史不受影響。'
  },
  {
    scope:       'scoring',
    icon:        '📊',
    title:       '加分與考試成績',
    description: '只包含加分事件、考試與分數。班級／學生／分組不會匯出（需另用「分組與角色」備份）。',
    warn:        '匯入會覆蓋目前所有加分事件與考試；班級／學生不受影響。'
  }
]

const BackupSection: React.FC = () => {
  return (
    <RuleSection
      icon="💾"
      title="資料備份／還原"
      description="把資料匯出成 JSON 檔保存到雲端硬碟或隨身碟。換電腦、學校電腦被還原、資料庫損壞時用來救回。"
    >
      <div className="space-y-3">
        {SCOPES.map(m => <ScopeRow key={m.scope} meta={m} />)}
      </div>

      {/* ── 雲端備份 ── */}
      <CloudBackupCard />

      {/* 使用建議 */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 leading-relaxed">
        <p className="font-semibold mb-1">💡 建議備份頻率</p>
        <ul className="list-disc list-inside space-y-0.5 ml-1">
          <li>每週一次「完整備份」存到 Google Drive / OneDrive 或隨身碟</li>
          <li>每次大考結束後做「加分與考試成績」備份</li>
          <li>換新電腦前先做「完整備份」，新電腦匯入即可無縫接續</li>
        </ul>
      </div>
    </RuleSection>
  )
}

// ── 子元件：單一範圍的一列 ───────────────────────────────────

const ScopeRow: React.FC<{ meta: ScopeMeta }> = ({ meta }) => {
  const [busy, setBusy] = React.useState<'export' | 'import' | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // ── 匯出 ──
  const handleExport = async (): Promise<void> => {
    setBusy('export')
    try {
      const filename = await exportToFile(meta.scope)
      window.alert(`✅ 已下載：${filename}`)
    } catch (e) {
      console.error(e)
      window.alert('匯出失敗：' + e)
    } finally {
      setBusy(null)
    }
  }

  // ── 匯入 ──
  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return

    const ok = window.confirm(
      `準備從「${file.name}」還原資料。\n\n` +
      `⚠ ${meta.warn}\n\n` +
      `要繼續嗎？（建議先匯出當前資料當保險）`
    )
    if (!ok) {
      e.target.value = ''
      return
    }

    setBusy('import')
    try {
      const result = await importFromFile(file)
      const summary = formatRestoredSummary(result)
      window.alert(
        `✅ 還原完成！\n\n${summary}\n\n` +
        `按下「確定」後 App 會重新整理以套用新資料。`
      )
      // 重新整理讓所有 useLiveQuery 拿到新資料
      location.reload()
    } catch (e: any) {
      console.error(e)
      window.alert('❌ 還原失敗：\n\n' + (e?.message ?? String(e)))
    } finally {
      setBusy(null)
      e.target.value = ''
    }
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      {/* 標題列 */}
      <div className="flex items-start gap-3 mb-3">
        <div className="text-2xl flex-shrink-0">{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-800">{meta.title}</h4>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{meta.description}</p>
        </div>
      </div>

      {/* 按鈕區 */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={busy === 'export'}
          disabled={busy !== null}
          onClick={handleExport}
          icon={<span>⬇️</span>}
        >
          匯出 JSON
        </Button>

        <Button
          variant="secondary"
          size="sm"
          loading={busy === 'import'}
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
          icon={<span>⬆️</span>}
        >
          從 JSON 還原
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChosen}
          className="hidden"
        />
      </div>
    </div>
  )
}

// ── 子元件：雲端備份卡片 ─────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return iso
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const CloudBackupCard: React.FC = () => {
  const user          = useCloudAuthStore(s => s.user)
  const loading       = useCloudAuthStore(s => s.loading)
  const passphrase    = useCloudAuthStore(s => s.passphrase)
  const setPassphrase = useCloudAuthStore(s => s.setPassphrase)
  const signOut       = useCloudAuthStore(s => s.signOut)

  const [showLogin, setShowLogin] = React.useState(false)
  const [busy, setBusy]           = React.useState<'up' | 'down' | null>(null)
  const [meta, setMeta]           = React.useState<{ updatedAt: string; sizeBytes: number } | null>(null)

  // 登入後抓雲端備份狀態
  const refreshMeta = React.useCallback(async () => {
    if (!user) { setMeta(null); return }
    try {
      setMeta(await getCloudMeta())
    } catch {
      setMeta(null)
    }
  }, [user])

  React.useEffect(() => { refreshMeta() }, [refreshMeta])

  // 取得通行碼：記憶體沒有就請使用者輸入（重整後會發生）
  const ensurePassphrase = (): string | null => {
    if (passphrase) return passphrase
    const p = window.prompt(
      '請輸入雲端帳號密碼（用於加解密備份，不會上傳）：'
    )
    if (p) setPassphrase(p)
    return p || null
  }

  const handleUpload = async (): Promise<void> => {
    const p = ensurePassphrase()
    if (!p) return
    if (!window.confirm('將把目前本機所有資料加密後上傳，覆蓋雲端上一份備份。要繼續嗎？')) return
    setBusy('up')
    try {
      const r = await uploadBackup(p)
      await refreshMeta()
      window.alert(`✅ 已上傳到雲端\n\n時間：${formatTime(r.updatedAt)}\n大小：${formatSize(r.sizeBytes)}`)
    } catch (e: any) {
      console.error(e)
      window.alert('❌ 上傳失敗：\n\n' + (e?.message ?? String(e)))
    } finally {
      setBusy(null)
    }
  }

  const handleDownload = async (): Promise<void> => {
    const p = ensurePassphrase()
    if (!p) return
    if (!window.confirm(
      '⚠ 將用雲端備份「覆蓋」本機目前所有資料（班級、學生、加分、成績、設定）。\n\n' +
      '建議先做一次本機完整備份。要繼續嗎？'
    )) return
    setBusy('down')
    try {
      const r = await downloadBackup(p)
      const summary = formatRestoredSummary({ scope: 'full', restored: r.restored })
      window.alert(
        `✅ 已從雲端還原！\n\n${summary}\n\n備份時間：${formatTime(r.updatedAt)}\n\n按「確定」後 App 會重新整理。`
      )
      location.reload()
    } catch (e: any) {
      console.error(e)
      window.alert('❌ 下載失敗：\n\n' + (e?.message ?? String(e)))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-3 bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-200 rounded-xl p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="text-2xl flex-shrink-0">☁️</div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-800">雲端備份（跨電腦／跨教室）</h4>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            登入帳號後一鍵把資料加密上傳。換電腦只要登入同一帳號即可下載還原，學生姓名等資料以密文儲存。
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">載入中…</p>
      ) : !user ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowLogin(true)}
          icon={<span>🔑</span>}
        >
          登入 / 註冊雲端帳號
        </Button>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="text-gray-600">
              帳號：<span className="font-semibold text-gray-800">{user.email}</span>
            </span>
            <button
              onClick={async () => { await signOut(); setMeta(null) }}
              className="text-gray-400 hover:text-red-600"
            >
              登出
            </button>
          </div>

          <p className="text-[11px] text-gray-500 mb-3">
            {meta
              ? `雲端最近備份：${formatTime(meta.updatedAt)}（${formatSize(meta.sizeBytes)}）`
              : '雲端尚無備份'}
          </p>

          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={busy === 'up'}
              disabled={busy !== null}
              onClick={handleUpload}
              icon={<span>⬆️</span>}
            >
              上傳到雲端
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'down'}
              disabled={busy !== null || !meta}
              onClick={handleDownload}
              icon={<span>⬇️</span>}
            >
              從雲端下載
            </Button>
          </div>
        </>
      )}

      {showLogin && <LoginDialog onClose={() => setShowLogin(false)} />}
    </div>
  )
}

export default BackupSection
