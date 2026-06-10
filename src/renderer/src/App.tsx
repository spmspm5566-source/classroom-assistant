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
import { db }           from './db/schema'

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

  // ── 確保 DB 已開啟（schema 升級若曾失敗，嘗試重新開啟）──
  React.useEffect(() => {
    if (!db.isOpen()) {
      db.open().catch(e => {
        console.error('[App] DB open 失敗，嘗試繼續:', e)
      })
    }
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
  currentPage: ReturnType<typeof useAppStore.getState>['currentPage']
  onOpenTool:  (mode: 'timer' | 'drawer' | 'mini' | 'normal') => void
}

const PageRouter: React.FC<PageRouterProps> = ({ currentPage, onOpenTool }) => {
  switch (currentPage) {
    case 'home':
      return <HomePage />
    case 'classes':
      return <ClassesPage />
    case 'students':
      return <StudentsPage onOpenTool={onOpenTool} />
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
      return <HomePage />
  }
}

export default App
