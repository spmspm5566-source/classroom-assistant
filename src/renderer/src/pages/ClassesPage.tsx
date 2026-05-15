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
  deleteClass,
  promoteClass,
  promoteAllClasses,
  previewPromotion,
  recordPromotionDone,
  type PromotionPreview
} from '../db/classRepo'
import { useAppStore } from '../store/useAppStore'
import type { Class } from '../db/schema'

import Button     from '../components/shared/Button'
import Modal      from '../components/shared/Modal'
import Input      from '../components/shared/Input'
import Select     from '../components/shared/Select'
import EmptyState from '../components/shared/EmptyState'
import MultiClassImportDialog from '../components/students/MultiClassImportDialog'
import { getCurrentSemesterCode, getCurrentSchoolYear } from '../utils/semester'

// ── 表單預設值 ───────────────────────────────────────────────

interface ClassForm {
  name:     string
  grade:    number
  rows:     number
  cols:     number
  semester: string
}

// 預設值：學期代碼依當前日期自動推算（避免老師手動每年改）
function buildEmptyForm(): ClassForm {
  return {
    name:     '',
    grade:    1,
    rows:     6,
    cols:     6,
    semester: getCurrentSemesterCode()
  }
}

const EMPTY_FORM: ClassForm = buildEmptyForm()

// ── 主元件 ───────────────────────────────────────────────────

const ClassesPage: React.FC = () => {
  const classes              = useLiveQuery(() => listClasses(), [], [])
  const currentClassId       = useAppStore(s => s.currentClassId)
  const setCurrentClass      = useAppStore(s => s.setCurrentClass)
  const setCurrentExamPeriod = useAppStore(s => s.setCurrentExamPeriod)

  // 對話框狀態
  const [editingClass, setEditingClass] = useState<Class | null>(null)
  const [showCreate, setShowCreate]     = useState(false)
  const [form, setForm]                 = useState<ClassForm>(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [toast,  setToast]              = useState<string | null>(null)
  const [showMultiImport, setShowMultiImport] = useState(false)
  // 全班升年級對話框
  const [showPromoteAll, setShowPromoteAll] = useState(false)
  const [promoting, setPromoting] = useState(false)

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
        grade:    form.grade,
        rows:     form.rows,
        cols:     form.cols,
        semester: form.semester.trim()
      })
      // 注意：不自動切換目前班級！
      // 如果原本沒有目前班級（第一次新增），才自動選這個
      if (!currentClassId) {
        setCurrentClass(cls.id)
      } else {
        setToast(`✅ 已建立 ${cls.grade}年${cls.name}班（仍在原班級）`)
      }
      setShowCreate(false)
      setForm(EMPTY_FORM)
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

  // ── 編輯 ──
  const startEdit = (cls: Class) => {
    setEditingClass(cls)
    setForm({
      name:     cls.name,
      grade:    cls.grade,
      rows:     cls.rows,
      cols:     cls.cols,
      semester: cls.semester
    })
  }
  const handleUpdate = async () => {
    if (!editingClass) return
    if (!form.name.trim()) { window.alert('請填寫班級名稱'); return }
    setSaving(true)
    try {
      await updateClass(editingClass.id, {
        name:     form.name.trim(),
        grade:    form.grade,
        rows:     form.rows,
        cols:     form.cols,
        semester: form.semester.trim()
      })
      setEditingClass(null)
      setForm(EMPTY_FORM)
    } catch (e) {
      console.error(e)
      window.alert('儲存失敗：' + e)
    } finally {
      setSaving(false)
    }
  }

  // ── 升年級（單一班級） ──
  const handlePromoteOne = async (cls: Class): Promise<void> => {
    const preview = previewPromotion(cls)

    if (preview.action === 'skip') return

    if (preview.action === 'graduate') {
      const ok = window.confirm(
        `「${cls.grade}年${cls.name}班」已是 3 年級。\n\n` +
        `要執行「畢業」嗎？\n\n` +
        `⚠ 畢業會整班刪除：\n` +
        `・班級本身\n` +
        `・全部學生名單\n` +
        `・所有加分記錄、考試成績、段考期\n\n` +
        `此操作無法復原，建議先「💾 完整備份」以防萬一。`
      )
      if (!ok) return
      try {
        await promoteClass(cls.id)
        // 如果刪除的是目前班級，清空 currentClassId
        if (currentClassId === cls.id) {
          setCurrentClass(null)
          setCurrentExamPeriod(null)
        }
        setToast(`🎓 「${cls.grade}年${cls.name}班」已畢業並刪除`)
      } catch (e) {
        console.error(e); window.alert('畢業處理失敗：' + e)
      }
      return
    }

    // promote
    const ok = window.confirm(
      `要把「${cls.grade}年${cls.name}班」升年級嗎？\n\n` +
      `升年級後：\n` +
      `・班級名稱：${preview.fromName} → ${preview.toName}\n` +
      `・年級：${preview.fromGrade} 年 → ${preview.toGrade} 年\n` +
      `・學生名單保留，但分組／角色會解除\n` +
      `・加分記錄、考試成績、段考期會清空（重新開始）\n` +
      `・自動建立新「第一次段考」+ 6 組\n\n` +
      `⚠ 此操作無法復原，請先「💾 完整備份」以防萬一。`
    )
    if (!ok) return
    try {
      await promoteClass(cls.id)
      setToast(`📈 已升年級：${preview.fromGrade}年${preview.fromName}班 → ${preview.toGrade}年${preview.toName}班`)
    } catch (e) {
      console.error(e); window.alert('升年級失敗：' + e)
    }
  }

  // ── 全班升年級 ──
  const handlePromoteAll = async (): Promise<void> => {
    setPromoting(true)
    try {
      const results = await promoteAllClasses()
      // 記錄此學年已處理（不再自動提示）
      await recordPromotionDone(getCurrentSchoolYear())
      const promoted  = results.filter(r => r.action === 'promote').length
      const graduated = results.filter(r => r.action === 'graduate').length
      setToast(`📈 完成：升年級 ${promoted} 個班級、標記畢業 ${graduated} 個班級`)
      setShowPromoteAll(false)
    } catch (e) {
      console.error(e); window.alert('全班升年級失敗：' + e)
    } finally {
      setPromoting(false)
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
        <div className="flex flex-wrap gap-2">
          {classes && classes.some(c => !c.graduated) && (
            <Button
              variant="secondary"
              onClick={() => setShowPromoteAll(true)}
              icon={<span>📈</span>}
            >
              全班升年級
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => setShowMultiImport(true)}
            icon={<span>📥</span>}
          >
            多班一次匯入
          </Button>
          <Button
            onClick={() => { setForm(buildEmptyForm()); setShowCreate(true) }}
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
            const isCurrent  = cls.id === currentClassId
            const isGraduated = !!cls.graduated
            return (
              <div
                key={cls.id}
                className={`
                  bg-white rounded-2xl border-2 shadow-card p-5
                  transition-all
                  ${isGraduated
                    ? 'border-gray-200 bg-gray-50 opacity-80'
                    : isCurrent
                      ? 'border-brand-500 ring-2 ring-brand-200'
                      : 'border-gray-100 hover:border-gray-200'}
                `}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className={`text-lg font-bold truncate ${isGraduated ? 'text-gray-500 line-through decoration-2' : 'text-gray-800'}`}>
                        {cls.grade} 年 {cls.name} 班
                      </h3>
                      {isGraduated && (
                        <span className="
                          inline-block px-2 py-0.5 rounded-md
                          bg-gray-300 text-gray-700 text-[10px] font-bold tracking-wide
                        ">
                          🎓 畢業
                        </span>
                      )}
                      {isCurrent && !isGraduated && (
                        <span className="
                          inline-block px-2 py-0.5 rounded-md
                          bg-brand-100 text-brand-700 text-[10px] font-bold tracking-wide
                          flex-shrink-0
                        ">
                          目前
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      學期 {cls.semester} ・ 教室 {cls.rows}×{cls.cols}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!isCurrent && !isGraduated && (
                    <Button size="sm" variant="primary" onClick={() => handleSwitch(cls)}>
                      📌 切換
                    </Button>
                  )}
                  {!isGraduated && (
                    <Button
                      size="sm"
                      variant={cls.grade >= 3 ? 'danger' : 'secondary'}
                      onClick={() => handlePromoteOne(cls)}
                    >
                      {cls.grade >= 3 ? '🎓 畢業（刪除）' : '📈 升年級'}
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
        onClose={() => { setShowCreate(false); setEditingClass(null); setForm(EMPTY_FORM) }}
        title={editingClass ? '編輯班級' : '新增班級'}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => { setShowCreate(false); setEditingClass(null); setForm(EMPTY_FORM) }}
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
          <div /> {/* 佔位 */}
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
            ℹ 建立班級時會自動建立「第一次段考」並產生 6 個預設小組（第1～6組），
            之後可在標題列「段考期」下拉選單建立第二次、第三次段考；
            每次段考都有獨立的 6 組與分數統計。
          </p>
        )}
      </Modal>

      {/* ── 多班一次匯入對話框 ── */}
      <MultiClassImportDialog
        open={showMultiImport}
        onClose={() => setShowMultiImport(false)}
      />

      {/* ── 全班升年級對話框 ── */}
      <PromoteAllDialog
        open={showPromoteAll}
        onClose={() => setShowPromoteAll(false)}
        classes={classes ?? []}
        onConfirm={handlePromoteAll}
        loading={promoting}
      />
    </div>
  )
}

// ── 子元件：全班升年級對話框 ─────────────────────────────────

interface PromoteAllDialogProps {
  open:      boolean
  onClose:   () => void
  classes:   Class[]
  onConfirm: () => void
  loading:   boolean
}

const PromoteAllDialog: React.FC<PromoteAllDialogProps> = ({
  open, onClose, classes, onConfirm, loading
}) => {
  const previews = classes
    .filter(c => !c.graduated)
    .map(previewPromotion)

  const promoteList  = previews.filter(p => p.action === 'promote')
  const graduateList = previews.filter(p => p.action === 'graduate')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📈 全班升年級"
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>取消</Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            loading={loading}
            disabled={loading || previews.length === 0}
          >
            確認升年級
          </Button>
        </>
      }
    >
      {previews.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">
          沒有未畢業的班級需要升年級。
        </p>
      ) : (
        <>
          {/* 將升年級 */}
          {promoteList.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-bold text-emerald-700 mb-2">
                📈 將升年級（{promoteList.length} 個班級）
              </h4>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1.5">
                {promoteList.map(p => (
                  <div key={p.classId} className="text-sm flex items-center gap-2">
                    <span className="text-gray-600">{p.fromGrade} 年 {p.fromName} 班</span>
                    <span className="text-emerald-600 font-bold">→</span>
                    <span className="text-emerald-800 font-semibold">{p.toGrade} 年 {p.toName} 班</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 畢業（整班刪除） */}
          {graduateList.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-bold text-red-700 mb-2">
                🎓 畢業（整班刪除，{graduateList.length} 個班級）
              </h4>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1.5">
                {graduateList.map(p => (
                  <div key={p.classId} className="text-sm text-red-800">
                    {p.fromGrade} 年 {p.fromName} 班 <span className="text-red-600 text-xs font-semibold">→ 整班刪除（含學生、所有資料）</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 警告 */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 leading-relaxed">
            <p className="font-bold mb-1">⚠ 升年級的影響：</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li><b>1-2 年級升年級</b>：學生名單保留；加分、考試成績、段考期會清空；自動建立新「第一次段考」+ 6 組</li>
              <li><b>3 年級畢業</b>：<span className="font-bold text-red-700">整班刪除</span>（連同學生名單、所有加分記錄）</li>
              <li>所有班級的分組／角色（教室、實驗桌）都會解除，需重新分組</li>
            </ul>
            <p className="mt-2 font-bold">
              💾 強烈建議先到「加分規則 → 資料備份」做一份完整備份再執行！
            </p>
          </div>
        </>
      )}
    </Modal>
  )
}

export default ClassesPage
