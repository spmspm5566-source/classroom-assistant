/**
 * useAppStore.ts — 全域應用狀態（Zustand）
 *
 * 此 store 只放「跨頁面共用 + 不適合放資料庫」的瞬時狀態：
 *  - currentClassId        目前選擇的班級
 *  - currentExamPeriodId   目前段考期（第一次/第二次/第三次段考）
 *  - currentSessionId      本節課 session
 *  - currentPage           主控台目前頁面
 *  - isMuted               全域靜音
 *
 * 答對連對、答錯次數、抽籤權重 → 用 useScoringStore（另一檔案）
 *
 * currentClassId 與 currentExamPeriodId 持久化到 localStorage（重啟後記住），
 * 其他狀態不持久化（每次重啟歸零）。
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── 主控台頁面 ID ────────────────────────────────────────────

export type ConsolePage =
  | 'home'        // 首頁（三大工具卡片）
  | 'classes'     // 班級管理
  | 'students'    // 學生管理（含分組、座位）
  | 'rules'       // 加分規則
  | 'phrases'     // 讚美/鼓勵語料庫
  | 'dashboard'   // 加分總覽
  | 'exams'       // 考試成績輸入/匯入
  | 'export'      // 匯出 Excel
  | 'about'       // 關於

// ── State 介面 ───────────────────────────────────────────────

interface AppState {
  // 持久化欄位
  currentClassId:      string | null
  currentExamPeriodId: string | null
  isMuted:             boolean

  // 瞬時欄位（重啟歸零）
  currentSessionId: string | null
  currentPage:      ConsolePage
  studentsTab:      'list' | 'groups'   // 學生頁要開在哪個分頁

  // Actions
  setCurrentClass:      (classId: string | null) => void
  setCurrentExamPeriod: (periodId: string | null) => void
  setCurrentSession:    (sessionId: string | null) => void
  setCurrentPage:       (page: ConsolePage) => void
  setStudentsTab:       (tab: 'list' | 'groups') => void
  toggleMuted:          () => void
  setMuted:             (m: boolean) => void
}

// ── Store 實作 ───────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentClassId:      null,
      currentExamPeriodId: null,
      isMuted:             false,
      currentSessionId:    null,
      currentPage:         'home',
      studentsTab:         'list',

      // 切換班級時清空 session。examPeriodId 保留舊值，由 PeriodSwitcher / DrawerPage
      // 偵測到「此 ID 不屬於目前班級」時再自動切到該班最新一期（避免清空 → 自動選 →
      // 兩個 useEffect 互相觸發造成無限渲染迴圈）。
      setCurrentClass:      (classId) => set({
        currentClassId:      classId,
        currentSessionId:    null
      }),
      setCurrentExamPeriod: (periodId) => set({ currentExamPeriodId: periodId }),
      setCurrentSession:    (sessionId) => set({ currentSessionId: sessionId }),
      setCurrentPage:       (page) => set({ currentPage: page }),
      setStudentsTab:       (tab) => set({ studentsTab: tab }),
      toggleMuted:          () => set(s => ({ isMuted: !s.isMuted })),
      setMuted:             (m) => set({ isMuted: m })
    }),
    {
      name: 'classroom-assistant-app',
      // 只持久化跨 session 的欄位
      partialize: (s) => ({
        currentClassId:      s.currentClassId,
        currentExamPeriodId: s.currentExamPeriodId,
        isMuted:             s.isMuted
      })
    }
  )
)
