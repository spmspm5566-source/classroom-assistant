/**
 * HomePage.tsx — 主控台首頁
 *
 * 顯示已建立的班級清單；點班級即切換並進入「分組座位表」。
 * 底部顯示鎖屏快捷區（閒置分鐘 + 立刻鎖屏）。
 */

import React from 'react'
import { motion } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAppStore }      from '../store/useAppStore'
import { useAuthStore }     from '../store/useAuthStore'
import { listClasses }      from '../db/classRepo'
import { getConfig, setAutoLockMinutes } from '../db/configRepo'
import type { Class } from '../db/schema'
import Button    from '../components/shared/Button'
import EmptyState from '../components/shared/EmptyState'

const HomePage: React.FC = () => {
  const classes              = useLiveQuery(() => listClasses(), [], [])
  const config               = useLiveQuery(() => getConfig(), [], null)
  const currentClassId       = useAppStore(s => s.currentClassId)
  const setCurrentClass      = useAppStore(s => s.setCurrentClass)
  const setCurrentExamPeriod = useAppStore(s => s.setCurrentExamPeriod)
  const setCurrentPage       = useAppStore(s => s.setCurrentPage)
  const setStudentsTab       = useAppStore(s => s.setStudentsTab)
  const lock                 = useAuthStore(s => s.lock)

  const autoLock = config?.prefs.autoLockMinutes ?? 30

  // 點班級 → 切換並進入分組座位表
  const enterSeating = (cls: Class) => {
    if (cls.id !== currentClassId) {
      setCurrentClass(cls.id)
      setCurrentExamPeriod(null)
    }
    setStudentsTab('groups')
    setCurrentPage('students')
  }

  return (
    <div className="p-8 max-w-5xl space-y-8">
      {/* ── 歡迎標語 ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl font-bold text-gray-800 mb-1">
          👋 歡迎使用班級助手
        </h1>
        <p className="text-sm text-gray-500">
          點選班級即可進入分組座位表，於座位表上計時、抽籤、查加分。
        </p>
      </motion.div>

      {/* ── 班級清單 ── */}
      {(!classes || classes.length === 0) ? (
        <EmptyState
          icon="🏫"
          title="尚未建立任何班級"
          description="請先到左側「班級管理」新增班級"
          action={
            <Button onClick={() => setCurrentPage('classes')}>
              前往班級管理
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls, idx) => {
            const isCurrent = cls.id === currentClassId
            return (
              <motion.button
                key={cls.id}
                onClick={() => enterSeating(cls)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.04 * idx }}
                whileHover={{ y: -3 }}
                className={`
                  text-left bg-white rounded-2xl border-2 shadow-card p-5
                  transition-all hover:shadow-lg
                  ${isCurrent ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-100 hover:border-gray-200'}
                `}
              >
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-gray-800 truncate">
                    {cls.grade} 年 {cls.name} 班
                  </h3>
                </div>
                <p className="text-xs text-gray-500">
                  學期 {cls.semester} ・ 分組：{cls.defaultGroupCount ?? 6}組
                </p>
                <p className="mt-3 text-xs text-brand-600 font-medium">
                  點此進入分組加分系統 →
                </p>
              </motion.button>
            )
          })}
        </div>
      )}

      {/* ── 鎖屏快捷區 ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-card p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🔐</span>
          <div>
            <h2 className="text-sm font-bold text-gray-800">安全與鎖屏</h2>
            <p className="text-xs text-gray-400">離開教室前一鍵鎖屏，防止學生偷看</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 閒置自動鎖屏 */}
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-2">閒置多少分鐘自動鎖屏</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={autoLock}
                onChange={e => {
                  const v = parseInt(e.target.value.replace(/\D/g, '') || '0', 10)
                  setAutoLockMinutes(Math.min(240, Math.max(0, v)))
                }}
                className="
                  w-16 h-9 px-2 text-center text-sm font-bold
                  bg-white border border-gray-200 rounded-lg
                  focus:outline-none focus:border-brand-500
                "
              />
              <span className="text-sm text-gray-600">分鐘</span>
              {autoLock === 0 && (
                <span className="text-xs text-amber-600 font-medium">永不自動鎖</span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">0 = 永不自動鎖；建議設 30 分鐘</p>
          </div>

          {/* 立即鎖屏 */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex flex-col justify-between">
            <p className="text-xs text-gray-500 mb-2">立即鎖屏</p>
            <button
              onClick={lock}
              className="
                flex items-center justify-center gap-2
                h-9 px-4 rounded-lg text-sm font-semibold
                bg-gray-800 text-white
                hover:bg-gray-900 active:scale-[0.98] transition
                shadow-sm
              "
            >
              🔒 立刻回到鎖屏畫面
            </button>
            <p className="text-[11px] text-gray-400 mt-1.5">標題列右上的鎖頭圖示也是同一個功能</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default HomePage
