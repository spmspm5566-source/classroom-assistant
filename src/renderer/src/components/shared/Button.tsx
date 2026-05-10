/**
 * Button.tsx — 共用按鈕元件
 *
 * 變體：primary（品牌主色）/ secondary（淺灰）/ danger（紅）/ ghost（透明）
 * 尺寸：sm / md / lg
 */

import React from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?:    Size
  icon?:    React.ReactNode
  loading?: boolean
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:   'bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-sm',
  secondary: 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800',
  danger:    'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm',
  ghost:     'bg-transparent hover:bg-gray-100 active:bg-gray-200 text-gray-700'
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-xl'
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size    = 'md',
  icon,
  loading = false,
  children,
  className = '',
  disabled,
  ...rest
}) => {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center
        font-medium
        transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${VARIANT_CLASSES[variant]}
        ${SIZE_CLASSES[size]}
        ${className}
      `}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
}

const Spinner: React.FC = () => (
  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M12 2 a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
)

export default Button
