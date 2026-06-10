/**
 * ExportPage.tsx — Excel 匯出設定頁
 *
 * 提供兩種匯出格式（對應 excelExport.ts）：
 *
 *  1. 段考期小組加分表（依老師提供的圖三格式）
 *     - 預設用「目前段考期」，可切換為其他段考期
 *     - 每組一張工作表
 *
 *  2. 加分明細表（所有 ScoreEvent）
 *     - 可選依段考期或全期間匯出
 *
 * 注意：需要先選班級+段考期才能匯出。
 */

import React from 'react'
import { useLiveQuery }     from 'dexie-react-hooks'
import { db }               from '../db/schema'
import type { ScoreEvent }  from '../db/schema'
import { useAppStore }      from '../store/useAppStore'
import { useScopedStudents } from '../hooks/useScopedStudents'
import { listByPeriod }     from '../db/groupRepo'
import { listByClass as listPeriods } from '../db/examPeriodRepo'
import {
  exportWeeklyGroupSheet,
  exportScoreLog
}                           from '../utils/excelExport'
import { exportBackup, importBackup, backupFileName } from '../db/backupRepo'
import { isElectron }       from '../utils/platform'
import {
  uploadBackup   as driveUpload,
  listBackups    as driveList,
  downloadBackup as driveDownload,
  deleteBackup   as driveDelete,
  type DriveFile
} from '../utils/googleDrive'
import Button               from '../components/shared/Button'
import RuleSection          from '../components/rules/RuleSection'

// ── 主元件 ───────────────────────────────────────────────────

const ExportPage: React.FC = () => {
  const classId       = useAppStore(s => s.currentClassId)
  const currentPeriod = useAppStore(s => s.currentExamPeriodId)

  const [selectedPeriodId, setSelectedPeriodId] = React.useState<string | null>(currentPeriod)
  const [weeksCount,  setWeeksCount]  = React.useState(8)
  const [exporting1,  setExporting1]  = React.useState(false)
  const [exporting2,  setExporting2]  = React.useState(false)
  const [logScope, setLogScope]       = React.useState<'period' | 'all'>('period')
  const [backingUp,   setBackingUp]   = React.useState(false)
  const [restoring,   setRestoring]   = React.useState(false)
  const [backupMsg,   setBackupMsg]   = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // ── Google Drive 狀態 ──
  const [gdConnected,   setGdConnected]   = React.useState(false)
  const [gdFiles,       setGdFiles]       = React.useState<DriveFile[]>([])
  const [gdMsg,         setGdMsg]         = React.useState<string | null>(null)
  const [gdLoading,     setGdLoading]     = React.useState(false)

  // 初始化：讀取連線狀態
  React.useEffect(() => {
    if (!isElectron() || !window.electronAPI) return
    window.electronAPI.googleIsConnected().then(v => setGdConnected(v))
  }, [])

  // 連線狀態改變時重新載入備份清單
  React.useEffect(() => {
    if (!gdConnected) { setGdFiles([]); return }
    loadDriveFiles()
  }, [gdConnected])

  const loadDriveFiles = async () => {
    if (!window.electronAPI) return
    const token = await window.electronAPI!.googleGetToken()
    if (!token) return
    const files = await window.electronAPI!.googleDriveList(token)
    setGdFiles(files)
  }

  const handleGdConnect = async () => {
    if (!window.electronAPI) return
    setGdLoading(true); setGdMsg(null)
    const res = await window.electronAPI.googleStartAuth()
    if (res.ok) {
      setGdConnected(true)
      setGdMsg('✅ 連線成功！')
    } else {
      setGdMsg(`❌ 授權失敗：${res.error ?? ''}`)
    }
    setGdLoading(false)
  }

  const handleGdDisconnect = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.googleDisconnect()
    setGdConnected(false)
    setGdMsg('已中斷 Google 連線')
  }

  const handleGdBackup = async () => {
    if (!window.electronAPI) return
    setGdLoading(true); setGdMsg(null)
    try {
      const token = await window.electronAPI.googleGetToken()
      if (!token) { setGdMsg('❌ 尚未連線，請先授權'); setGdLoading(false); return }
      const json = await exportBackup()
      const res  = await window.electronAPI!.googleDriveUpload(token, json, backupFileName())
      if (res.ok) {
        setGdMsg('✅ 備份成功上傳到 Google 雲端硬碟')
        await loadDriveFiles()
      } else {
        setGdMsg(`❌ 上傳失敗：${res.error ?? ''}`)
      }
    } catch (e) {
      setGdMsg('❌ ' + String(e))
    }
    setGdLoading(false)
  }

  const handleGdRestore = async (file: DriveFile) => {
    if (!window.electronAPI) return
    const confirmed = window.confirm(
      `⚠ 從 Google 雲端還原「${file.name}」\n將清除目前所有資料，確定繼續嗎？`
    )
    if (!confirmed) return
    setGdLoading(true); setGdMsg(null)
    try {
      const token = await window.electronAPI!.googleGetToken()
      if (!token) { setGdMsg('❌ 無法取得 token'); setGdLoading(false); return }
      const res = await window.electronAPI!.googleDriveDownload(token, file.id)
      if (!res.ok || !res.content) { setGdMsg('❌ 下載失敗'); setGdLoading(false); return }
      await importBackup(res.content)
      setGdMsg('✅ 還原成功！頁面即將重新載入…')
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setGdMsg('❌ ' + String(e))
    }
    setGdLoading(false)
  }

  const handleGdDelete = async (file: DriveFile) => {
    if (!window.electronAPI) return
    if (!window.confirm(`刪除備份「${file.name}」？`)) return
    const token = await window.electronAPI!.googleGetToken()
    if (!token) return
    await window.electronAPI!.googleDriveDelete(token, file.id)
    await loadDriveFiles()
  }

  // 同步預設選擇
  React.useEffect(() => {
    if (!selectedPeriodId && currentPeriod) setSelectedPeriodId(currentPeriod)
  }, [currentPeriod, selectedPeriodId])

  // ── DB 資料 ──
  const cls = useLiveQuery(
    () => classId ? db.classes.get(classId) : undefined,
    [classId]
  )

  const periods = useLiveQuery(
    () => classId ? listPeriods(classId) : Promise.resolve([]),
    [classId], []
  ) ?? []

  const groups = useLiveQuery(
    () => selectedPeriodId ? listByPeriod(selectedPeriodId) : Promise.resolve([]),
    [selectedPeriodId], []
  ) ?? []

  // 學生（已合併「所選段考期」的分組指派，週小組表才會抓到該期分組）
  const students = useScopedStudents(classId, selectedPeriodId)

  // 取得「該段考期內」所有事件
  const periodEvents: ScoreEvent[] = useLiveQuery(
    async (): Promise<ScoreEvent[]> => {
      if (!classId || !selectedPeriodId) return []
      return db.scoreEvents
        .where('[classId+examPeriodId]').equals([classId, selectedPeriodId])
        .toArray()
    },
    [classId, selectedPeriodId]
  ) ?? []

  // 取得「全期間」所有事件
  const allEvents: ScoreEvent[] = useLiveQuery(
    async (): Promise<ScoreEvent[]> => {
      if (!classId) return []
      return db.scoreEvents.where('classId').equals(classId).toArray()
    },
    [classId]
  ) ?? []

  // ── 無班級 ──
  if (!classId || !cls) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-center">
        <div className="text-5xl mb-4">📥</div>
        <p className="text-gray-500 text-sm">請先在標題列選擇班級，才能使用匯出功能。</p>
      </div>
    )
  }

  const selectedPeriod = periods.find(p => p.id === selectedPeriodId)

  // ── 匯出 1：段考期小組加分表 ──
  const handleExportWeekly = async () => {
    if (!selectedPeriod) {
      window.alert('請先選擇要匯出的段考期。')
      return
    }
    if (groups.length === 0) {
      window.alert('此段考期尚無小組資料。')
      return
    }
    setExporting1(true)
    try {
      await exportWeeklyGroupSheet({
        cls,
        groups,
        students,
        events:     periodEvents,
        weeksCount,
        examNumber: selectedPeriod.number,
        fileName:   `${selectedPeriod.name}_${cls.name}班_小組加分表.xlsx`
      })
    } catch (e) {
      console.error(e)
      window.alert('匯出失敗：' + String(e))
    } finally {
      setExporting1(false)
    }
  }

  // ── 匯出 2：加分明細 ──
  const handleExportLog = async () => {
    const evs = logScope === 'period' ? periodEvents : allEvents
    if (evs.length === 0) {
      window.alert(logScope === 'period'
        ? '此段考期尚無加分記錄。'
        : '此班級尚無任何加分記錄。')
      return
    }
    setExporting2(true)
    try {
      await exportScoreLog({
        cls,
        students,
        events: evs,
        fileName: logScope === 'period' && selectedPeriod
          ? `加分明細_${selectedPeriod.name}_${cls.name}班.xlsx`
          : `加分明細_全期間_${cls.name}班.xlsx`
      })
    } catch (e) {
      console.error(e)
      window.alert('匯出失敗：' + String(e))
    } finally {
      setExporting2(false)
    }
  }

  // ── 備份：匯出整包 JSON ──
  const handleBackup = async () => {
    setBackingUp(true)
    setBackupMsg(null)
    try {
      const json = await exportBackup()
      const fileName = backupFileName()

      if (isElectron() && window.electronAPI?.backupSave) {
        // Electron：用系統儲存對話框
        const res = await window.electronAPI.backupSave(json, fileName)
        if (res.ok) {
          setBackupMsg(`✅ 已儲存至：${res.filePath}`)
        } else if (res.error) {
          setBackupMsg(`❌ 儲存失敗：${res.error}`)
        }
      } else {
        // Web：觸發瀏覽器下載
        const blob = new Blob([json], { type: 'application/json' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
        setBackupMsg('✅ 備份已下載')
      }
    } catch (e) {
      setBackupMsg('❌ 備份失敗：' + String(e))
    } finally {
      setBackingUp(false)
    }
  }

  // ── 還原：從 JSON 匯入 ──
  const handleRestore = async (jsonStr: string) => {
    const confirmed = window.confirm(
      '⚠ 還原將清除目前所有資料並以備份覆蓋。\n\n確定要繼續嗎？'
    )
    if (!confirmed) return

    setRestoring(true)
    setBackupMsg(null)
    try {
      await importBackup(jsonStr)
      setBackupMsg('✅ 還原成功！頁面即將重新載入…')
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setBackupMsg('❌ 還原失敗：' + String(e))
    } finally {
      setRestoring(false)
    }
  }

  const handleRestoreClick = async () => {
    if (isElectron() && window.electronAPI?.backupOpen) {
      // Electron：用系統開啟對話框
      const res = await window.electronAPI.backupOpen()
      if (res.ok && res.content) await handleRestore(res.content)
    } else {
      // Web：觸發 file input
      fileInputRef.current?.click()
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    e.target.value = ''
    await handleRestore(text)
  }

  return (
    <div className="p-8 max-w-3xl">

      {/* ── 標題 ── */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-800">📥 匯出 Excel</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          目前班級：<span className="font-medium text-gray-700">{cls.grade} 年 {cls.name} 班</span>
          ／共 {periods.length} 期段考、{students.length} 名學生
        </p>
      </div>

      {/* ── 段考期選擇 ── */}
      <RuleSection
        icon="📅"
        title="選擇段考期"
        description="不同段考期會有獨立的小組分組與分數統計。匯出時只會包含該期間的資料。"
      >
        {periods.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            ⚠ 此班尚無段考期，請先在標題列建立。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {periods.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPeriodId(p.id)}
                className={`
                  h-10 px-4 rounded-lg text-sm font-semibold transition-all
                  ${selectedPeriodId === p.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-400'}
                `}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </RuleSection>

      {/* ── 格式 1：段考期小組加分表 ── */}
      <RuleSection
        icon="📋"
        title="格式一：段考期小組加分表"
        description="依您提供的圖三格式，每組一張工作表，欄為週次，列為角色（組長/助教/員A~D）。適合學期末向學校繳交。"
      >
        {/* 選項 */}
        <div className="bg-gray-50 rounded-xl p-4 mb-5">
          <p className="text-xs text-gray-500 mb-2">匯出最近幾週（週一~週日）</p>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={2} max={20} step={1}
              value={weeksCount}
              onChange={e => setWeeksCount(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm font-bold text-gray-700 w-12 text-center">
              {weeksCount} 週
            </span>
          </div>
        </div>

        {/* 預覽說明 */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
          <p className="text-xs text-blue-700 font-medium mb-1">📌 匯出內容預覽</p>
          <ul className="text-xs text-blue-600 space-y-0.5 list-disc list-inside">
            <li>段考期：{selectedPeriod?.name ?? '—'}</li>
            <li>工作表數：{groups.length} 張（每組一張）</li>
            <li>週次範圍：最近 {weeksCount} 週</li>
            <li>包含資料：{periodEvents.length} 筆加分記錄</li>
            <li>每週名次：依各組該週加分總和，分數低者排第 1 名</li>
          </ul>
        </div>

        <Button
          variant="primary"
          loading={exporting1}
          disabled={exporting1 || !selectedPeriod || groups.length === 0}
          onClick={handleExportWeekly}
          icon={<span>⬇️</span>}
        >
          {!selectedPeriod ? '請先選擇段考期'
            : groups.length === 0 ? '尚無小組資料'
            : '下載段考期小組加分表'}
        </Button>
      </RuleSection>

      {/* ── 格式 2：加分明細 ── */}
      <RuleSection
        icon="📃"
        title="格式二：加分明細表"
        description="將所有加分扣分記錄逐筆列出，包含時間、座號、姓名、事件類型、分數、備註，適合對帳或備查。"
      >
        {/* 範圍選擇 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setLogScope('period')}
            className={`
              flex-1 h-10 rounded-lg text-sm font-semibold transition-all
              ${logScope === 'period'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-400'}
            `}
          >
            僅本段考期（{periodEvents.length} 筆）
          </button>
          <button
            onClick={() => setLogScope('all')}
            className={`
              flex-1 h-10 rounded-lg text-sm font-semibold transition-all
              ${logScope === 'all'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-400'}
            `}
          >
            全期間（{allEvents.length} 筆）
          </button>
        </div>

        <Button
          variant="secondary"
          loading={exporting2}
          disabled={exporting2 || (logScope === 'period' ? periodEvents.length === 0 : allEvents.length === 0)}
          onClick={handleExportLog}
          icon={<span>⬇️</span>}
        >
          下載加分明細表
        </Button>
      </RuleSection>

      {/* ── 提示 ── */}
      <div className="mt-2 bg-amber-50 border border-amber-100 rounded-xl p-4">
        <p className="text-xs text-amber-700">
          <span className="font-semibold">💡 提示：</span>
          每段考期都有獨立的小組分組與分數統計。如果想看不同段考期的競賽名次，
          請到「加分總覽」頁切換段考期；或於本頁切換上方的「段考期」按鈕後再下載。
        </p>
      </div>

      {/* ── 格式 3：整包資料備份 / 還原 ── */}
      <RuleSection
        icon="💾"
        title="整包資料備份 / 還原"
        description="將全部班級、學生、分組、加分記錄儲存成一個 JSON 備份檔。換電腦或學校電腦重灌後可一鍵還原。"
      >
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
          <span className="font-semibold">⚠ 注意：</span>
          還原時會清除目前所有資料，請確認備份檔正確後再操作。
        </div>

        <div className="flex gap-3 flex-wrap">
          <Button
            variant="primary"
            loading={backingUp}
            disabled={backingUp || restoring}
            onClick={handleBackup}
            icon={<span>💾</span>}
          >
            匯出整包備份
          </Button>

          <Button
            variant="secondary"
            loading={restoring}
            disabled={backingUp || restoring}
            onClick={handleRestoreClick}
            icon={<span>📂</span>}
          >
            從備份還原
          </Button>
        </div>

        {/* Web 模式隱藏的 file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* 操作結果提示 */}
        {backupMsg && (
          <p className={`mt-3 text-sm font-medium ${backupMsg.startsWith('✅') ? 'text-green-700' : 'text-red-600'}`}>
            {backupMsg}
          </p>
        )}
      </RuleSection>

      {/* ── 提示 ── */}
      <div className="mt-2 bg-amber-50 border border-amber-100 rounded-xl p-4">
        <p className="text-xs text-amber-700">
          <span className="font-semibold">💡 提示：</span>
          每段考期都有獨立的小組分組與分數統計。如果想看不同段考期的競賽名次，
          請到「加分總覽」頁切換段考期；或於本頁切換上方的「段考期」按鈕後再下載。
        </p>
      </div>

      {/* ── Google Drive 雲端備份（僅 Electron）── */}
      {isElectron() && (
        <RuleSection
          icon="☁"
          title="Google 雲端硬碟備份"
          description="自動上傳備份到 Google Drive，在任何裝置登入 Google 帳號後可還原。"
        >
          {!gdConnected && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                用自己的 Google 帳號授權，備份會存到你個人的 Google Drive。
              </p>
              <Button
                variant="primary"
                loading={gdLoading}
                disabled={gdLoading}
                onClick={handleGdConnect}
                icon={<span>🔗</span>}
              >
                連線 Google（開啟瀏覽器授權）
              </Button>
            </div>
          )}

          {gdConnected && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-green-700 font-medium">✅ 已連線 Google 帳號</span>
                <Button
                  variant="primary"
                  loading={gdLoading}
                  disabled={gdLoading}
                  onClick={handleGdBackup}
                  icon={<span>☁</span>}
                >
                  立即備份到 Google Drive
                </Button>
                <button
                  onClick={handleGdDisconnect}
                  className="text-xs text-gray-400 hover:text-red-500 underline"
                >
                  中斷連線
                </button>
              </div>

              {gdFiles.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <p className="text-xs font-semibold text-gray-500 px-4 py-2 bg-gray-50">
                    雲端備份清單（點「還原」可下載套用）
                  </p>
                  {gdFiles.map(f => (
                    <div key={f.id} className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 hover:bg-gray-50">
                      <div>
                        <p className="text-sm text-gray-700">{f.name}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(f.modifiedTime).toLocaleString('zh-TW')}
                          {f.size ? `・${(Number(f.size) / 1024).toFixed(1)} KB` : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleGdRestore(f)}
                          className="text-xs bg-brand-600 text-white px-3 py-1 rounded-lg hover:bg-brand-700"
                        >
                          還原
                        </button>
                        <button
                          onClick={() => handleGdDelete(f)}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50"
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {gdFiles.length === 0 && !gdLoading && (
                <p className="text-xs text-gray-400">雲端尚無備份，點「立即備份」上傳第一份。</p>
              )}
            </div>
          )}

          {gdMsg && (
            <p className={`mt-2 text-sm font-medium ${
              gdMsg.startsWith('✅') ? 'text-green-700'
              : gdMsg.startsWith('❌') ? 'text-red-600'
              : 'text-gray-600'
            }`}>
              {gdMsg}
            </p>
          )}
        </RuleSection>
      )}

      <div className="h-6" />
    </div>
  )
}

export default ExportPage
