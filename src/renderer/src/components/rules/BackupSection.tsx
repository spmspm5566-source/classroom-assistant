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

export default BackupSection
