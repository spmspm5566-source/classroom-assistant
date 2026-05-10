/**
 * PlaceholderPage.tsx — 尚未實作的頁面占位符
 *
 * 階段 2 之後會逐一替換。
 */

import React from 'react'
import EmptyState from '../components/shared/EmptyState'

interface PlaceholderPageProps {
  title:    string
  icon:     string
  comingIn: string   // 「下個階段」「階段 X」之類
  description?: string
}

const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title, icon, comingIn, description }) => (
  <div className="p-8 max-w-3xl">
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-gray-800">{icon} {title}</h1>
      {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
    </div>
    <EmptyState
      icon="🛠"
      title="此功能開發中"
      description={`此頁面預定於${comingIn}實作完成。`}
    />
  </div>
)

export default PlaceholderPage
