/**
 * Sidebar.tsx — 主控台左側導覽列
 *
 * 點選後切換 useAppStore.currentPage，由 App.tsx 根據 page 渲染對應頁面。
 */

import React from 'react'
import { useAppStore, type ConsolePage } from '../store/useAppStore'

interface NavItem {
  page:     ConsolePage
  label:    string
  icon:     string
  group:    'main' | 'manage' | 'data'
}

const NAV_ITEMS: NavItem[] = [
  // ── 主功能 ──
  { page: 'home',      label: '首頁',       icon: '🏠', group: 'main' },

  // ── 資料管理 ──
  { page: 'classes',   label: '班級管理',   icon: '🏫', group: 'manage' },
  { page: 'students',  label: '學生與分組', icon: '👥', group: 'manage' },
  { page: 'rules',     label: '加分規則',   icon: '⚖️', group: 'manage' },
  { page: 'phrases',   label: '讚美/鼓勵',  icon: '💬', group: 'manage' },

  // ── 資料檢視 ──
  { page: 'dashboard', label: '加分總覽',   icon: '📊', group: 'data' },
  { page: 'exams',     label: '考試成績',   icon: '📝', group: 'data' },
  { page: 'export',    label: '匯出 Excel', icon: '📥', group: 'data' }
]

const Sidebar: React.FC = () => {
  const currentPage    = useAppStore(s => s.currentPage)
  const setCurrentPage = useAppStore(s => s.setCurrentPage)

  // 依 group 分組
  const groups = ['main', 'manage', 'data'] as const
  const groupLabels = { main: '', manage: '資料管理', data: '檢視與匯出' }

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col py-4 flex-shrink-0 overflow-y-auto">
      {groups.map(g => (
        <div key={g} className="mb-2">
          {groupLabels[g] && (
            <div className="px-5 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {groupLabels[g]}
            </div>
          )}
          {NAV_ITEMS.filter(i => i.group === g).map(item => (
            <button
              key={item.page}
              onClick={() => setCurrentPage(item.page)}
              className={`
                flex items-center gap-3 w-full px-4 py-2.5 mx-2 my-0.5 rounded-xl
                text-sm transition-colors duration-150 text-left
                ${currentPage === item.page
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100'}
              `}
              style={{ width: 'calc(100% - 1rem)' }}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  )
}

export default Sidebar
