/**
 * RuleSection.tsx — 規則段落容器
 *
 * 每個邏輯區塊（例：「答對加分」「答錯扣分」「抽籤權重」）一個 RuleSection，
 * 統一視覺風格：圖示 + 標題 + 說明 + 內容。
 */

import React from 'react'

interface RuleSectionProps {
  icon:        string
  title:       string
  description?: string
  children:    React.ReactNode
}

export const RuleSection: React.FC<RuleSectionProps> = ({ icon, title, description, children }) => (
  <section className="bg-white rounded-2xl border border-gray-100 shadow-card p-5 mb-4">
    <div className="flex items-start gap-3 mb-4">
      <div className="text-2xl flex-shrink-0">{icon}</div>
      <div className="flex-1">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
    </div>
    <div>{children}</div>
  </section>
)

export default RuleSection
