/**
 * StudentImportDialog.tsx — 學生 Excel/CSV 匯入對話框
 *
 * 流程：
 *  1. 老師選檔
 *  2. 解析後預覽（顯示前 10 筆）
 *  3. 確認 → 寫入資料庫（會清空該班原有學生）
 *
 * 支援欄位：座號 | 姓名 | 組別 | 角色 | 備註（後三欄可選）
 */

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Modal from '../shared/Modal'
import Button from '../shared/Button'
import { readStudentsFromFile, type ImportedStudent } from '../../utils/excel'
import { bulkImport } from '../../db/studentRepo'
import { listByPeriod } from '../../db/groupRepo'

interface StudentImportDialogProps {
  open:         boolean
  onClose:      () => void
  classId:      string
  examPeriodId: string | null
}

const ROLE_LABELS: Record<string, string> = {
  leader: '教練', assistant: '助教',
  memberA: '員A', memberB: '員B', memberC: '員C', memberD: '員D'
}

const StudentImportDialog: React.FC<StudentImportDialogProps> = ({
  open, onClose, classId, examPeriodId
}) => {
  const [rows, setRows]           = useState<ImportedStudent[]>([])
  const [error, setError]         = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const groups = useLiveQuery(
    () => examPeriodId ? listByPeriod(examPeriodId) : Promise.resolve([]),
    [examPeriodId],
    []
  ) ?? []

  // 是否有組別/角色資料
  const hasGroupData = rows.some(r => r.groupNumber != null)
  const hasRoleData  = rows.some(r => r.role != null)

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
      await bulkImport(classId, rows, examPeriodId ?? undefined)
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
        <p>第一列為標題，必須包含「<b>座號</b>」與「<b>姓名</b>」欄，其餘可選：</p>
        <p className="mt-1 font-mono text-[11px] bg-white px-2 py-1 rounded inline-block">
          座號 | 姓名 | 組別 | 角色 | 備註
        </p>
        <div className="mt-2 space-y-0.5">
          <p>• <b>組別</b>：填數字（1、2、3…），對應目前段考期的第幾組</p>
          <p>• <b>角色</b>：教練、助教、組員A、組員B、組員C、組員D</p>
        </div>
        <p className="mt-1">支援 .xlsx、.xls、.csv 格式</p>
        {groups.length > 0 && (
          <p className="mt-1 text-emerald-700 font-medium">
            ✓ 目前段考期有 {groups.length} 組，匯入時將自動對應組別
          </p>
        )}
        {!examPeriodId && (
          <p className="mt-1 text-amber-700">
            ⚠ 尚未選擇段考期，組別欄位將略過（匯入後需手動分組）
          </p>
        )}
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
                  {hasGroupData && <th className="px-3 py-2 text-left font-medium">組別</th>}
                  {hasRoleData  && <th className="px-3 py-2 text-left font-medium">角色</th>}
                  <th className="px-3 py-2 text-left font-medium">備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5">{r.seatNo}</td>
                    <td className="px-3 py-1.5">{r.name}</td>
                    {hasGroupData && (
                      <td className="px-3 py-1.5 text-gray-600">
                        {r.groupNumber ? `第${r.groupNumber}組` : '—'}
                      </td>
                    )}
                    {hasRoleData && (
                      <td className="px-3 py-1.5 text-gray-600">
                        {r.role ? (ROLE_LABELS[r.role] ?? r.role) : '—'}
                      </td>
                    )}
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
