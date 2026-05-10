/**
 * MiniWidget.tsx — 懸浮模式小圖示元件
 *
 * 設計目標：
 *  - 尺寸極小（280×72px），不干擾教學操作
 *  - 整個背景為拖曳區域，可拖曳到螢幕任意位置
 *  - 只保留最核心的快捷功能按鈕
 *  - 「還原」按鈕點擊後切換回一般模式
 *
 * 拖曳實作：
 *  外層 div 加上 drag-region class（-webkit-app-region: drag），
 *  Electron 會自動接管滑鼠拖曳事件並移動視窗，無需 JavaScript 計算座標。
 *  互動按鈕須加 no-drag class 排除，否則點擊會被誤判為拖曳。
 */

import React from 'react'

interface MiniWidgetProps {
  onRestore: () => void  // 點擊還原後切回一般模式
  onClose:   () => void
}

const MiniWidget: React.FC<MiniWidgetProps> = ({ onRestore, onClose }) => {
  return (
    /*
     * 外層容器：
     *  - drag-region：整體可拖曳
     *  - widget-enter：入場動畫（CSS keyframes）
     *  - shadow-widget：強調懸浮感
     *  - rounded-2xl：圓角讓小元件視覺更柔和
     */
    <div
      className="
        drag-region widget-enter
        w-full h-full
        bg-brand-900
        rounded-2xl
        shadow-widget
        flex items-center justify-between
        px-4
        border border-brand-700/60
      "
    >
      {/* ── 左側：識別標示 ── */}
      <div className="flex items-center gap-2 pointer-events-none">
        {/* Logo 圓點 */}
        <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          C
        </div>
        <div>
          <p className="text-white text-xs font-semibold leading-tight">班級助手</p>
          <p className="text-brand-300 text-[10px] leading-tight">懸浮模式</p>
        </div>
      </div>

      {/* ── 右側：快速操作按鈕 ── */}
      <div className="no-drag flex items-center gap-1">

        {/* 還原至一般模式 */}
        <WidgetButton
          onClick={onRestore}
          title="還原視窗"
          className="hover:bg-brand-600"
        >
          {/* 展開圖示 */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </WidgetButton>

        {/* 關閉 */}
        <WidgetButton
          onClick={onClose}
          title="關閉程式"
          className="hover:bg-red-600"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </WidgetButton>
      </div>
    </div>
  )
}

// ── 輔助元件：Mini Widget 按鈕 ─────────────────────────────────

interface WidgetButtonProps {
  onClick:    () => void
  title:      string
  className?: string
  children:   React.ReactNode
}

const WidgetButton: React.FC<WidgetButtonProps> = ({ onClick, title, className = '', children }) => (
  <button
    onClick={onClick}
    title={title}
    className={`
      w-7 h-7 rounded-lg flex items-center justify-center
      text-white/70 hover:text-white
      transition-colors duration-150
      ${className}
    `}
  >
    {children}
  </button>
)

export default MiniWidget
