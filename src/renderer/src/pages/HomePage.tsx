/**
 * HomePage.tsx — 主控台首頁
 *
 * 顯示三大工具卡片（計時器、抽籤器、加分簿），
 * 並提供「進入懸浮模式」的快捷按鈕。
 */

import React from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'
import { primeAudio } from '../utils/audio'
import { isElectron } from '../utils/platform'
import type { WindowMode } from '../hooks/useWindowMode'

interface HomePageProps {
  onToggleMiniMode: () => void
  onOpenTool:       (mode: WindowMode) => void
}

interface ToolCard {
  id:       string
  title:    string
  desc:     string
  icon:     string
  color:    string
  disabled?: boolean
  onClick:  () => void
}

const HomePage: React.FC<HomePageProps> = ({ onToggleMiniMode, onOpenTool }) => {
  const setCurrentPage = useAppStore(s => s.setCurrentPage)
  const currentClassId = useAppStore(s => s.currentClassId)
  const electron       = isElectron()

  // 啟動工具前先解除瀏覽器音效播放限制（必須由使用者點擊觸發）
  const openTool = (mode: WindowMode) => {
    primeAudio()
    onOpenTool(mode)
  }

  const tools: ToolCard[] = [
    {
      id:    'timer',
      title: '⏱ 計時器',
      desc:  '可自訂倒數秒數，快到時聲響提醒，到時響鈴。可懸浮在最上層。',
      icon:  '⏱',
      color: 'from-amber-400 to-orange-500',
      onClick: () => openTool('timer')
    },
    {
      id:    'drawer',
      title: '🎲 抽籤器',
      desc:  '輪盤式抽籤，全班或依角色。答對自動加分，答錯下次機率提升。',
      icon:  '🎲',
      color: 'from-rose-400 to-pink-500',
      disabled: !currentClassId,
      onClick: () => openTool('drawer')
    },
    {
      id:    'scoreboard',
      title: '📊 加分總覽',
      desc:  '查看每組與個人累計分數，每週小結與段考結算，匯出 Excel。',
      icon:  '📊',
      color: 'from-blue-400 to-indigo-500',
      disabled: !currentClassId,
      onClick: () => setCurrentPage('dashboard')
    }
  ]

  return (
    <div className="p-8 max-w-5xl">
      {/* ── 歡迎標語 ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-gray-800 mb-1">
          👋 歡迎使用班級助手
        </h1>
        <p className="text-sm text-gray-500">
          整合計時器、抽籤器、分組加分競賽的課堂互動工具。
        </p>
      </motion.div>

      {/* ── 三大工具卡片 ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {tools.map((tool, idx) => (
          <motion.button
            key={tool.id}
            onClick={tool.onClick}
            disabled={tool.disabled}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 * idx }}
            whileHover={!tool.disabled ? { y: -4, scale: 1.02 } : undefined}
            className={`
              relative overflow-hidden
              bg-white rounded-2xl shadow-card border border-gray-100
              p-6 text-left
              transition-shadow
              ${tool.disabled ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-lg cursor-pointer'}
            `}
          >
            {/* 漸層裝飾條 */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${tool.color}`} />

            <div className="text-3xl mb-3">{tool.icon}</div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">{tool.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed">{tool.desc}</p>

            {tool.disabled ? (
              <div className="mt-3 inline-block text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                {(tool.id === 'scoreboard' || tool.id === 'drawer') ? '請先建立班級' : '開發中'}
              </div>
            ) : (
              <div className="mt-3 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                ✓ 可使用
              </div>
            )}
          </motion.button>
        ))}
      </div>

      {/* ── 懸浮模式按鈕（僅 Electron 桌面版顯示；瀏覽器無此能力） ── */}
      {electron && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="bg-gradient-to-br from-brand-50 to-white rounded-2xl border border-brand-100 p-6"
        >
          <h3 className="text-base font-semibold text-gray-800 mb-1">📌 懸浮模式</h3>
          <p className="text-xs text-gray-500 mb-4">
            將視窗縮成右上角小元件，浮在所有應用程式之上，可拖曳到任意角落。
          </p>
          <button
            onClick={onToggleMiniMode}
            className="
              inline-flex items-center gap-2
              px-5 py-2.5 rounded-xl
              bg-brand-600 hover:bg-brand-700
              text-white text-sm font-medium
              transition-colors
              shadow-sm
            "
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="10" y1="14" x2="21" y2="3" />
              <line x1="3" y1="21" x2="14" y2="10" />
            </svg>
            切換至懸浮模式
          </button>
        </motion.div>
      )}
    </div>
  )
}

export default HomePage
