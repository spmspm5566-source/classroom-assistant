/**
 * TitleBar.tsx — 自訂視窗標題列（一般模式）
 *
 * 與 v1 相比新增：
 *  - 中央：班級切換下拉選單（ClassSwitcher）
 *  - 右側：全域靜音按鈕、懸浮模式、最小化、最大化、關閉
 */

import React from 'react'
import ClassSwitcher  from './ClassSwitcher'
import PeriodSwitcher from './PeriodSwitcher'
import { useAppStore }  from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { isElectron }   from '../utils/platform'

interface TitleBarProps {
  onMinimize:       () => void
  onMaximize:       () => void
  onClose:          () => void
  onToggleMiniMode: () => void
}

const TitleBar: React.FC<TitleBarProps> = ({
  onMinimize,
  onMaximize,
  onClose,
  onToggleMiniMode
}) => {
  const isMuted     = useAppStore(s => s.isMuted)
  const toggleMuted = useAppStore(s => s.toggleMuted)
  const lock        = useAuthStore(s => s.lock)
  const electron    = isElectron()

  return (
    <div className={`${electron ? 'drag-region' : ''} flex items-center justify-between h-12 bg-brand-900 px-3 flex-shrink-0`}>

      {/* ── 左側：應用程式名稱 ── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center text-white text-xs font-bold">
          C
        </div>
        <span className="text-white text-sm font-semibold tracking-wide">
          班級助手
        </span>
      </div>

      {/* ── 中央：班級切換 + 段考期切換 ── */}
      <div className="no-drag flex-1 flex justify-center items-center gap-3">
        <ClassSwitcher />
        <PeriodSwitcher />
      </div>

      {/* ── 右側：操作按鈕 ── */}
      <div className="no-drag flex items-center gap-1 flex-shrink-0">

        {/* 立即鎖屏 */}
        <TitleBarButton
          onClick={lock}
          title="立即鎖屏（離開教室前按一下）"
          className="hover:bg-brand-700"
        >
          <IconLock />
        </TitleBarButton>

        {/* 靜音切換 */}
        <TitleBarButton
          onClick={toggleMuted}
          title={isMuted ? '取消靜音' : '全域靜音'}
          className={isMuted ? 'text-amber-300 hover:bg-brand-700' : 'hover:bg-brand-700'}
        >
          {isMuted ? <IconMuted /> : <IconSound />}
        </TitleBarButton>

        {/* 切換懸浮模式（僅 Electron 桌面版） */}
        {electron && (
          <TitleBarButton onClick={onToggleMiniMode} title="切換懸浮模式" className="hover:bg-brand-700">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="10" y1="14" x2="21" y2="3" />
              <line x1="3" y1="21" x2="14" y2="10" />
            </svg>
          </TitleBarButton>
        )}

        {/* 視窗操作（僅 Electron 桌面版；瀏覽器用瀏覽器自己的標題列） */}
        {electron && (
          <>
            <div className="w-px h-5 bg-brand-700 mx-1" />

            <TitleBarButton onClick={onMinimize} title="最小化" className="hover:bg-brand-700">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </TitleBarButton>

            <TitleBarButton onClick={onMaximize} title="最大化" className="hover:bg-brand-700">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            </TitleBarButton>

            <TitleBarButton onClick={onClose} title="關閉" className="hover:bg-red-600">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </TitleBarButton>
          </>
        )}
      </div>
    </div>
  )
}

// ── 小型輔助元件：標題列按鈕 ─────────────────────────────────

interface TitleBarButtonProps {
  onClick:   () => void
  title:     string
  className?: string
  children:  React.ReactNode
}

const TitleBarButton: React.FC<TitleBarButtonProps> = ({ onClick, title, className = '', children }) => (
  <button
    onClick={onClick}
    title={title}
    className={`
      w-8 h-8 rounded flex items-center justify-center
      text-white/70 hover:text-white
      transition-colors duration-150
      ${className}
    `}
  >
    {children}
  </button>
)

// ── 圖示 ──

const IconSound: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
)

const IconMuted: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="22" y1="9" x2="16" y2="15" />
    <line x1="16" y1="9" x2="22" y2="15" />
  </svg>
)

const IconLock: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

export default TitleBar
