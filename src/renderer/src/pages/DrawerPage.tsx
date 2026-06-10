/**
 * DrawerPage.tsx — 抽籤器主頁
 *
 * 視窗大小由 main process 設為 720×600（drawer mode）。
 * 整體版面：
 *  ┌───────────────────────────────────────┐
 *  │ 標題列（拖曳區）                       │ 28px
 *  ├───────────────────────────────────────┤
 *  │                                       │
 *  │   分組座位網格（2 列 × 3 欄）            │ ~440px
 *  │                                       │
 *  ├───────────────────────────────────────┤
 *  │ 控制列（模式 + 抽籤 + 全班作答）        │ ~80px
 *  └───────────────────────────────────────┘
 *
 * 抽中後，整個畫面被 DrawResultModal / FeedbackOverlay 蓋住。
 */

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence } from 'framer-motion'

// ── State ──
import { useAppStore }     from '../store/useAppStore'
import { useDrawerStore }  from '../store/useDrawerStore'
import { useScoringStore } from '../store/useScoringStore'

// ── Data ──
import { listByPeriod as listGroupsForPeriod } from '../db/groupRepo'
import { listByClass as listPeriodsForClass }  from '../db/examPeriodRepo'
import { getClass }                     from '../db/classRepo'
import { getConfig }                    from '../db/configRepo'
import { db }                           from '../db/schema'
import { addScoreEvent, bulkAddScoreEvents } from '../db/scoreRepo'
import { getOrCreateTodaySession }      from '../db/sessionRepo'
import { ROLE_LABELS }                  from '../db/schema'
import type { Student, Group }          from '../db/schema'

// ── Logic ──
import {
  filterCandidates,
  weightedDraw,
  computeDrawWeight,
  generateRouletteSequence,
  generateRouletteIntervals
} from '../utils/draw'
import {
  calcCorrectScore,
  calcWrongPenalty
} from '../utils/scoring'
import { useStudentScores, useGroupScores } from '../hooks/useStudentScores'
import { useScopedStudents }                from '../hooks/useScopedStudents'
import { useRoulette }                       from '../hooks/useRoulette'

// ── 音效 ──
import {
  playDrawTick,
  playDrawStop,
  playCorrect,
  playWrong,
  primeAudio
} from '../utils/audio'

// ── 子元件 ──
import SeatGrid          from '../components/drawer/SeatGrid'
import DrawerControls    from '../components/drawer/DrawerControls'
import DrawResultModal   from '../components/drawer/DrawResultModal'
import FeedbackOverlay   from '../components/drawer/FeedbackOverlay'
import ClassAnswerMode   from '../components/drawer/ClassAnswerMode'
import ManualPickOverlay from '../components/drawer/ManualPickOverlay'
import DrawingExcitementOverlay from '../components/drawer/DrawingExcitementOverlay'

// ════════════════════════════════════════════════════════════════════
// 主元件
// ════════════════════════════════════════════════════════════════════

interface DrawerPageProps {
  onClose: () => void
  /** 嵌入式（浮動 overlay）：移除整窗拖曳區，作為座位表上的浮動面板 */
  embedded?: boolean
}

const DrawerPage: React.FC<DrawerPageProps> = ({ onClose, embedded = false }) => {
  const currentClassId   = useAppStore(s => s.currentClassId)
  const examPeriodId     = useAppStore(s => s.currentExamPeriodId)
  const setExamPeriod    = useAppStore(s => s.setCurrentExamPeriod)
  const setSessionId     = useAppStore(s => s.setCurrentSession)
  const sessionId        = useAppStore(s => s.currentSessionId)

  // ── 自動選段考期（DrawerPage 沒有 PeriodSwitcher 可選）──
  const periods = useLiveQuery(
    () => currentClassId ? listPeriodsForClass(currentClassId) : Promise.resolve([]),
    [currentClassId],
    []
  ) ?? []
  // 所有小組（用於判斷哪一期有學生分組）
  const allGroupsInClass = useLiveQuery(
    () => currentClassId ? db.groups.where('classId').equals(currentClassId).toArray() : Promise.resolve([] as Group[]),
    [currentClassId],
    [] as Group[]
  ) ?? []

  // 用 ref 確保「每班只自動選一次」，避免 useLiveQuery 回傳新 ref 導致 useEffect 無限觸發
  const autoSelectedClassRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!currentClassId || periods.length === 0 || allGroupsInClass.length === 0) return
    if (autoSelectedClassRef.current === currentClassId) return
    autoSelectedClassRef.current = currentClassId

    // 從最新期往舊找，找第一個「有學生分組」的期
    const periodsDesc = [...periods].reverse()

    const pickPeriod = async () => {
      for (const p of periodsDesc) {
        const groupsOfPeriod = allGroupsInClass.filter(g => g.examPeriodId === p.id)
        if (groupsOfPeriod.length === 0) continue
        // 檢查這些組是否有學生
        const groupIds = groupsOfPeriod.map(g => g.id)
        const studentInGroup = await db.students
          .where('classId').equals(currentClassId)
          .and(s => !!s.groupId && groupIds.includes(s.groupId))
          .first()
        if (studentInGroup) {
          // 找到有學生的期，若不同才切換（避免觸發不必要的 re-render）
          if (p.id !== examPeriodId) {
            setExamPeriod(p.id)
          }
          return
        }
      }
      // 所有期都沒有學生 → 選最新一期
      if (periods[periods.length - 1].id !== examPeriodId) {
        setExamPeriod(periods[periods.length - 1].id)
      }
    }

    pickPeriod()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClassId, periods, allGroupsInClass])

  // 抽籤器狀態
  const {
    phase, drawMode, drawnId, highlightId, feedback,
    setDrawMode, startSpin, setHighlight, showResult, showFeedback,
    enterClassMode, enterManualPick, pickManually, goIdle
  } = useDrawerStore()

  // 計分即時計數
  const {
    recordCorrect, recordWrong, recordDraw,
    getStreak, getWrongCount, getDrawWeight, lastDrawnId
  } = useScoringStore()

  // ── 撈資料 ──
  const cls = useLiveQuery(
    () => currentClassId ? getClass(currentClassId) : Promise.resolve(undefined),
    [currentClassId]
  )
  // 學生（已合併「目前段考期」的分組指派）
  const students = useScopedStudents(currentClassId, examPeriodId)
  const groups = useLiveQuery(
    () => examPeriodId ? listGroupsForPeriod(examPeriodId) : Promise.resolve([]),
    [examPeriodId],
    []
  ) ?? []
  const config = useLiveQuery(() => getConfig(), [], null)

  const studentScores = useStudentScores(currentClassId)
  const studentToGroupMap = React.useMemo(() => {
    const m: Record<string, string | null> = {}
    students.forEach(s => { m[s.id] = s.groupId })
    return m
  }, [students])
  const groupScores = useGroupScores(currentClassId, examPeriodId, studentScores, studentToGroupMap)

  // ── 確保今日 session 存在 ──
  React.useEffect(() => {
    if (currentClassId && !sessionId) {
      getOrCreateTodaySession(currentClassId).then(s => setSessionId(s.id))
    }
  }, [currentClassId, sessionId, setSessionId])

  // ── 候選名單 ──
  const candidates = React.useMemo(
    () => filterCandidates(students, drawMode),
    [students, drawMode]
  )

  // 找抽中的學生物件
  const drawnStudent: Student | null = React.useMemo(
    () => students.find(s => s.id === drawnId) ?? null,
    [students, drawnId]
  )

  // ── 隨機語料句子 ──
  const pickPhrase = React.useCallback((type: 'correct' | 'wrong'): string => {
    if (!config) return type === 'correct' ? '答得真好！' : '下次加油！'
    const pool = type === 'correct' ? config.praise : config.encouragement
    if (pool.length === 0) return type === 'correct' ? '答得真好！' : '下次加油！'
    return pool[Math.floor(Math.random() * pool.length)]
  }, [config])

  // ────────────────────────────────────────────────────────────────
  // 輪盤動畫
  // ────────────────────────────────────────────────────────────────
  const { play: playRoulette } = useRoulette({
    setHighlight,
    onTick:    () => playDrawTick(),
    onFinish:  () => {
      playDrawStop()
      // 動畫結束後 → 顯示結果視窗
      showResult()
    }
  })

  // ────────────────────────────────────────────────────────────────
  // 操作：開始抽籤
  // ────────────────────────────────────────────────────────────────
  const handleDraw = () => {
    if (!config) {
      window.alert('系統設定尚未載入完成，請稍候再試')
      return
    }
    if (!examPeriodId) {
      window.alert('尚未選擇段考期，請回主控台於標題列建立或選擇段考期')
      return
    }
    if (!sessionId) {
      window.alert('正在建立今日節次，請稍候再試一次')
      return
    }
    if (candidates.length === 0) {
      window.alert('目前模式下沒有候選人')
      return
    }
    primeAudio()

    // 1. 先用加權演算法決定贏家
    //    權重來自「程式啟動以來累計答錯次數」(useScoringStore.drawWeightCounts，封頂 3 次)
    const winner = weightedDraw({
      candidates,
      excludeId: lastDrawnId,
      getWeight: (id) => getDrawWeight(id, config.rules.drawWeights)
    })

    if (!winner) {
      window.alert('抽籤失敗：候選人為空')
      return
    }

    // 2. 啟動 store 狀態
    startSpin(winner.id)
    recordDraw(winner.id)

    // 3. 產生輪盤序列並播放動畫
    const sequence  = generateRouletteSequence(candidates, winner, 28)
    const intervals = generateRouletteIntervals(28, 50, 220)
    playRoulette(sequence, intervals)
  }

  // ────────────────────────────────────────────────────────────────
  // 操作：答對
  // ────────────────────────────────────────────────────────────────
  const handleCorrect = async (overrideScore?: number) => {
    if (!drawnStudent) { window.alert('找不到被抽中的學生'); return }
    if (!config)       { window.alert('系統設定尚未載入完成'); return }
    if (!examPeriodId) { window.alert('尚未選擇段考期，請回主控台於標題列選擇'); return }
    if (!sessionId)    { window.alert('今日節次尚未建立，請稍候 1 秒再試'); return }
    primeAudio()

    // 計算加分
    const newStreak = getStreak(drawnStudent.id) + 1   // 含本次
    const score = overrideScore !== undefined
      ? overrideScore
      : calcCorrectScore(drawnStudent.role, newStreak, config.rules)

    // 寫入事件
    await addScoreEvent({
      studentId:    drawnStudent.id,
      classId:      drawnStudent.classId,
      sessionId,
      examPeriodId,
      groupId:      drawnStudent.groupId,
      score,
      type:         'correct',
      meta: {
        role:   drawnStudent.role ?? undefined,
        streak: newStreak
      }
    })

    // 更新即時計數
    recordCorrect(drawnStudent.id)

    // 播音效
    playCorrect()

    // 顯示反饋
    showFeedback({
      type:        'correct',
      phrase:      pickPhrase('correct'),
      score,
      studentName: drawnStudent.name,
      roleLabel:   drawnStudent.role ? ROLE_LABELS[drawnStudent.role] : undefined
    })
  }

  // ────────────────────────────────────────────────────────────────
  // 操作：答錯
  // ────────────────────────────────────────────────────────────────
  const handleWrong = async () => {
    if (!drawnStudent) { window.alert('找不到被抽中的學生'); return }
    if (!config)       { window.alert('系統設定尚未載入完成'); return }
    if (!examPeriodId) { window.alert('尚未選擇段考期，請回主控台於標題列選擇'); return }
    if (!sessionId)    { window.alert('今日節次尚未建立，請稍候 1 秒再試'); return }
    primeAudio()

    // 計算扣分（含本次的累計次數）
    const newWrongCount = getWrongCount(drawnStudent.id) + 1
    const penalty       = calcWrongPenalty(newWrongCount, config.rules)

    // 寫入事件（即使 penalty=0 也記錄，方便後續查詢）
    await addScoreEvent({
      studentId:    drawnStudent.id,
      classId:      drawnStudent.classId,
      sessionId,
      examPeriodId,
      groupId:      drawnStudent.groupId,
      score:        penalty,
      type:         'wrong',
      meta: {
        role:       drawnStudent.role ?? undefined,
        wrongCount: newWrongCount
      }
    })

    recordWrong(drawnStudent.id)
    playWrong()

    showFeedback({
      type:        'wrong',
      phrase:      pickPhrase('wrong'),
      score:       penalty,
      studentName: drawnStudent.name,
      roleLabel:   drawnStudent.role ? ROLE_LABELS[drawnStudent.role] : undefined
    })
  }

  // ────────────────────────────────────────────────────────────────
  // 操作：取消抽籤結果（不採計）
  // ────────────────────────────────────────────────────────────────
  const handleCancelResult = () => {
    goIdle()
  }

  // ────────────────────────────────────────────────────────────────
  // 操作：全班作答送出
  // ────────────────────────────────────────────────────────────────
  const handleClassSubmit = async (correctIds: Set<string>, scorePer: number) => {
    if (!config)       { window.alert('系統設定尚未載入完成'); return }
    if (!examPeriodId) { window.alert('尚未選擇段考期，請回主控台於標題列選擇'); return }
    if (!sessionId)    { window.alert('今日節次尚未建立，請稍候再試'); return }

    const events = students.map(s => {
      const isCorrect = correctIds.has(s.id)
      if (isCorrect) {
        recordCorrect(s.id)
        return {
          studentId:    s.id,
          classId:      s.classId,
          sessionId,
          examPeriodId,
          groupId:      s.groupId,
          score:        scorePer,
          type:         'group_correct' as const,
          meta:         { role: s.role ?? undefined }
        }
      } else {
        const newWrong = getWrongCount(s.id) + 1
        const penalty  = calcWrongPenalty(newWrong, config.rules)
        recordWrong(s.id)
        return {
          studentId:    s.id,
          classId:      s.classId,
          sessionId,
          examPeriodId,
          groupId:      s.groupId,
          score:        penalty,
          type:         'group_wrong' as const,
          meta:         { role: s.role ?? undefined, wrongCount: newWrong }
        }
      }
    })

    await bulkAddScoreEvents(events)

    const correctCount = correctIds.size
    const wrongCount   = students.length - correctCount

    playCorrect()
    showFeedback({
      type:      'batch',
      phrase:    correctCount > wrongCount ? '全班表現很棒！' : '繼續加油！',
      score:     0,
      batchInfo: { correct: correctCount, wrong: wrongCount }
    })
  }

  // ────────────────────────────────────────────────────────────────
  // 渲染
  // ────────────────────────────────────────────────────────────────

  if (!currentClassId) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-rose-50 to-pink-50 p-4">
        <p className="text-2xl mb-2">🏫</p>
        <p className="text-sm font-semibold text-gray-800 mb-1">尚未選擇班級</p>
        <p className="text-xs text-gray-500 mb-3">請先到主控台建立並選擇班級</p>
        <button onClick={onClose} className="h-8 px-4 rounded-lg bg-rose-500 text-white text-xs font-semibold">
          回主控台
        </button>
      </div>
    )
  }

  // 段考期還沒準備好（從 DB 撈+useEffect 設定的中途空檔）
  if (!examPeriodId || periods.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-rose-50 to-pink-50 p-4">
        <p className="text-2xl mb-2">📅</p>
        <p className="text-sm font-semibold text-gray-800 mb-1">尚未建立段考期</p>
        <p className="text-xs text-gray-500 mb-3 text-center max-w-xs">
          抽籤器需要段考期才能正確分組記分。<br />
          請先回主控台，於標題列「段考期」旁的 ＋ 按鈕建立。
        </p>
        <button onClick={onClose} className="h-8 px-4 rounded-lg bg-rose-500 text-white text-xs font-semibold">
          回主控台
        </button>
      </div>
    )
  }

  return (
    <div className={`${embedded ? '' : 'drag-region'} w-full h-full bg-gradient-to-br from-rose-50 via-white to-pink-50 flex flex-col relative overflow-hidden`}>

      {/* ── 頂部標題列 ── */}
      <div className="flex items-center justify-between px-3 h-7 flex-shrink-0">
        <span className="text-[11px] font-semibold text-rose-700">
          🎲 抽籤器
          {cls && <span className="ml-2 text-gray-500">{cls.grade} 年 {cls.name} 班</span>}
        </span>
        <button
          onClick={onClose}
          title="關閉，回主控台"
          className="no-drag w-5 h-5 rounded hover:bg-rose-100 flex items-center justify-center text-gray-400 hover:text-gray-700"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* ── 座位網格 ── */}
      <div className="flex-1 px-2 pb-2 overflow-hidden">
        {students.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-xs">請先到主控台「學生與分組」頁建立名單</p>
          </div>
        ) : (
          <SeatGrid
            groups={groups}
            students={students}
            studentScores={studentScores}
            groupScores={groupScores}
            drawMode={drawMode}
            highlightId={highlightId}
            winnerId={phase === 'result' || phase === 'feedback' ? drawnId : null}
          />
        )}
      </div>

      {/* ── 控制列 ── */}
      <div className="px-3 pb-2 flex-shrink-0">
        <DrawerControls
          drawMode={drawMode}
          candidateCount={candidates.length}
          isSpinning={phase === 'spinning'}
          onSetMode={setDrawMode}
          onDraw={handleDraw}
          onManualPick={enterManualPick}
          onClassMode={enterClassMode}
        />
      </div>

      {/* ── 抽籤動畫期間的浮字效果（增加緊張感） ── */}
      <DrawingExcitementOverlay
        active={phase === 'spinning'}
        candidates={candidates}
      />

      {/* ── 抽中結果跳出 ── */}
      <AnimatePresence>
        {phase === 'result' && drawnStudent && config && (
          <DrawResultModal
            student={drawnStudent}
            rules={config.rules}
            streakCount={getStreak(drawnStudent.id)}
            wrongCount={getWrongCount(drawnStudent.id)}
            onCorrect={handleCorrect}
            onWrong={handleWrong}
            onCancel={handleCancelResult}
          />
        )}
      </AnimatePresence>

      {/* ── 答對 / 答錯 反饋動畫 ── */}
      <AnimatePresence>
        {phase === 'feedback' && feedback && (
          <FeedbackOverlay
            feedback={feedback}
            onDone={goIdle}
          />
        )}
      </AnimatePresence>

      {/* ── 全班作答模式 ── */}
      {phase === 'classMode' && config && (
        <ClassAnswerMode
          students={students}
          rules={config.rules}
          studentScores={studentScores}
          onSubmit={handleClassSubmit}
          onCancel={goIdle}
        />
      )}

      {/* ── 老師指定模式 ── */}
      {phase === 'manualPick' && (
        <ManualPickOverlay
          groups={groups}
          students={students}
          studentScores={studentScores}
          onPick={(id) => {
            // 老師指定 → 不跑輪盤，直接進入結果視窗
            primeAudio()
            recordDraw(id)
            pickManually(id)
          }}
          onCancel={goIdle}
        />
      )}
    </div>
  )
}

export default DrawerPage
