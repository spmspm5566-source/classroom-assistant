/**
 * DrawerControls.tsx — 抽籤控制列
 *
 * 顯示在抽籤器頁面下方的控制區，包含：
 *  - 抽籤模式切換（全班 / 組長 / 助教 / 員 A~D）
 *  - 隨機抽籤大按鈕
 *  - 全班作答模式入口
 */

import React from 'react'
import type { DrawMode } from '../../utils/draw'
import { DRAW_MODE_LABELS } from '../../utils/draw'

interface DrawerControlsProps {
  drawMode:        DrawMode
  candidateCount:  number       // 目前模式下候選人數
  isSpinning:      boolean
  onSetMode:       (mode: DrawMode) => void
  onDraw:          () => void
  onManualPick:    () => void
  onClassMode:     () => void
}

const MODE_TABS: DrawMode[] = ['all', 'leader', 'assistant', 'memberA', 'memberB', 'memberC', 'memberD']

const DrawerControls: React.FC<DrawerControlsProps> = ({
  drawMode,
  candidateCount,
  isSpinning,
  onSetMode,
  onDraw,
  onManualPick,
  onClassMode
}) => {
  return (
    <div className="flex flex-col gap-1.5 no-drag">

      {/* ── 模式切換 ── */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
        <span className="text-[10px] text-gray-500 flex-shrink-0 mr-1">抽籤模式</span>
        {MODE_TABS.map(m => (
          <button
            key={m}
            disabled={isSpinning}
            onClick={() => onSetMode(m)}
            className={`
              flex-shrink-0 h-6 px-2 rounded-md text-[10px] font-medium transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              ${drawMode === m
                ? 'bg-rose-500 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700'}
            `}
          >
            {DRAW_MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* ── 主操作鈕 ── */}
      <div className="flex gap-2 items-center">
        {/* 候選提示 */}
        <div className="text-[10px] text-gray-500 flex-shrink-0">
          候選 <span className="text-gray-800 font-bold">{candidateCount}</span> 人
        </div>

        {/* 隨機抽籤大按鈕 */}
        <button
          onClick={onDraw}
          disabled={isSpinning || candidateCount === 0}
          className={`
            flex-1 h-11 rounded-xl
            text-white font-bold text-sm
            shadow-md
            transition-all
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isSpinning
              ? 'bg-gray-400'
              : 'bg-gradient-to-br from-rose-500 to-pink-600 hover:shadow-lg active:scale-95'}
          `}
        >
          {isSpinning ? '🌀 抽籤中…' : '🎲 隨機抽籤'}
        </button>

        {/* 老師指定 */}
        <button
          onClick={onManualPick}
          disabled={isSpinning}
          className="
            flex-shrink-0 h-11 px-3 rounded-xl
            bg-white border border-amber-300 hover:bg-amber-50
            text-amber-700 text-xs font-semibold
            disabled:opacity-50
          "
          title="老師指定學生（不抽籤）"
        >
          👆 指定
        </button>

        {/* 全班作答 */}
        <button
          onClick={onClassMode}
          disabled={isSpinning}
          className="
            flex-shrink-0 h-11 px-3 rounded-xl
            bg-white border border-gray-300 hover:bg-gray-50
            text-gray-700 text-xs font-semibold
            disabled:opacity-50
          "
          title="全班作答模式"
        >
          👥 全班
        </button>
      </div>
    </div>
  )
}

export default DrawerControls
