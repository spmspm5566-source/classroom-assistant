/**
 * EmptyState.tsx — 空狀態提示
 *
 * 用於資料表沒有資料時顯示說明＋行動按鈕。
 */

import React from 'react'

interface EmptyStateProps {
  icon?:   React.ReactNode
  title:   string
  description?: string
  action?: React.ReactNode
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {icon && <div className="mb-4 text-gray-300 text-5xl">{icon}</div>}
    <h3 className="text-base font-semibold text-gray-700">{title}</h3>
    {description && (
      <p className="mt-1 text-sm text-gray-500 max-w-sm">{description}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
)

export default EmptyState
