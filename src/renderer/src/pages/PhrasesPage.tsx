/**
 * PhrasesPage.tsx — 讚美 / 鼓勵語料庫編輯頁
 *
 * 老師可：
 *  - 新增句子（按 Enter 即送出）
 *  - 刪除單筆
 *  - 一鍵還原預設
 *
 * 抽籤器答對/答錯時會從這裡隨機取一句顯示。
 */

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getConfig, updateConfig, resetPhrases } from '../db/configRepo'

import Button from '../components/shared/Button'

const PhrasesPage: React.FC = () => {
  const config = useLiveQuery(() => getConfig(), [])
  const [praiseInput, setPraiseInput]               = React.useState('')
  const [encouragementInput, setEncouragementInput] = React.useState('')

  if (!config) {
    return <div className="p-8 text-sm text-gray-500">載入中…</div>
  }

  // ── 新增 ──
  const addPraise = async () => {
    const v = praiseInput.trim()
    if (!v) return
    if (config.praise.includes(v)) {
      window.alert('已有相同句子')
      return
    }
    await updateConfig({ praise: [...config.praise, v] })
    setPraiseInput('')
  }
  const addEncouragement = async () => {
    const v = encouragementInput.trim()
    if (!v) return
    if (config.encouragement.includes(v)) {
      window.alert('已有相同句子')
      return
    }
    await updateConfig({ encouragement: [...config.encouragement, v] })
    setEncouragementInput('')
  }

  // ── 刪除 ──
  const removePraise = async (idx: number) => {
    const next = [...config.praise]
    next.splice(idx, 1)
    await updateConfig({ praise: next })
  }
  const removeEncouragement = async (idx: number) => {
    const next = [...config.encouragement]
    next.splice(idx, 1)
    await updateConfig({ encouragement: next })
  }

  // ── 還原預設 ──
  const handleReset = async () => {
    const ok = window.confirm('確定要把讚美與鼓勵語料庫都還原成預設值嗎？\n你新增的句子會被清掉。')
    if (!ok) return
    await resetPhrases()
  }

  return (
    <div className="p-8 max-w-5xl">

      {/* ── 標題 ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">💬 讚美 / 鼓勵語料庫</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            抽籤答對 / 答錯時，會從這兩份清單隨機選一句顯示給學生看
          </p>
        </div>
        <Button variant="secondary" onClick={handleReset}>還原預設語料</Button>
      </div>

      {/* ── 兩欄並排 ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* === 讚美語 === */}
        <PhraseColumn
          color="emerald"
          icon="🎉"
          title="答對讚美語"
          count={config.praise.length}
          input={praiseInput}
          setInput={setPraiseInput}
          onAdd={addPraise}
          phrases={config.praise}
          onRemove={removePraise}
          placeholder="輸入新讚美語，按 Enter 送出"
        />

        {/* === 鼓勵語 === */}
        <PhraseColumn
          color="rose"
          icon="💪"
          title="答錯鼓勵語"
          count={config.encouragement.length}
          input={encouragementInput}
          setInput={setEncouragementInput}
          onAdd={addEncouragement}
          phrases={config.encouragement}
          onRemove={removeEncouragement}
          placeholder="輸入新鼓勵語，按 Enter 送出"
        />
      </div>
    </div>
  )
}

// ── 子元件：單欄編輯器 ────────────────────────────────────────

interface PhraseColumnProps {
  color:    'emerald' | 'rose'
  icon:     string
  title:    string
  count:    number
  input:    string
  setInput: (s: string) => void
  onAdd:    () => void
  phrases:  string[]
  onRemove: (idx: number) => void
  placeholder: string
}

const COLORS = {
  emerald: {
    bg:        'bg-emerald-50',
    border:    'border-emerald-200',
    title:     'text-emerald-700',
    chip:      'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
    button:    'bg-emerald-500 hover:bg-emerald-600 text-white'
  },
  rose: {
    bg:        'bg-rose-50',
    border:    'border-rose-200',
    title:     'text-rose-700',
    chip:      'bg-rose-100 text-rose-800 hover:bg-rose-200',
    button:    'bg-rose-500 hover:bg-rose-600 text-white'
  }
}

const PhraseColumn: React.FC<PhraseColumnProps> = ({
  color, icon, title, count, input, setInput, onAdd, phrases, onRemove, placeholder
}) => {
  const c = COLORS[color]
  return (
    <section className={`bg-white rounded-2xl border ${c.border} shadow-card p-5`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{icon}</span>
        <h3 className={`text-sm font-bold ${c.title}`}>
          {title}
          <span className="ml-2 text-xs font-normal text-gray-400">{count} 句</span>
        </h3>
      </div>

      {/* 新增區 */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }}
          placeholder={placeholder}
          maxLength={30}
          className="
            flex-1 h-9 px-3 text-sm
            bg-gray-50 border border-gray-200 rounded-lg
            focus:outline-none focus:border-brand-500 focus:bg-white
          "
        />
        <button
          onClick={onAdd}
          disabled={!input.trim()}
          className={`
            h-9 px-3 rounded-lg font-semibold text-sm
            disabled:opacity-40 disabled:cursor-not-allowed
            ${c.button}
          `}
        >
          ＋ 新增
        </button>
      </div>

      {/* 句子列表（chip 形式，點擊 ✕ 刪除） */}
      <div className="flex flex-wrap gap-1.5">
        {phrases.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">尚無句子</p>
        ) : phrases.map((p, idx) => (
          <span
            key={idx}
            className={`
              inline-flex items-center gap-1.5
              h-7 px-2.5 rounded-md text-xs font-medium
              ${c.chip}
            `}
          >
            {p}
            <button
              onClick={() => onRemove(idx)}
              className="opacity-50 hover:opacity-100 text-[10px]"
              title="刪除"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </section>
  )
}

export default PhrasesPage
