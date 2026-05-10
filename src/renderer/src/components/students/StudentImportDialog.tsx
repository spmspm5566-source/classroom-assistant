/**
 * StudentImportDialog.tsx — 學生 Excel/CSV 匯入對話框
 *
 * 流程：
 *  1. 老師選檔
 *  2. 解析後預覽（顯示前 10 筆）
 *  3. 確認 → 寫入資料庫（會清空該班原有學生）
 */

import React, { useState } from 'react'
import Modal from '../shared/Modal'
import Button from '../shared/Button'
import { readStudentsFromFile, type ImportedStudent } from '../../utils/excel'
import { bulkImport } from '../../db/studentRepo'

interface StudentImportDialogProps {
  open:    boolean
  onClose: () => void
  classId: string
}

const StudentImportDialog: React.FC<StudentImportDialogProps> = ({ open, onClose, classId }) => {
  const [rows, setRows]       = useState<ImportedStudent[]>([])
  const [error, setError]     = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  // ── 選檔解析 ──
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setError(null)
      const parsed = await readStudentsFromFile(file)
      if (parsed.length === 0) {
        setError('檔案中沒有讀取到任何學生資料')
        return
      }
      setRows(parsed)
    } catch (err: any) {
      setError(err.message ?? '檔案解析失敗')
      setRows([])
    }
  }

  // ── 確認匯入 ──
  const handleConfirm = async () => {
    if (rows.length === 0) return
    const ok = window.confirm(
      `確定要匯入 ${rows.length} 名學生嗎？\n` +
      `這會清空該班目前所有學生（包含分組與座位資訊），加分歷史記錄會保留。`
    )
    if (!ok) return

    setImporting(true)
    try {
      await bulkImport(classId, rows)
      handleClose()
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setRows([])
    setError(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="匯入學生名單"
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>取消</Button>
          <Button
            onClick={handleConfirm}
            disabled={rows.length === 0}
            loading={importing}
          >
            匯入 {rows.length > 0 && `(${rows.length} 筆)`}
          </Button>
        </>
      }
    >
      {/* ── 檔案說明 ── */}
      <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-900 leading-relaxed">
        <p className="font-semibold mb-1">📋 檔案格式要求</p>
        <p>第一列為標題，必須包含「<b>座號</b>」與「<b>姓名</b>」欄，可選「備註」</p>
        <p className="mt-1 font-mono text-[11px] bg-white px-2 py-1 rounded inline-block">
          座號 | 姓名 | 備註（可選）
        </p>
        <p className="mt-1">支援 .xlsx、.xls、.csv 格式</p>
      </div>

      {/* ── 選檔按鈕 ── */}
      <label className="
        flex items-center justify-center gap-2
        h-12 rounded-xl border-2 border-dashed border-gray-300
        hover:border-brand-400 hover:bg-brand-50 cursor-pointer
        text-sm text-gray-600
      ">
        <span>📁 點此選擇 Excel 或 CSV 檔</span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFile}
          className="hidden"
        />
      </label>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          ❌ {error}
        </div>
      )}

      {/* ── 預覽 ── */}
      {rows.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-gray-500 mb-2">
            ✓ 已讀取 {rows.length} 筆，預覽前 10 筆：
          </p>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">座號</th>
                  <th className="px-3 py-2 text-left font-medium">姓名</th>
                  <th className="px-3 py-2 text-left font-medium">備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5">{r.seatNo}</td>
                    <td className="px-3 py-1.5">{r.name}</td>
                    <td className="px-3 py-1.5 text-gray-500">{r.remarks ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 10 && (
            <p className="mt-2 text-xs text-gray-400">…另有 {rows.length - 10} 筆未顯示</p>
          )}
        </div>
      )}
    </Modal>
  )
}

export default StudentImportDialog
