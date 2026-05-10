/**
 * useRoulette.ts — 輪盤動畫播放器
 *
 * 接收 (sequence, intervals)，依序高亮每個 ID，
 * 每步呼叫 onTick 播放滴答音效，最後一步呼叫 onFinish。
 *
 * 用途：DrawerPage 開始抽籤時呼叫 play(sequence, intervals)，
 * SeatGrid 透過 store 的 highlightId 即時反應當前位置。
 *
 * ⚠ 注意：呼叫端傳入的 opts 物件每次 render 都是新 ref，
 * 所以這裡用 useRef 暫存最新值，避免依賴 opts 觸發 useEffect 反覆 cleanup
 * 而呼叫 setHighlight(null) 引發 setState 無限迴圈。
 */

import { useRef, useCallback, useEffect } from 'react'

export interface UseRouletteOptions {
  /** 每一步觸發（用於播放滴答音效） */
  onTick?:    (id: string, stepIndex: number) => void
  /** 動畫結束（中籤時觸發） */
  onFinish?:  (winnerId: string) => void
  /** 高亮目前位置 */
  setHighlight: (id: string | null) => void
}

export interface UseRouletteReturn {
  play:       (sequence: string[], intervals: number[]) => void
  cancel:     () => void
  isPlaying:  () => boolean
}

export function useRoulette(opts: UseRouletteOptions): UseRouletteReturn {
  // 把最新的 opts 同步存到 ref，後續所有函式透過 ref 讀取（保持參考穩定）
  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts })

  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playingRef = useRef(false)

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!playingRef.current) return
    playingRef.current = false
    optsRef.current.setHighlight(null)
  }, [])

  const play = useCallback((sequence: string[], intervals: number[]) => {
    // 先停掉前一次（若有）
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    playingRef.current = false

    if (sequence.length === 0) return

    playingRef.current = true
    let step = 0

    const advance = (): void => {
      if (!playingRef.current) return
      const o = optsRef.current
      if (step >= sequence.length) {
        playingRef.current = false
        const winnerId = sequence[sequence.length - 1]
        o.setHighlight(winnerId)
        o.onFinish?.(winnerId)
        return
      }

      const id    = sequence[step]
      const delay = intervals[step] ?? 100

      o.setHighlight(id)
      o.onTick?.(id, step)

      step++
      timerRef.current = setTimeout(advance, delay)
    }

    advance()
  }, [])

  const isPlaying = useCallback(() => playingRef.current, [])

  // 只在元件卸載時清除 timer，不再依賴 cancel/opts，避免無限觸發
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      playingRef.current = false
    }
  }, [])

  return { play, cancel, isPlaying }
}
