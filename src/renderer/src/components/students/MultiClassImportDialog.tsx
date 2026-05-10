/**
 * MultiClassImportDialog.tsx — 多班一次匯入對話框
 *
 * 用法：教師把所有任教班級的學生名單放在「同一個 Excel 檔」，
 * 各分頁名稱用班級名稱（203、208、301…），一次匯入所有班級。
 *
 * 流程：
 *  1. 老師選檔
 *  2. 系統讀取所有工作表
 *  3. 顯示對照表：每個工作表 → 對應班級（既有 / 將新建）
 *  4. 老師可調整每行的「年級」與「動作」（建立 / 更新 / 略過）
 *  5. 確認後批次寫入：建立缺少的班級 + 為每班 bulkImport 學生
 */

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Modal from '../shared/Modal'
import Button from '../shared/Button'
import {
  readMultiClassFromFile,
  type ImportedClassSheet
} from '../../utils/excel'
import { bulkImport } from '../../db/studentRepo'
import { listClasses, createClassWithFirstPeriod } from '../../db/classRepo'
import type { Class } from '../../db/schema'

interface Props {
  open:    boolean
  onClose: () => void
}

type RowAction = 'update' | 'create' | 'skip'

interface PreviewRow {
  sheet:        ImportedClassSheet
  /** 對應的既有班級（若有） */
  matchedClass: Class | undefined
  /** 使用者選擇的動作 */
  action:       RowAction
  /** 使用者調整後的年級（僅 create 用） */
  grade:        number
  /** 使用者調整後的學期（僅 create 用） */
  semester:     string
}

const MultiClassImportDialog: React.FC<Props> = ({ open, onClose }) => {
  const existingClasses = useLiveQuery(() => listClasses(), [], []) ?? []

  const [rows, setRows]         = useState<PreviewRow[]>([])
  const [error, setError]       = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult]     = useState<string | null>(null)

  // ── 選檔解析 ──
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setResult(null)

    try {
      const sheets = await readMultiClassFromFile(file)
      if (sheets.length === 0) {
        setError('檔案中沒有讀取到任何工作表')
        return
      }

      // 建立預覽列：自動對應到既有班級（依名稱）
      const previewRows: PreviewRow[] = sheets.map(sh => {
        const matched = existingClasses.find(c => c.name === sh.className)
        return {
          sheet:        sh,
          matchedClass: matched,
          action:       sh.error ? 'skip' : (matched ? 'update' : 'create'),
          grade:        matched?.grade ?? sh.grade,
          semester:     matched?.semester ?? '115-1'
        }
      })
      setRows(previewRows)
    } catch (err: any) {
      setError(err.message ?? '檔案解析失敗')
      setRows([])
    }
    // 清空 input，讓使用者可以重新選同一檔
    e.target.value = ''
  }

  // ── 修改某列設定 ──
  const updateRow = (idx: number, patch: Partial<PreviewRow>) => {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  // ── 確認匯入 ──
  const handleConfirm = async () => {
    const valid = rows.filter(r => r.action !== 'skip' && !r.sheet.error)
    if (valid.length === 0) {
      window.alert('沒有可匯入的工作表')
      return
    }

    const summary = valid.map(r => {
      if (r.action === 'create') {
        return `・建立 ${r.grade}年${r.sheet.className}班（${r.sheet.students.length} 人）`
      }
      return `・更新 ${r.matchedClass!.grade}年${r.matchedClass!.name}班（${r.sheet.students.length} 人，原有名單會清空）`
    }).join('\n')

    const ok = window.confirm(
      `將執行下列動作：\n\n${summary}\n\n` +
      `「更新」會清空該班原本的學生名單（含分組與座位），加分歷史保留。\n確定繼續嗎？`
    )
    if (!ok) return

    setImporting(true)
    let created = 0, updated = 0
    try {
      for (const r of valid) {
        if (r.action === 'create') {
          const { cls } = await createClassWithFirstPeriod({
            name:     r.sheet.className,
            grade:    r.grade,
            semester: r.semester,
            rows:     6,
            cols:     6
          })
          await bulkImport(cls.id, r.sheet.students)
          created++
        } else if (r.action === 'update' && r.matchedClass) {
          await bulkImport(r.matchedClass.id, r.sheet.students)
          updated++
        }
      }
      setResult(`✅ 完成：新建 ${created} 個班級、更新 ${updated} 個班級`)
      setRows([])
    } catch (e: any) {
      console.error(e)
      window.alert('匯入過程發生錯誤：' + (e?.message ?? String(e)))
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setRows([])
    setError(null)
    setResult(null)
    onClose()
  }

  // 計算可匯入筆數
  const validCount = rows.filter(r => r.action !== 'skip' && !r.sheet.error).length
  const totalStudents = rows
    .filter(r => r.action !== 'skip' && !r.sheet.error)
    .reduce((sum, r) => sum + r.sheet.students.length, 0)

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="📥 多班一次匯入"
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>關閉</Button>
          {rows.length > 0 && (
            <Button
              onClick={handleConfirm}
              disabled={validCount === 0 || importing}
              loading={importing}
            >
              匯入 {validCount > 0 && `${validCount} 班 / ${totalStudents} 人`}
            </Button>
          )}
        </>
      }
    >
      {/* ── 說明 ── */}
      <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-900 leading-relaxed">
        <p className="font-semibold mb-1">📋 檔案格式要求</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>把所有任教班級的學生名單放在<b>同一個 Excel 檔</b></li>
          <li>每個工作表（分頁）= 一個班級，分頁名稱即<b>班級名稱</b>，例：<span className="font-mono">203</span>、<span className="font-mono">208</span>、<span className="font-mono">301</span></li>
          <li>每張工作表第一列為標題：<span className="font-mono bg-white px-1.5 py-0.5 rounded">座號 | 姓名 | 備註（可選）</span></li>
          <li>系統會自動依分頁名稱第一個數字推算年級（203 → 2 年級），可在預覽表手動調整</li>
        </ul>
      </div>

      {/* ── 選檔 ── */}
      {result ? (
        <div className="mb-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
          {result}
        </div>
      ) : (
        <label className="
          flex items-center justify-center gap-2
          h-12 rounded-xl border-2 border-dashed border-gray-300
          hover:border-brand-400 hover:bg-brand-50 cursor-pointer
          text-sm text-gray-600
        ">
          <span>📁 點此選擇 Excel 檔（.xlsx / .xls）</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="hidden"
          />
        </label>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          ❌ {error}
        </div>
      )}

      {/* ── 預覽表 ── */}
      {rows.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-gray-500 mb-2">
            ✓ 共 {rows.length} 個工作表，預覽：
          </p>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">分頁</th>
                  <th className="px-2 py-2 text-left font-medium">人數</th>
                  <th className="px-2 py-2 text-left font-medium">對應班級</th>
                  <th className="px-2 py-2 text-left font-medium">年級</th>
                  <th className="px-2 py-2 text-left font-medium">學期</th>
                  <th className="px-2 py-2 text-left font-medium">動作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, idx) => (
                  <tr key={idx} className={r.sheet.error ? 'bg-red-50' : ''}>
                    <td className="px-2 py-1.5 font-mono">{r.sheet.className}</td>
                    <td className="px-2 py-1.5">{r.sheet.students.length}</td>
                    <td className="px-2 py-1.5 text-gray-600">
                      {r.sheet.error ? (
                        <span className="text-red-600">⚠ {r.sheet.error}</span>
                      ) : r.matchedClass ? (
                        <span className="text-emerald-700">
                          ✓ {r.matchedClass.grade}年{r.matchedClass.name}班
                        </span>
                      ) : (
                        <span className="text-blue-700">＋ 將新建</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={r.grade}
                        onChange={e => updateRow(idx, { grade: Number(e.target.value) })}
                        disabled={r.action !== 'create'}
                        className="
                          h-7 px-1.5 text-xs rounded-md
                          bg-white border border-gray-200
                          disabled:bg-gray-50 disabled:opacity-60
                        "
                      >
                        {[1,2,3,4,5,6,7,8,9].map(n => (
                          <option key={n} value={n}>{n} 年級</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={r.semester}
                        onChange={e => updateRow(idx, { semester: e.target.value })}
                        disabled={r.action !== 'create'}
                        className="
                          h-7 px-2 text-xs w-16 rounded-md
                          bg-white border border-gray-200
                          disabled:bg-gray-50 disabled:opacity-60
                        "
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={r.action}
                        onChange={e => updateRow(idx, { action: e.target.value as RowAction })}
                        disabled={!!r.sheet.error}
                        className="
                          h-7 px-2 text-xs rounded-md
                          bg-white border border-gray-200
                          disabled:bg-gray-50 disabled:opacity-60
                        "
                      >
                        {!r.matchedClass && (
                          <option value="create">建立新班級</option>
                        )}
                        {r.matchedClass && (
                          <option value="update">更新既有班級</option>
                        )}
                        <option value="skip">略過</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default MultiClassImportDialog
