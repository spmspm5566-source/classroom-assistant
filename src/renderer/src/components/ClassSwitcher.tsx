/**
 * ClassSwitcher.tsx — 上方班級切換下拉選單
 *
 * 從 Dexie 撈出所有班級，存到 useAppStore.currentClassId。
 * 切換班級時同時清空 currentSessionId（換班=換節）。
 */

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listClasses } from '../db/classRepo'
import { useAppStore } from '../store/useAppStore'

const ClassSwitcher: React.FC = () => {
  const classes        = useLiveQuery(() => listClasses(), [], [])
  const currentClassId = useAppStore(s => s.currentClassId)
  const setCurrentClass = useAppStore(s => s.setCurrentClass)
  const setCurrentPage = useAppStore(s => s.setCurrentPage)

  // 若還沒選班級且有班級資料，自動選第一個
  React.useEffect(() => {
    if (!currentClassId && classes && classes.length > 0) {
      setCurrentClass(classes[0].id)
    }
  }, [classes, currentClassId, setCurrentClass])

  // 沒有班級時引導去新增
  if (!classes || classes.length === 0) {
    return (
      <button
        onClick={() => setCurrentPage('classes')}
        className="
          flex items-center gap-2 px-3 h-9 rounded-lg
          bg-amber-50 text-amber-700 text-sm font-medium border border-amber-200
          hover:bg-amber-100
        "
      >
        ⚠ 尚未建立班級，點此新增
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">目前班級</span>
      <select
        value={currentClassId ?? ''}
        onChange={(e) => setCurrentClass(e.target.value || null)}
        className="
          appearance-none h-9 pl-3 pr-8 rounded-lg
          bg-white border border-gray-200
          text-sm font-medium text-gray-800
          hover:border-gray-300
          focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20
          bg-no-repeat bg-right
        "
        style={{
          backgroundImage:    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundPosition: 'right 8px center'
        }}
      >
        {classes.map(c => (
          <option key={c.id} value={c.id}>{c.grade} 年 {c.name} 班</option>
        ))}
      </select>
    </div>
  )
}

export default ClassSwitcher
