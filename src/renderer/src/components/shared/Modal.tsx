/**
 * Modal.tsx — 共用對話框
 *
 * 使用 Framer Motion 做進出場動畫，背景遮罩可點擊關閉。
 */

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ModalProps {
  open:      boolean
  onClose:   () => void
  title?:    string
  width?:    'sm' | 'md' | 'lg' | 'xl'
  children:  React.ReactNode
  footer?:   React.ReactNode
}

const WIDTH_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  width = 'md',
  children,
  footer
}) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          // ── 背景遮罩 ──
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          {/* ── 內容卡片：阻止冒泡，避免點到自己關閉 ── */}
          <motion.div
            className={`
              w-full ${WIDTH_CLASSES[width]}
              bg-white rounded-2xl shadow-2xl
              flex flex-col
              max-h-[85vh]
            `}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.18 }}
            onClick={e => e.stopPropagation()}
          >
            {/* 標題列 */}
            {title && (
              <div className="flex items-center justify-between px-6 h-14 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700"
                  title="關閉"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}

            {/* 內容 */}
            <div className="flex-1 overflow-auto p-6">
              {children}
            </div>

            {/* 底部按鈕區 */}
            {footer && (
              <div className="flex items-center justify-end gap-2 px-6 h-16 border-t border-gray-100 flex-shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default Modal
