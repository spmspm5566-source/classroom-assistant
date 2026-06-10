/**
 * StudentsPage.tsx — 學生與分組管理頁
 *
 * 三個分頁：
 *  1. 學生清單 — 列表 CRUD + Excel/CSV 匯入
 *  2. 分組概覽 — 視覺化檢視每組成員與角色
 *  3. 座位表（之後實作）
 *
 * 所有變更（分組、角色）即時寫入 Dexie，UI 透過 useLiveQuery 自動更新。
 */

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAppStore } from '../store/useAppStore'

import { createStudent, updateStudent } from '../db/studentRepo'
import { listByPeriod, ensureGroupsUpTo } from '../db/groupRepo'
import { getById as getPeriod } from '../db/examPeriodRepo'
import { getClass } from '../db/classRepo'
import { useScopedStudents } from '../hooks/useScopedStudents'
import type { Student } from '../db/schema'

import Button     from '../components/shared/Button'
import Modal      from '../components/shared/Modal'
import Input      from '../components/shared/Input'
import EmptyState from '../components/shared/EmptyState'

import StudentRow           from '../components/students/StudentRow'
import StudentImportDialog  from '../components/students/StudentImportDialog'
import GroupBoard           from '../components/students/GroupBoard'

// ── 分頁 ─────────────────────────────────────────────────────

type Tab = 'list' | 'groups'

const TABS: { value: Tab, label: string, icon: string }[] = [
  { value: 'list',   label: '學生名單', icon: '📋' },
  { value: 'groups', label: '分組座位表', icon: '👥' }
]

// ── 表單預設值 ───────────────────────────────────────────────

interface StudentForm {
  seatNo:  number
  name:    string
  remarks: string
}

const EMPTY_FORM: StudentForm = { seatNo: 0, name: '', remarks: '' }

// ── 主元件 ───────────────────────────────────────────────────

interface StudentsPageProps {
  onOpenTool?: (mode: 'timer' | 'drawer' | 'mini' | 'normal') => void
}

const StudentsPage: React.FC<StudentsPageProps> = ({ onOpenTool }) => {
  const currentClassId  = useAppStore(s => s.currentClassId)
  const currentPeriodId = useAppStore(s => s.currentExamPeriodId)
  const setCurrentPage  = useAppStore(s => s.setCurrentPage)
  const tab             = useAppStore(s => s.studentsTab)
  const setTab          = useAppStore(s => s.setStudentsTab)

  // 撈當前班級資料
  const cls      = useLiveQuery(
    () => currentClassId ? getClass(currentClassId) : Promise.resolve(undefined),
    [currentClassId]
  )
  const period   = useLiveQuery(
    () => currentPeriodId ? getPeriod(currentPeriodId) : Promise.resolve(undefined),
    [currentPeriodId]
  )
  // 學生（已合併「目前段考期」的分組指派）
  const students = useScopedStudents(currentClassId, currentPeriodId)
  // 只列出「目前段考期」的小組
  const groups   = useLiveQuery(
    () => currentPeriodId ? listByPeriod(currentPeriodId) : Promise.resolve([]),
    [currentPeriodId],
    []
  ) ?? []

  // 對話框狀態
  const [showImport, setShowImport] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing]       = useState<Student | null>(null)
  const [form, setForm]             = useState<StudentForm>(EMPTY_FORM)

  // ── 沒選班級時的引導 ──
  if (!currentClassId) {
    return (
      <div className="p-8 max-w-3xl">
        <EmptyState
          icon="🏫"
          title="請先選擇班級"
          description="尚未選擇任教班級，請先到班級管理新增。"
          action={
            <Button onClick={() => setCurrentPage('classes')}>前往班級管理</Button>
          }
        />
      </div>
    )
  }

  // ── 確保小組編號齊全（只補不刪，絕不弄丟學生分組）──
  // 必須等班級資料 cls 載入後、且 period 屬於此班，才執行，避免班級切換時
  // cls/period 短暫不一致而用錯誤的 target。只新增缺少的編號，不刪除任何組，
  // 因此即使在切換競態下執行也完全安全。
  React.useEffect(() => {
    if (!currentClassId || !currentPeriodId || !cls) return
    if (cls.id !== currentClassId) return            // cls 還是前一班的舊值 → 跳過
    if (period && period.classId !== currentClassId) return  // period 不屬於此班 → 跳過
    const target = cls.defaultGroupCount ?? 6
    ensureGroupsUpTo(currentClassId, currentPeriodId, target)
  }, [currentClassId, currentPeriodId, cls, period])

  // ── 新增單筆 ──
  const handleCreate = async () => {
    if (!form.name.trim() || !form.seatNo) return
    if (students.find(s => s.seatNo === form.seatNo)) {
      window.alert(`座號 ${form.seatNo} 已被使用`)
      return
    }
    await createStudent({
      classId: currentClassId,
      seatNo:  form.seatNo,
      name:    form.name.trim(),
      remarks: form.remarks.trim() || undefined
    })
    setShowCreate(false)
    setForm(EMPTY_FORM)
  }

  // ── 編輯 ──
  const startEdit = (s: Student) => {
    setEditing(s)
    setForm({ seatNo: s.seatNo, name: s.name, remarks: s.remarks ?? '' })
  }
  const handleUpdate = async () => {
    if (!editing) return
    if (!form.name.trim() || !form.seatNo) return
    // 檢查座號衝突
    const conflict = students.find(s => s.seatNo === form.seatNo && s.id !== editing.id)
    if (conflict) {
      window.alert(`座號 ${form.seatNo} 已被「${conflict.name}」使用`)
      return
    }
    await updateStudent(editing.id, {
      seatNo:  form.seatNo,
      name:    form.name.trim(),
      remarks: form.remarks.trim() || undefined
    })
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  // ── 渲染 ─────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-6xl">
      {/* ── 標題 + 動作按鈕 ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            👥 學生與分組
            {cls && (
              <span className="ml-3 text-base text-gray-400 font-normal">
                {cls.grade} 年 {cls.name} 班 ・ 共 {students.length} 人
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            管理學生名單、分組與角色指派
            {period && (
              <span className="ml-2 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-xs font-medium">
                目前段考期：{period.name}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowImport(true)} icon="📥">
            匯入 Excel
          </Button>
          <Button onClick={() => { setForm(EMPTY_FORM); setShowCreate(true) }} icon="＋">
            新增學生
          </Button>
        </div>
      </div>

      {/* ── 分頁切換 ── */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`
              px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
              ${tab === t.value
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'}
            `}
          >
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 分頁內容 ── */}
      {tab === 'list' && (
        students.length === 0 ? (
          <EmptyState
            icon="📋"
            title="還沒有任何學生"
            description="可以直接新增單筆，或匯入整份 Excel 名單。"
            action={
              <div className="flex gap-2 justify-center">
                <Button onClick={() => { setForm(EMPTY_FORM); setShowCreate(true) }}>＋ 新增單筆</Button>
                <Button variant="secondary" onClick={() => setShowImport(true)}>📥 匯入 Excel</Button>
              </div>
            }
          />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-600 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-3 text-left font-medium w-16">座號</th>
                  <th className="px-3 py-3 text-left font-medium">姓名</th>
                  <th className="px-3 py-3 text-left font-medium w-32">分組</th>
                  <th className="px-3 py-3 text-left font-medium w-28">角色</th>
                  <th className="px-3 py-3 text-left font-medium">備註</th>
                  <th className="px-3 py-3 text-right font-medium w-24">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map(s => (
                  <StudentRow
                    key={s.id}
                    student={s}
                    groups={groups}
                    examPeriodId={currentPeriodId}
                    onEdit={startEdit}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'groups' && (
        groups.length === 0 ? (
          <EmptyState icon="👥" title="尚未建立小組" description="切到此頁時會自動建立 6 個預設小組" />
        ) : (
          <GroupBoard groups={groups} students={students} examPeriodId={currentPeriodId} onOpenTool={onOpenTool} />
        )
      )}

      {/* ── 對話框：新增/編輯 學生 ── */}
      <Modal
        open={showCreate || !!editing}
        onClose={() => { setShowCreate(false); setEditing(null); setForm(EMPTY_FORM) }}
        title={editing ? '編輯學生' : '新增學生'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowCreate(false); setEditing(null) }}>
              取消
            </Button>
            <Button onClick={editing ? handleUpdate : handleCreate}>
              {editing ? '儲存' : '建立'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="座號"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={form.seatNo || ''}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              setForm({ ...form, seatNo: v === '' ? 0 : Number(v) })
            }}
            placeholder="必填"
          />
          <Input
            label="姓名"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="必填"
          />
          <Input
            label="備註（選填）"
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            placeholder="例如：班長、特殊需求說明等"
          />
        </div>
      </Modal>

      {/* ── 對話框：匯入 Excel ── */}
      <StudentImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        classId={currentClassId}
        examPeriodId={currentPeriodId}
      />
    </div>
  )
}

export default StudentsPage
