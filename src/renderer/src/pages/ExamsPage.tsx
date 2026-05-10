/**
 * ExamsPage.tsx — 考試成績主頁
 *
 * 功能：
 *  - Tab 切換：平常考 / 段考
 *  - 列出該段考期下所有考試（依日期遞減）
 *  - 「+ 新增考試」按鈕
 *  - 點考試 → 開啟成績輸入對話框
 *  - 已套用加分的考試會標記「✓ 已套用」
 *  - 刪除考試（連同所屬 ScoreEvent）
 */

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import type { Exam } from '../db/schema'
import { useAppStore }       from '../store/useAppStore'
import {
  listByPeriod as listExams,
  createExam,
  deleteExam
}                            from '../db/examRepo'
import { listByClass as listPeriods, getById as getPeriod } from '../db/examPeriodRepo'

import Button     from '../components/shared/Button'
import EmptyState from '../components/shared/EmptyState'
import Modal      from '../components/shared/Modal'
import ExamScoreDialog from '../components/exams/ExamScoreDialog'

type Tab = 'quiz' | 'exam'

const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: 'quiz', label: '平常考', icon: '📝' },
  { value: 'exam', label: '段考',   icon: '🎓' }
]

// ── 主元件 ───────────────────────────────────────────────────

const ExamsPage: React.FC = () => {
  const classId  = useAppStore(s => s.currentClassId)
  const periodId = useAppStore(s => s.currentExamPeriodId)

  const [tab, setTab]                     = React.useState<Tab>('quiz')
  const [showCreate, setShowCreate]       = React.useState(false)
  const [editingExam, setEditingExam]     = React.useState<Exam | null>(null)

  // ── DB 撈取 ──
  const period = useLiveQuery(
    () => periodId ? getPeriod(periodId) : Promise.resolve(undefined),
    [periodId]
  )
  const exams = useLiveQuery(
    () => (classId && periodId)
      ? listExams(classId, periodId, tab)
      : Promise.resolve([]),
    [classId, periodId, tab],
    []
  ) ?? []

  // 學生數（用於進度顯示）
  const studentCount = useLiveQuery(
    () => classId ? db.students.where('classId').equals(classId).count() : 0,
    [classId],
    0
  ) ?? 0

  // 每場考試已填分數的學生數
  const filledCounts: Record<string, number> = useLiveQuery(
    async (): Promise<Record<string, number>> => {
      const map: Record<string, number> = {}
      for (const e of exams) {
        map[e.id] = await db.examScores.where('examId').equals(e.id).count()
      }
      return map
    },
    [exams.map(e => e.id).join(',')]
  ) ?? {}

  // ── 導引：未選班級 / 段考期 ──
  if (!classId) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-center">
        <div className="text-5xl mb-4">📝</div>
        <p className="text-gray-500 text-sm">請先在標題列選擇班級。</p>
      </div>
    )
  }
  if (!periodId || !period) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-center">
        <div className="text-5xl mb-4">📅</div>
        <p className="text-gray-500 text-sm">請先選擇或建立段考期。</p>
      </div>
    )
  }

  // ── 操作：刪除考試 ──
  const handleDelete = async (exam: Exam) => {
    const ok = window.confirm(
      `確定要刪除「${exam.name}」嗎？\n` +
      `這會連帶刪除所有學生的考試分數${exam.appliedAt ? '與已套用的加分記錄' : ''}，無法還原。`
    )
    if (!ok) return
    try {
      await deleteExam(exam.id)
    } catch (e) {
      console.error(e)
      window.alert('刪除失敗：' + e)
    }
  }

  return (
    <div className="p-8 max-w-5xl">

      {/* ── 標題 ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📝 考試成績</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            目前段考期：
            <span className="ml-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-xs font-medium">
              {period.name}
            </span>
            <span className="ml-2 text-xs text-gray-400">
              （依規則自動算加分，可隨時撤銷重套）
            </span>
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          icon={<span>＋</span>}
        >
          新增{tab === 'quiz' ? '平常考' : '段考'}
        </Button>
      </div>

      {/* ── Tab 切換 ── */}
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

      {/* ── 考試列表 ── */}
      {exams.length === 0 ? (
        <EmptyState
          icon={tab === 'quiz' ? '📝' : '🎓'}
          title={`此段考期尚無${tab === 'quiz' ? '平常考' : '段考'}記錄`}
          description={`點上方按鈕新增第一場${tab === 'quiz' ? '平常考' : '段考'}，輸入學生成績後一鍵套用加分。`}
          action={
            <Button onClick={() => setShowCreate(true)}>
              ＋ 新增第一場
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {exams.map(e => (
            <ExamCard
              key={e.id}
              exam={e}
              filledCount={filledCounts[e.id] ?? 0}
              studentCount={studentCount}
              onClick={() => setEditingExam(e)}
              onDelete={() => handleDelete(e)}
            />
          ))}
        </div>
      )}

      {/* ── 新增考試對話框 ── */}
      <CreateExamDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        defaultType={tab}
        classId={classId}
        examPeriodId={periodId}
        onCreated={(exam) => {
          setShowCreate(false)
          setEditingExam(exam)   // 立即進入成績輸入
        }}
      />

      {/* ── 成績輸入對話框 ── */}
      <ExamScoreDialog
        open={!!editingExam}
        onClose={() => setEditingExam(null)}
        exam={editingExam}
      />
    </div>
  )
}

// ── 子元件：考試卡片 ──────────────────────────────────────────

interface ExamCardProps {
  exam:         Exam
  filledCount:  number
  studentCount: number
  onClick:      () => void
  onDelete:     () => void
}

const ExamCard: React.FC<ExamCardProps> = ({ exam, filledCount, studentCount, onClick, onDelete }) => {
  const isApplied = exam.appliedAt !== null
  return (
    <div className="
      bg-white rounded-2xl border border-gray-100 shadow-card
      flex items-center justify-between
      hover:border-brand-300 transition-colors
    ">
      <button
        onClick={onClick}
        className="flex-1 text-left p-4 flex items-center gap-4 cursor-pointer"
      >
        <div className="text-3xl flex-shrink-0">
          {exam.type === 'quiz' ? '📝' : '🎓'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-bold text-gray-800 truncate">{exam.name}</h3>
            {isApplied ? (
              <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                ✓ 已套用
              </span>
            ) : (
              <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold">
                ⏸ 草稿
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {exam.date} ・ 已填 {filledCount} / {studentCount} 人
          </p>
        </div>
      </button>
      <button
        onClick={onDelete}
        className="
          mr-3 w-8 h-8 rounded-lg
          text-gray-400 hover:bg-red-50 hover:text-red-600
          flex items-center justify-center
        "
        title="刪除考試"
      >
        🗑
      </button>
    </div>
  )
}

// ── 子元件：新增考試對話框 ────────────────────────────────────

interface CreateExamDialogProps {
  open:         boolean
  onClose:      () => void
  classId:      string
  examPeriodId: string
  defaultType:  'quiz' | 'exam'
  onCreated:    (exam: Exam) => void
}

const CreateExamDialog: React.FC<CreateExamDialogProps> = ({
  open, onClose, classId, examPeriodId, defaultType, onCreated
}) => {
  const [type, setType] = React.useState<'quiz' | 'exam'>(defaultType)
  const [name, setName] = React.useState('')
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setType(defaultType)
      setName('')
      setDate(new Date().toISOString().slice(0, 10))
    }
  }, [open, defaultType])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const exam = await createExam({
        classId,
        examPeriodId,
        type,
        name: name.trim() || undefined,   // 空字串 → 自動「第N次..」
        date
      })
      onCreated(exam)
    } catch (e) {
      console.error(e)
      window.alert('建立失敗：' + e)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新增考試"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button loading={creating} onClick={handleCreate}>建立並輸入成績</Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 類型 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">類型</label>
          <div className="flex gap-2">
            <button
              onClick={() => setType('quiz')}
              className={`
                flex-1 h-10 rounded-lg text-sm font-semibold transition-all
                ${type === 'quiz' ? 'bg-brand-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-400'}
              `}
            >
              📝 平常考
            </button>
            <button
              onClick={() => setType('exam')}
              className={`
                flex-1 h-10 rounded-lg text-sm font-semibold transition-all
                ${type === 'exam' ? 'bg-brand-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-400'}
              `}
            >
              🎓 段考
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            {type === 'quiz'
              ? '平常考依「角色標準分」計算（組長/助教/組員各有不同標準）'
              : '段考依「學生個人標準分」計算（需事先在學生資料設定）'}
          </p>
        </div>

        {/* 名稱 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">名稱</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={`留空則自動命名「第 N 次${type === 'quiz' ? '平常考' : '段考'}」`}
            className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500"
          />
        </div>

        {/* 日期 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">日期</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>
    </Modal>
  )
}

export default ExamsPage
