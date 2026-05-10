/**
 * period.ts — 週次與日期區間工具
 *
 * 用於：
 *  - 加分總覽：依「本節 / 今日 / 本週 / 全期」篩選 ScoreEvent
 *  - Excel 匯出：依「最近 N 週」拆分每週小計
 *  - 段考期間計算（之後接 examPeriods）
 *
 * 「週」採台灣常用定義：週一為一週起始，週日為結束。
 */

// ── 基本工具 ─────────────────────────────────────────────────

/** 取得指定日期的 00:00:00 時間戳 */
export function startOfDay(date: Date = new Date()): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 取得指定日期的 23:59:59.999 時間戳 */
export function endOfDay(date: Date = new Date()): number {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** 取得指定日期所在週的「週一 00:00:00」 */
export function startOfWeek(date: Date = new Date()): number {
  const d = new Date(date)
  // getDay(): 0=週日, 1=週一, ..., 6=週六
  const day = d.getDay()
  // 將週日(0) 視為 7，往前推算到週一
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 取得指定日期所在週的「週日 23:59:59.999」 */
export function endOfWeek(date: Date = new Date()): number {
  const start = startOfWeek(date)
  return start + 7 * 24 * 60 * 60 * 1000 - 1
}

/** YYYY-MM-DD */
export function formatDate(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** YYYY/MM/DD HH:mm */
export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${dd} ${hh}:${mm}`
}

// ── 篩選範圍 ─────────────────────────────────────────────────

export type RangePreset = 'session' | 'today' | 'week' | 'all'

export interface DateRange {
  start: number
  end:   number
}

/**
 * getRangeForPreset
 * 取得預設範圍對應的時間戳區間。
 * 'session' 不在這邊處理（要靠 sessionId 過濾）。
 */
export function getRangeForPreset(preset: RangePreset): DateRange {
  const now = Date.now()
  switch (preset) {
    case 'today':
      return { start: startOfDay(),       end: endOfDay() }
    case 'week':
      return { start: startOfWeek(),      end: endOfWeek() }
    case 'all':
    case 'session':   // session 用 sessionId 過濾，這裡傳全範圍即可
    default:
      return { start: 0, end: now + 86400_000 }
  }
}

// ── 取得最近 N 週的範圍清單 ──────────────────────────────────

export interface WeekRange {
  /** 第幾週（從 1 起） */
  weekIndex: number
  /** 該週範圍 */
  start:     number
  end:       number
  /** 顯示標籤，例如 "11/15 - 11/21" */
  label:     string
}

/**
 * lastNWeeks
 * 從今天往前推 N 週，回傳每週的範圍。
 * 索引 1 為「N 週前」、索引 N 為「本週」。
 */
export function lastNWeeks(n: number, refDate: Date = new Date()): WeekRange[] {
  const result: WeekRange[] = []
  const thisWeekStart = startOfWeek(refDate)
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000

  for (let i = 0; i < n; i++) {
    const weeksAgo = (n - 1) - i      // i=0 → 最舊；i=n-1 → 本週
    const start    = thisWeekStart - weeksAgo * ONE_WEEK
    const end      = start + ONE_WEEK - 1

    const startD = new Date(start)
    const endD   = new Date(end)
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`

    result.push({
      weekIndex: i + 1,
      start,
      end,
      label: `${fmt(startD)} - ${fmt(endD)}`
    })
  }

  return result
}

/**
 * weekIndexOf
 * 判斷某 timestamp 落在 weeks 中哪個週次（索引從 1 起），找不到回 0。
 */
export function weekIndexOf(ts: number, weeks: WeekRange[]): number {
  for (const w of weeks) {
    if (ts >= w.start && ts <= w.end) return w.weekIndex
  }
  return 0
}
