/**
 * Sidebar.tsx — 主控台左側導覽列（可收合）
 *
 * 點選後切換 useAppStore.currentPage，由 App.tsx 根據 page 渲染對應頁面。
 * 頂端的 ☰ 按鈕可收合 / 展開側邊欄：
 *  - 展開：顯示圖示 + 文字（w-56）
 *  - 收合：只顯示圖示（w-14），滑鼠移上去顯示提示文字
 * 收合狀態會記住（持久化於 localStorage）。
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
  { page: 'rules',     label: '加分規則',   icon: '⚖️', group: 'manage' },
  { page: 'phrases',   label: '讚美/鼓勵',  icon: '💬', group: 'manage' },

  // ── 資料檢視 ──
  { page: 'dashboard', label: '加分總覽',   icon: '📊', group: 'data' },
  { page: 'exams',     label: '考試成績',   icon: '📝', group: 'data' },
  { page: 'export',    label: '匯出 Excel', icon: '📥', group: 'data' }
]

const COLLAPSE_KEY = 'ca-sidebar-collapsed'

const Sidebar: React.FC = () => {
  const currentPage    = useAppStore(s => s.currentPage)
  const setCurrentPage = useAppStore(s => s.setCurrentPage)

  // 收合狀態（記住於 localStorage）
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })
  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  // 依 group 分組
  const groups = ['main', 'manage', 'data'] as const
  const groupLabels = { main: '', manage: '資料管理', data: '檢視與匯出' }

  return (
    <aside
      className={`
        bg-white border-r border-gray-200 flex flex-col py-3 flex-shrink-0 overflow-y-auto
        transition-[width] duration-200
        ${collapsed ? 'w-14' : 'w-56'}
      `}
    >
      {/* ── 收合 / 展開按鈕 ── */}
      <button
        onClick={toggle}
        title={collapsed ? '展開選單' : '收合選單'}
        className={`
          flex items-center gap-3 mx-2 mb-2 px-3 py-2 rounded-xl
          text-gray-500 hover:bg-gray-100 transition-colors
          ${collapsed ? 'justify-center' : ''}
        `}
      >
        <span className="text-base">{collapsed ? '☰' : '«'}</span>
        {!collapsed && <span className="text-sm">收合選單</span>}
      </button>

      {groups.map(g => (
        <div key={g} className="mb-2">
          {!collapsed && groupLabels[g] && (
            <div className="px-5 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {groupLabels[g]}
            </div>
          )}
          {collapsed && g !== 'main' && (
            <div className="mx-3 my-1 border-t border-gray-100" />
          )}
          {NAV_ITEMS.filter(i => i.group === g).map(item => (
            <button
              key={item.page}
              onClick={() => setCurrentPage(item.page)}
              title={collapsed ? item.label : undefined}
              className={`
                flex items-center gap-3 my-0.5 rounded-xl
                text-sm transition-colors duration-150 text-left
                ${collapsed ? 'justify-center mx-2 px-0 py-2.5 w-10' : 'px-4 py-2.5 mx-2'}
                ${currentPage === item.page
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100'}
              `}
              style={collapsed ? undefined : { width: 'calc(100% - 1rem)' }}
            >
              <span className="text-base">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </div>
      ))}
    </aside>
  )
}

export default Sidebar
