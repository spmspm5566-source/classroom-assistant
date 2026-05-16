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
  listLocalClasses,
  listCloudClasses,
  uploadClasses,
  downloadClasses,
  type LocalClassInfo,
  type CloudClassInfo
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
  const signOut       = useCloudAuthStore(s => s.signOut)

  const [showLogin, setShowLogin] = React.useState(false)
  const [dialog, setDialog]       = React.useState<'up' | 'down' | null>(null)

  return (
    <div className="mt-3 bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-200 rounded-xl p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="text-2xl flex-shrink-0">☁️</div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-800">雲端備份（跨電腦／跨教室）</h4>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            <span className="font-semibold text-sky-800">每個班級各自獨立備份</span>。
            在哪台電腦只上傳那台有的班級，不會蓋掉雲端其他班級；下載也只把選的班級加回本機，
            不影響本機其他班。學生姓名等資料以密文儲存。
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
              onClick={() => signOut()}
              className="text-gray-400 hover:text-red-600"
            >
              登出
            </button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setDialog('up')}
              icon={<span>⬆️</span>}
            >
              上傳班級…
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDialog('down')}
              icon={<span>⬇️</span>}
            >
              下載班級…
            </Button>
          </div>
        </>
      )}

      {showLogin && <LoginDialog onClose={() => setShowLogin(false)} />}
      {dialog && (
        <ClassSelectDialog mode={dialog} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}

// ── 子元件：選班級上傳/下載對話框 ───────────────────────────

interface ClassRow {
  classId:   string
  className: string
  /** 上傳：學生數；下載：雲端時間字串 */
  detail:    string
}

const ClassSelectDialog: React.FC<{
  mode:    'up' | 'down'
  onClose: () => void
}> = ({ mode, onClose }) => {
  const passphrase    = useCloudAuthStore(s => s.passphrase)
  const setPassphrase = useCloudAuthStore(s => s.setPassphrase)

  const [rows, setRows]       = React.useState<ClassRow[] | null>(null)
  const [picked, setPicked]   = React.useState<Set<string>>(new Set())
  const [busy, setBusy]       = React.useState(false)
  const [err, setErr]         = React.useState<string | null>(null)

  // 載入清單
  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (mode === 'up') {
          const local = await listLocalClasses()
          if (!alive) return
          setRows(local.map((c: LocalClassInfo) => ({
            classId:   c.classId,
            className: c.className,
            detail:    `${c.students} 位學生`
          })))
        } else {
          const cloud = await listCloudClasses()
          if (!alive) return
          setRows(cloud.map((c: CloudClassInfo) => ({
            classId:   c.classId,
            className: c.className,
            detail:    `雲端 ${formatTime(c.updatedAt)}・${formatSize(c.sizeBytes)}`
          })))
        }
      } catch (e: any) {
        if (alive) setErr(e?.message ?? String(e))
      }
    })()
    return () => { alive = false }
  }, [mode])

  const ensurePassphrase = (): string | null => {
    if (passphrase) return passphrase
    const p = window.prompt('請輸入雲端帳號密碼（用於加解密，不會上傳）：')
    if (p) setPassphrase(p)
    return p || null
  }

  const allChecked = !!rows && rows.length > 0 && picked.size === rows.length
  const toggleAll = (): void => {
    if (!rows) return
    setPicked(allChecked ? new Set() : new Set(rows.map(r => r.classId)))
  }
  const toggleOne = (id: string): void => {
    setPicked(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const handleConfirm = async (): Promise<void> => {
    if (picked.size === 0) { setErr('請至少選一個班級'); return }
    const p = ensurePassphrase()
    if (!p) return
    const ids = [...picked]
    setBusy(true)
    setErr(null)
    try {
      if (mode === 'up') {
        const r = await uploadClasses(ids, p)
        const okMsg = r.uploaded.map(u => `・${u.className}（${formatSize(u.sizeBytes)}）`).join('\n')
        const failMsg = r.failed.length
          ? `\n\n失敗：\n` + r.failed.map(f => `・${f.className}：${f.error}`).join('\n')
          : ''
        window.alert(`✅ 已上傳 ${r.uploaded.length} 個班級：\n${okMsg}${failMsg}`)
        onClose()
      } else {
        if (!window.confirm(
          `將下載 ${ids.length} 個班級並覆蓋本機這些班的資料\n` +
          `（本機其他班級不受影響）。要繼續嗎？`
        )) { setBusy(false); return }
        const r = await downloadClasses(ids, p)
        const okMsg = r.restored.map(x =>
          `・${x.className}（學生 ${x.counts.students}、加分 ${x.counts.scoreEvents}）`
        ).join('\n')
        const failMsg = r.failed.length
          ? `\n\n失敗：\n` + r.failed.map(f => `・${f.className}：${f.error}`).join('\n')
          : ''
        window.alert(
          `✅ 已下載 ${r.restored.length} 個班級：\n${okMsg}${failMsg}\n\n按「確定」後 App 會重新整理。`
        )
        location.reload()
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-800">
            {mode === 'up' ? '⬆️ 選擇要上傳的班級' : '⬇️ 選擇要下載的班級'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
          {mode === 'up'
            ? '只會更新雲端「所選班級」那幾筆，雲端其他班級備份不會被動到。'
            : '只會覆蓋本機「所選班級」，本機其他班級保持不變。'}
        </p>

        {err && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-3">
            ⚠ {err}
          </p>
        )}

        {rows === null ? (
          <p className="text-xs text-gray-400 py-6 text-center">載入清單中…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 text-center">
            {mode === 'up' ? '本機沒有班級' : '雲端尚無任何班級備份'}
          </p>
        ) : (
          <>
            <label className="flex items-center gap-2 px-2 py-2 border-b border-gray-100 cursor-pointer">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-4 h-4" />
              <span className="text-sm font-semibold text-gray-700">全選（{rows.length} 班）</span>
            </label>
            <div className="overflow-y-auto flex-1 -mx-1 px-1">
              {rows.map(r => (
                <label
                  key={r.classId}
                  className="flex items-center gap-2 px-2 py-2.5 hover:bg-gray-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={picked.has(r.classId)}
                    onChange={() => toggleOne(r.classId)}
                    className="w-4 h-4"
                  />
                  <span className="flex-1 text-sm font-medium text-gray-800">{r.className}</span>
                  <span className="text-[11px] text-gray-400">{r.detail}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end mt-4 pt-3 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || !rows || rows.length === 0}
            className={`h-10 px-4 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${
              mode === 'up' ? 'bg-brand-600 hover:bg-brand-700' : 'bg-sky-600 hover:bg-sky-700'
            }`}
          >
            {busy
              ? '處理中…'
              : mode === 'up'
                ? `上傳所選（${picked.size}）`
                : `下載所選（${picked.size}）`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BackupSection
