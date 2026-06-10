/**
 * ClassesPage.tsx — 班級管理頁
 *
 * 功能：
 *  - 列出所有班級（目前班級會高亮顯示）
 *  - 新增班級（自動建立第一次段考 + 6 組）— 不會自動切換成新班級
 *  - 切換目前班級（每張卡片有「切換」按鈕）
 *  - 編輯班級（名稱、年級、教室規模、學期）
 *  - 刪除班級（連帶清除所有學生與分數記錄）
 */

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  listClasses,
  createClassWithFirstPeriod,
  updateClass,
  deleteClass
} from '../db/classRepo'
import { useAppStore } from '../store/useAppStore'
import type { Class } from '../db/schema'
import { syncGroupCount } from '../db/groupRepo'

import Button     from '../components/shared/Button'
import Modal      from '../components/shared/Modal'
import Input      from '../components/shared/Input'
import Select     from '../components/shared/Select'
import EmptyState from '../components/shared/EmptyState'
import MultiClassImportDialog from '../components/students/MultiClassImportDialog'

// ── 表單預設值 ───────────────────────────────────────────────

interface ClassForm {
  name:              string
  grade:             number
  rows:              number
  cols:              number
  semester:          string
  defaultGroupCount: number
}

/**
 * 依現在日期推算台灣學期代碼：
 *  - 9~12 月、隔年 1 月 → 上學期「學年度-1」
 *  - 2~6 月            → 下學期「學年度-2」
 *  - 7~8 月            → 暑期「當年民國-暑期」
 * 學年度從 9 月起算（9 月後學年度=當年民國；1 月仍屬前一年 9 月的學年度）。
 */
function getCurrentSemester(d: Date = new Date()): string {
  const roc   = d.getFullYear() - 1911
  const month = d.getMonth() + 1   // 1~12
  if (month >= 9)            return `${roc}-1`        // 9~12 月：上學期
  if (month === 1)           return `${roc - 1}-1`    // 1 月：仍屬上學期
  if (month >= 2 && month <= 6) return `${roc - 1}-2` // 2~6 月：下學期
  return `${roc}-暑期`                                // 7~8 月：暑期
}

function makeEmptyForm(): ClassForm {
  return {
    name:              '',
    grade:             1,
    rows:              6,
    cols:              6,
    semester:          getCurrentSemester(),
    defaultGroupCount: 6
  }
}

// ── 主元件 ───────────────────────────────────────────────────

const ClassesPage: React.FC = () => {
  const classes              = useLiveQuery(() => listClasses(), [], [])
  const currentClassId       = useAppStore(s => s.currentClassId)
  const currentExamPeriodId  = useAppStore(s => s.currentExamPeriodId)
  const setCurrentClass      = useAppStore(s => s.setCurrentClass)
  const setCurrentExamPeriod = useAppStore(s => s.setCurrentExamPeriod)
  const setCurrentPage       = useAppStore(s => s.setCurrentPage)
  const setStudentsTab       = useAppStore(s => s.setStudentsTab)

  // 對話框狀態
  const [editingClass, setEditingClass] = useState<Class | null>(null)
  const [showCreate, setShowCreate]     = useState(false)
  const [form, setForm]                 = useState<ClassForm>(makeEmptyForm())
  const [saving, setSaving]             = useState(false)
  const [toast,  setToast]              = useState<string | null>(null)
  const [showMultiImport, setShowMultiImport] = useState(false)

  // 顯示一段時間後自動清除 toast
  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // ── 新增 ──
  const handleCreate = async () => {
    const name = form.name.trim()
    if (!name) {
      window.alert('請填寫班級名稱')
      return
    }
    setSaving(true)
    try {
      const { cls } = await createClassWithFirstPeriod({
        name,
        grade:             form.grade,
        rows:              form.rows,
        cols:              form.cols,
        semester:          form.semester.trim(),
        defaultGroupCount: form.defaultGroupCount
      })
      // 注意：不自動切換目前班級！
      // 如果原本沒有目前班級（第一次新增），才自動選這個
      if (!currentClassId) {
        setCurrentClass(cls.id)
      } else {
        setToast(`✅ 已建立 ${cls.grade}年${cls.name}班（仍在原班級）`)
      }
      setShowCreate(false)
      setForm(makeEmptyForm())
    } catch (e) {
      console.error(e)
      window.alert('建立班級失敗：' + e)
    } finally {
      setSaving(false)
    }
  }

  // ── 切換到此班級 ──
  const handleSwitch = (cls: Class) => {
    setCurrentClass(cls.id)
    setCurrentExamPeriod(null)   // 讓 PeriodSwitcher 自動選該班最新一期
    setToast(`📌 已切換到 ${cls.grade}年${cls.name}班`)
  }

  // ── 點班級 → 切換並進入學生與分組頁（可指定分頁）──
  const handleEnter = (cls: Class, tab: 'list' | 'groups') => {
    if (cls.id !== currentClassId) {
      setCurrentClass(cls.id)
      setCurrentExamPeriod(null)
    }
    setStudentsTab(tab)
    setCurrentPage('students')
  }
  const handleEnterSeating = (cls: Class) => handleEnter(cls, 'groups')

  // ── 編輯 ──
  const startEdit = (cls: Class) => {
    setEditingClass(cls)
    setForm({
      name:              cls.name,
      grade:             cls.grade,
      rows:              cls.rows,
      cols:              cls.cols,
      semester:          cls.semester,
      defaultGroupCount: cls.defaultGroupCount ?? 6
    })
  }
  const handleUpdate = async () => {
    if (!editingClass) return
    if (!form.name.trim()) { window.alert('請填寫班級名稱'); return }
    setSaving(true)
    try {
      await updateClass(editingClass.id, {
        name:              form.name.trim(),
        grade:             form.grade,
        rows:              form.rows,
        cols:              form.cols,
        semester:          form.semester.trim(),
        defaultGroupCount: form.defaultGroupCount
      })
      // 若正在編輯的是目前班級，且有段考期，自動同步目前段考期的組數
      if (
        editingClass.id === currentClassId &&
        currentExamPeriodId &&
        form.defaultGroupCount > (editingClass.defaultGroupCount ?? 6)
      ) {
        await syncGroupCount(editingClass.id, currentExamPeriodId, form.defaultGroupCount)
      }
      setEditingClass(null)
      setForm(makeEmptyForm())
    } catch (e) {
      console.error(e)
      window.alert('儲存失敗：' + e)
    } finally {
      setSaving(false)
    }
  }

  // ── 刪除 ──
  const handleDelete = async (cls: Class) => {
    const ok = window.confirm(
      `確定要刪除「${cls.grade}年${cls.name}班」嗎？\n` +
      `這會連帶清除該班所有學生、分組、加分記錄與考試成績，無法還原。`
    )
    if (!ok) return
    try {
      await deleteClass(cls.id)
      // 如果刪除的是目前班級，清空 currentClassId
      if (currentClassId === cls.id) {
        setCurrentClass(null)
        setCurrentExamPeriod(null)
      }
    } catch (e) {
      console.error(e)
      window.alert('刪除失敗：' + e)
    }
  }

  // ── 渲染 ─────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🏫 班級管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">建立、編輯任教班級的基本資料</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowMultiImport(true)}
            icon={<span>📥</span>}
          >
            多班一次匯入
          </Button>
          <Button
            onClick={() => { setForm(makeEmptyForm()); setShowCreate(true) }}
            icon={<span>＋</span>}
          >
            新增班級
          </Button>
        </div>
      </div>

      {/* ── Toast 提示 ── */}
      {toast && (
        <div className="
          mb-4 px-4 py-2.5 rounded-xl
          bg-emerald-50 border border-emerald-200
          text-emerald-800 text-sm font-medium
          flex items-center justify-between
        ">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-emerald-600 hover:text-emerald-800 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* ── 班級清單 ── */}
      {(!classes || classes.length === 0) ? (
        <EmptyState
          icon="🏫"
          title="尚未建立任何班級"
          description="先建立班級，才能新增學生、分組與抽籤"
          action={
            <Button onClick={() => setShowCreate(true)}>
              ＋ 新增第一個班級
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map(cls => {
            const isCurrent = cls.id === currentClassId
            return (
              <div
                key={cls.id}
                className={`
                  bg-white rounded-2xl border-2 shadow-card p-5
                  transition-all
                  ${isCurrent
                    ? 'border-brand-500 ring-2 ring-brand-200'
                    : 'border-gray-100 hover:border-gray-200'}
                `}
              >
                {/* 點標題區 → 切換班級並進入分組座位表 */}
                <button
                  onClick={() => handleEnterSeating(cls)}
                  title="進入分組座位表"
                  className="w-full text-left flex items-start justify-between mb-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-gray-800 truncate group-hover:text-brand-700">
                        {cls.grade} 年 {cls.name} 班
                      </h3>
                    </div>
                    <p className="text-xs text-gray-500">
                      學期 {cls.semester} ・ 分組：{cls.defaultGroupCount ?? 6}組
                    </p>
                  </div>
                  <span className="text-[11px] text-brand-600 opacity-0 group-hover:opacity-100 flex-shrink-0 mt-1">
                    座位表 →
                  </span>
                </button>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={() => handleEnter(cls, 'groups')}>
                    👥 座位表
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => handleEnter(cls, 'list')}>
                    📋 學生名單
                  </Button>
                  {!isCurrent && (
                    <Button size="sm" variant="secondary" onClick={() => handleSwitch(cls)}>
                      📌 切換
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => startEdit(cls)}>
                    編輯
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(cls)}>
                    🗑 刪除
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 新增 / 編輯 對話框 ── */}
      <Modal
        open={showCreate || !!editingClass}
        onClose={() => { setShowCreate(false); setEditingClass(null); setForm(makeEmptyForm()) }}
        title={editingClass ? '編輯班級' : '新增班級'}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => { setShowCreate(false); setEditingClass(null); setForm(makeEmptyForm()) }}
            >
              取消
            </Button>
            <Button
              loading={saving}
              disabled={saving || !form.name.trim()}
              onClick={editingClass ? handleUpdate : handleCreate}
            >
              {editingClass ? '儲存' : '建立'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="班級名稱"
            placeholder="例如 101"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Select<number>
            label="年級"
            value={form.grade}
            options={[
              { value: 1, label: '一年級' },
              { value: 2, label: '二年級' },
              { value: 3, label: '三年級' }
            ]}
            onChange={(v) => setForm({ ...form, grade: Number(v) })}
          />
          <Input
            label="學期代碼"
            placeholder="115-1"
            value={form.semester}
            onChange={(e) => setForm({ ...form, semester: e.target.value })}
          />
          <Input
            label="預設小組數"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={form.defaultGroupCount || ''}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              setForm({ ...form, defaultGroupCount: v === '' ? 0 : Math.min(20, Number(v)) })
            }}
            onBlur={() => { if (!form.defaultGroupCount || form.defaultGroupCount < 1) setForm({ ...form, defaultGroupCount: 6 }) }}
          />
          <Input
            label="教室排數"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={form.rows || ''}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              setForm({ ...form, rows: v === '' ? 0 : Math.min(20, Number(v)) })
            }}
            onBlur={() => { if (form.rows < 1) setForm({ ...form, rows: 1 }) }}
          />
          <Input
            label="教室列數"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={form.cols || ''}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              setForm({ ...form, cols: v === '' ? 0 : Math.min(20, Number(v)) })
            }}
            onBlur={() => { if (form.cols < 1) setForm({ ...form, cols: 1 }) }}
          />
        </div>

        {!editingClass && (
          <p className="mt-4 text-xs text-gray-500 leading-relaxed">
            ℹ 建立班級時會自動建立「第一次段考」並依「預設小組數」產生對應組數，
            之後可在標題列「段考期」下拉選單建立第二次、第三次段考；
            每次段考都有獨立的分組與分數統計，且會自動保留上一期的分組設定。
          </p>
        )}
      </Modal>

      {/* ── 多班一次匯入對話框 ── */}
      <MultiClassImportDialog
        open={showMultiImport}
        onClose={() => setShowMultiImport(false)}
      />
    </div>
  )
}

export default ClassesPage
