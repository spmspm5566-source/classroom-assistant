/**
 * NumberField.tsx — 規則設定用的小型數字輸入欄位
 *
 * 比 shared/Input 更緊湊，適合表格式編輯多個數字。
 * 失焦時自動 clamp 到 [min, max]。
 */

import React from 'react'

interface NumberFieldProps {
  value:    number
  onChange: (v: number) => void
  label?:   string
  suffix?:  string   // 顯示在輸入框後的單位（「分」「秒」）
  min?:     number
  max?:     number
  step?:    number
  width?:   string   // tailwind w-XX
}

export const NumberField: React.FC<NumberFieldProps> = ({
  value, onChange, label, suffix,
  min = 0, max = 9999, step = 1, width = 'w-20'
}) => {
  // 內部用字串保留輸入過程（避免邊輸入邊 clamp）
  const [text, setText] = React.useState(String(value))

  React.useEffect(() => { setText(String(value)) }, [value])

  const commit = () => {
    const n = Number(text)
    if (!Number.isFinite(n)) {
      setText(String(value))
      return
    }
    const clamped = Math.max(min, Math.min(max, n))
    onChange(clamped)
    setText(String(clamped))
  }

  return (
    <label className="inline-flex items-center gap-1.5">
      {label && <span className="text-xs text-gray-600 select-none">{label}</span>}
      <input
        type="number"
        value={text}
        min={min} max={max} step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className={`
          ${width} h-8 px-2 text-sm font-mono
          bg-white border border-gray-200 rounded-md
          focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20
          text-center
        `}
      />
      {suffix && <span className="text-xs text-gray-500 select-none">{suffix}</span>}
    </label>
  )
}

export default NumberField
