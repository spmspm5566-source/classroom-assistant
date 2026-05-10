/**
 * Select.tsx — 共用下拉選單
 *
 * 純 HTML <select> + 統一樣式。對複雜場景（搜尋、多選）
 * 之後再導入 headless ui 或客製組件。
 */

import React from 'react'

interface SelectOption<T extends string | number = string> {
  value: T
  label: string
}

interface SelectProps<T extends string | number = string>
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  label?:    string
  error?:    string
  value:     T
  options:   SelectOption<T>[]
  placeholder?: string
  onChange:  (value: T) => void
}

export function Select<T extends string | number = string>({
  label,
  error,
  value,
  options,
  placeholder,
  onChange,
  className = '',
  id,
  ...rest
}: SelectProps<T>) {
  const autoId = React.useId()
  const selectId = id ?? autoId

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-gray-600">
          {label}
        </label>
      )}

      <div className={`
        relative
        bg-white border rounded-lg
        transition-colors duration-150
        focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500
        ${error ? 'border-red-400' : 'border-gray-200'}
      `}>
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className={`
            appearance-none w-full h-10 pl-3 pr-9 text-sm bg-transparent outline-none
            disabled:text-gray-400 disabled:cursor-not-allowed
            ${className}
          `}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(opt => (
            <option key={String(opt.value)} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* 自訂下拉箭頭 */}
        <svg
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export default Select
