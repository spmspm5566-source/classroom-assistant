/**
 * App.tsx — 根元件
 *
 * 雙層路由結構：
 *  外層：根據 windowMode（normal / timer / drawer / mini）切換 UI
 *  內層：當 normal 時，根據 useAppStore.currentPage 切換主控台各頁面
 *
 * 額外職責：
 *  - 啟動全域 timer tick（不論在哪個模式都持續倒數）
 *  - 維持單一 BrowserWindow，所有狀態靠 Zustand 共享
 */

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useWindowMode } from './hooks/useWindowMode'
import { useAppStore }   from './store/useAppStore'
import { useAuthStore }  from './store/useAuthStore'
import { startTimerTick } from './store/useTimerStore'
import { getConfig }     from './db/configRepo'
import { listClasses }   from './db/classRepo'
import { getCurrentSchoolYear, isNewSchoolYearTriggerWindow } from './utils/semester'

import TitleBar      from './components/TitleBar'
import Sidebar       from './components/Sidebar'
import MiniWidget    from './components/MiniWidget'
import ErrorBoundary from './components/ErrorBoundary'
import LockScreen    from './components/LockScreen'

// ── 各頁面 ──
import HomePage         from './pages/HomePage'
import ClassesPage      from './pages/ClassesPage'
import StudentsPage     from './pages/StudentsPage'
import TimerPage        from './pages/TimerPage'
import DrawerPage       from './pages/DrawerPage'
import RulesPage        from './pages/RulesPage'
import PhrasesPage      from './pages/PhrasesPage'
import DashboardPage    from './pages/DashboardPage'
import ExamsPage        from './pages/ExamsPage'
import ExportPage       from './pages/ExportPage'
import PlaceholderPage  from './pages/PlaceholderPage'

const App: React.FC = () => {
  const {
    mode, isMini, isTimer, isDrawer,
    setMode, toggleMiniMode, goNormal,
    minimize, maximize, close
  } = useWindowMode()
  const currentPage = useAppStore(s => s.currentPage)
  const isAuthed    = useAuthStore(s => s.isAuthed)
  const lock        = useAuthStore(s => s.lock)

  // ── 啟動倒數 tick（整個 App 生命週期內持續運作）──
  React.useEffect(() => {
    startTimerTick()
  }, [])

  // ── 閒置自動鎖屏 ─────────────────────────────────────────
  // 滑鼠/鍵盤/觸控任何活動都重置計時器；超過 prefs.autoLockMinutes → lock()
  const config = useLiveQuery(() => getConfig(), [], null)
  const autoLockMinutes = config?.prefs.autoLockMinutes ?? 30
  React.useEffect(() => {
    if (!isAuthed) return
    if (autoLockMinutes <= 0) return    // 0 = 永不自動鎖

    let timerId: ReturnType<typeof setTimeout> | null = null
    const reset = (): void => {
      if (timerId) clearTimeout(timerId)
      timerId = setTimeout(lock, autoLockMinutes * 60 * 1000)
    }
    const events: (keyof DocumentEventMap)[] =
      ['mousedown', 'keydown', 'touchstart', 'mousemove']
    events.forEach(e => document.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      if (timerId) clearTimeout(timerId)
      events.forEach(e => document.removeEventListener(e, reset))
    }
  }, [isAuthed, autoLockMinutes, lock])

  // ── 自動偵測新學年 → 跳提示升年級 ─────────────────────────
  // 條件：(1) 已登入  (2) 在 8~11 月學期初  (3) 此學年還沒處理過  (4) 有班級可升
  const lastPromoted = config?.prefs.lastPromotedSchoolYear
  React.useEffect(() => {
    if (!isAuthed) return
    if (!config) return
    const currentYear = getCurrentSchoolYear()
    if ((lastPromoted ?? -1) >= currentYear) return    // 此學年已處理過
    if (!isNewSchoolYearTriggerWindow()) return        // 不在 8~11 月

    // 一次性檢查：開 App 後延遲 2 秒問
    const id = setTimeout(async () => {
      const classes = await listClasses()
      const upgradable = classes.filter(c => !c.graduated)
      if (upgradable.length === 0) return

      const ok = window.confirm(
        `📈 新學年（${currentYear} 學年）來囉！\n\n` +
        `目前有 ${upgradable.length} 個未畢業班級，要現在「全班升年級」嗎？\n\n` +
        `（按取消會在下次重啟 App 時再提醒；\n` +
        `也可至「班級管理」頁面手動操作。）`
      )
      if (ok) {
        useAppStore.getState().setCurrentPage('classes')
      }
      // 不論按確定或取消，這次都記為已處理（避免每次開都跳；要再提醒可手動到班級管理頁）
      // 不寫入：保留下次提醒的機會
      // 寫入：把今年標記為已處理，老師有空再處理
      // 改採折衷：按「取消」不寫入（下次再提醒），按「確定」由 ClassesPage 自己寫入
    }, 2000)

    return () => clearTimeout(id)
  }, [isAuthed, config, lastPromoted])

  // ── 未驗證 → 顯示鎖屏（覆蓋一切，含浮動視窗模式）──
  if (!isAuthed) {
    return <LockScreen />
  }

  // ── 計時器浮動視窗 ───────────────────────────────────────
  if (isTimer) {
    return (
      <div className="w-screen h-screen overflow-hidden">
        <ErrorBoundary fallbackTitle="計時器發生錯誤">
          <TimerPage onClose={goNormal} />
        </ErrorBoundary>
      </div>
    )
  }

  // ── 抽籤器浮動視窗 ───────────────────────────────────────
  if (isDrawer) {
    return (
      <div className="w-screen h-screen overflow-hidden">
        <ErrorBoundary fallbackTitle="抽籤器發生錯誤">
          <DrawerPage onClose={goNormal} />
        </ErrorBoundary>
      </div>
    )
  }

  // ── 懸浮模式（小球）─────────────────────────────────────
  if (isMini) {
    return (
      <div className="w-screen h-screen overflow-hidden">
        <ErrorBoundary fallbackTitle="懸浮模式發生錯誤">
          <MiniWidget onRestore={toggleMiniMode} onClose={close} />
        </ErrorBoundary>
      </div>
    )
  }

  // ── 一般模式：主控台 ──────────────────────────────────────
  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden">
      <TitleBar
        onMinimize={minimize}
        onMaximize={maximize}
        onClose={close}
        onToggleMiniMode={toggleMiniMode}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-gray-50">
          <ErrorBoundary fallbackTitle="頁面發生錯誤">
            <PageRouter
              currentPage={currentPage}
              onToggleMiniMode={toggleMiniMode}
              onOpenTool={setMode}
            />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

// ── 內部路由：依 currentPage 渲染對應頁 ────────────────────

interface PageRouterProps {
  currentPage:      ReturnType<typeof useAppStore.getState>['currentPage']
  onToggleMiniMode: () => void
  onOpenTool:       (mode: 'timer' | 'drawer' | 'mini' | 'normal') => void
}

const PageRouter: React.FC<PageRouterProps> = ({ currentPage, onToggleMiniMode, onOpenTool }) => {
  switch (currentPage) {
    case 'home':
      return <HomePage onToggleMiniMode={onToggleMiniMode} onOpenTool={onOpenTool} />
    case 'classes':
      return <ClassesPage />
    case 'students':
      return <StudentsPage />
    case 'rules':
      return <RulesPage />
    case 'phrases':
      return <PhrasesPage />
    case 'dashboard':
      return <DashboardPage />
    case 'exams':
      return <ExamsPage />
    case 'export':
      return <ExportPage />
    default:
      return <HomePage onToggleMiniMode={onToggleMiniMode} onOpenTool={onOpenTool} />
  }
}

export default App
