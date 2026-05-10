/**
 * Input.tsx — 共用文字輸入元件
 *
 * 支援 label、error、prefix/suffix（可放圖示）
 */

import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:  string
  error?:  string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  prefix,
  suffix,
  className = '',
  id,
  ...rest
}) => {
  // 自動產生 id 以連結 label（必須無條件呼叫 useId）
  const autoId = React.useId()
  const inputId = id ?? autoId

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-gray-600">
          {label}
        </label>
      )}

      <div className={`
        flex items-center
        bg-white border rounded-lg
        transition-colors duration-150
        focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500
        ${error ? 'border-red-400' : 'border-gray-200'}
      `}>
        {prefix && <span className="pl-3 text-gray-400">{prefix}</span>}
        <input
          id={inputId}
          className={`
            flex-1 h-10 px-3 text-sm bg-transparent outline-none
            disabled:text-gray-400 disabled:cursor-not-allowed
            ${className}
          `}
          {...rest}
        />
        {suffix && <span className="pr-3 text-gray-400">{suffix}</span>}
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}

export default Input
