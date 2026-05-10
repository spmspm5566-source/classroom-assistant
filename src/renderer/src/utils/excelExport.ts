/**
 * excelExport.ts — Excel 匯出邏輯
 *
 * 提供兩種匯出格式：
 *
 *  1. exportWeeklyGroupSheet  — 每週小組加分表（依老師圖三格式）
 *     每組一張工作表，欄為週次，列為角色（組長/助教/員A~D）
 *
 *  2. exportScoreLog          — 加分明細表（彈性備援）
 *     每筆 ScoreEvent 一列，包含時間、班級、學生、類型、分數、備註
 *
 * 使用 ExcelJS：
 *  - 比 xlsx 套件強，可寫格式（合併儲存格、紅字、邊框）
 *  - 可匯出 Buffer 透過瀏覽器 Blob 下載
 */

import ExcelJS from 'exceljs'
import { downloadWorkbook } from './excel'
import { lastNWeeks, formatDate, formatDateTime, weekIndexOf } from './period'
import type { Class, Group, Student, ScoreEvent, StudentRole } from '../db/schema'
import { ROLE_LABELS } from '../db/schema'

// ── 角色顯示順序（與圖三一致） ────────────────────────────────

const ROLE_ORDER: StudentRole[] = ['leader', 'assistant', 'memberA', 'memberB', 'memberC', 'memberD']

// ── 1. 週小組加分表 ──────────────────────────────────────────

export interface WeeklyExportOptions {
  cls:           Class
  groups:        Group[]
  students:      Student[]
  events:        ScoreEvent[]
  weeksCount:    number    // 要匯出最近 N 週
  examNumber?:   number    // 第幾次段考（顯示用）
  fileName?:     string
}

/**
 * exportWeeklyGroupSheet
 * 為每個小組產生一張工作表（依圖三格式）。
 *
 * 表頭：
 *   第 N 次段考    101 班    小組加分表    總名次：第 ___ 名
 *
 * 表身：
 *   職稱     │ 組長 │ 助教 │ 員A │ 員B │ 員C │ 員D │ 每週小計 │ 每週名次
 *   姓名     │ 王X │ 李X │ ... │     │     │     │          │
 *   個人標準│ 70  │ 65  │ 60  │ ... │     │     │          │
 *   第1週    │ +30 │ +20 │ ... │     │     │     │   +X     │  Y
 *   第2週    │ ... │ ... │ ... │     │     │     │          │
 *   ...
 *   小計     │  總 │  總 │  總 │     │     │     │   累計    │
 *                                              段考總名次  │
 *                                              團體加分    │
 */
export async function exportWeeklyGroupSheet(opts: WeeklyExportOptions): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator       = '班級助手 ClassroomAssistant'
  wb.created       = new Date()

  const weeks = lastNWeeks(opts.weeksCount)

  // ── 計算每組每週每位成員的累計 ──
  // map[groupId][weekIdx][studentId] = totalScore
  const matrix = new Map<string, Map<number, Map<string, number>>>()
  for (const g of opts.groups) matrix.set(g.id, new Map())

  for (const evt of opts.events) {
    if (!evt.groupId) continue
    const wIdx = weekIndexOf(evt.timestamp, weeks)
    if (wIdx === 0) continue   // 不在範圍內
    const groupMap = matrix.get(evt.groupId)
    if (!groupMap) continue
    if (!groupMap.has(wIdx)) groupMap.set(wIdx, new Map())
    const weekMap = groupMap.get(wIdx)!
    weekMap.set(evt.studentId, (weekMap.get(evt.studentId) ?? 0) + evt.score)
  }

  // ── 計算每週每組總分（用於排名） ──
  const weeklyGroupTotal = new Map<string, Map<number, number>>()
  for (const g of opts.groups) weeklyGroupTotal.set(g.id, new Map())
  for (const [groupId, groupMap] of matrix) {
    for (const [wIdx, weekMap] of groupMap) {
      let sum = 0
      for (const sc of weekMap.values()) sum += sc
      weeklyGroupTotal.get(groupId)!.set(wIdx, sum)
    }
  }

  // ── 計算每週名次（分數低 = 第 1 名，依老師需求） ──
  // 註：圖三的設計是「分數最低為第 1 名」（這是反向排名），
  // 確認過老師需求：每週排名分數低的小組為第 1 名。
  const weeklyRanks = new Map<number, Map<string, number>>()    // weekIdx -> groupId -> rank
  for (const w of weeks) {
    const totals: { groupId: string, total: number }[] = []
    for (const g of opts.groups) {
      const total = weeklyGroupTotal.get(g.id)?.get(w.weekIndex) ?? 0
      totals.push({ groupId: g.id, total })
    }
    // 升冪：分數低的排第 1（題目要求）
    totals.sort((a, b) => a.total - b.total)
    const rankMap = new Map<string, number>()
    totals.forEach((t, i) => rankMap.set(t.groupId, i + 1))
    weeklyRanks.set(w.weekIndex, rankMap)
  }

  // ── 為每組建立工作表 ──
  for (const g of opts.groups) {
    const sheet = wb.addWorksheet(g.name ?? `第${g.number}組`, {
      properties: { defaultRowHeight: 22 }
    })

    // 取得該組學生（依角色排序）
    const members = opts.students
      .filter(s => s.groupId === g.id)
      .sort((a, b) => {
        const oa = a.role ? ROLE_ORDER.indexOf(a.role) : 99
        const ob = b.role ? ROLE_ORDER.indexOf(b.role) : 99
        if (oa !== ob) return oa - ob
        return a.seatNo - b.seatNo
      })

    // ── 標題列（合併儲存格） ──
    sheet.mergeCells('A1', 'I1')
    const titleCell = sheet.getCell('A1')
    titleCell.value = `第 ${opts.examNumber ?? '___'} 次段考    ${opts.cls.grade} 年 ${opts.cls.name} 班    小組加分表    （${g.name ?? `第${g.number}組`}）`
    titleCell.font  = { name: '微軟正黑體', size: 14, bold: true, color: { argb: 'FFC00000' } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(1).height = 28

    // ── 欄寬 ──
    sheet.getColumn(1).width = 11
    for (let i = 2; i <= 7; i++) sheet.getColumn(i).width = 10
    sheet.getColumn(8).width = 12   // 每週小計
    sheet.getColumn(9).width = 10   // 每週名次

    // ── 表頭：職稱／姓名／個人標準 ──
    const headerRow = sheet.addRow(['職稱', ...ROLE_ORDER.map(r => ROLE_LABELS[r]), '每週加分小計', '每週名次'])
    styleHeader(headerRow)

    // 姓名列
    const nameCells: (string | number)[] = ['姓名']
    for (const r of ROLE_ORDER) {
      const stu = members.find(m => m.role === r)
      nameCells.push(stu ? stu.name : '')
    }
    nameCells.push('', '')
    sheet.addRow(nameCells)

    // 個人標準列
    const standardCells: (string | number)[] = ['個人標準']
    for (const r of ROLE_ORDER) {
      const stu = members.find(m => m.role === r)
      standardCells.push(stu?.standardScore?.exam ?? '')
    }
    standardCells.push('', '')
    sheet.addRow(standardCells)

    // ── 每週列 ──
    const weeklyTotalsForGroup: number[] = []   // 用於計算累計
    for (const w of weeks) {
      const cells: (string | number)[] = [`第${w.weekIndex}週`]
      let weekSum = 0
      for (const r of ROLE_ORDER) {
        const stu = members.find(m => m.role === r)
        const sc  = stu ? (matrix.get(g.id)?.get(w.weekIndex)?.get(stu.id) ?? 0) : 0
        cells.push(stu ? sc : '')
        weekSum += sc
      }
      // 每週小計
      cells.push(weekSum)
      // 每週名次
      const rank = weeklyRanks.get(w.weekIndex)?.get(g.id) ?? ''
      cells.push(rank)
      const row = sheet.addRow(cells)
      // 上色
      colorScoreRow(row, 2, 8)
      weeklyTotalsForGroup.push(weekSum)
    }

    // ── 小計 ──
    const subtotalCells: (string | number)[] = ['小計']
    for (const r of ROLE_ORDER) {
      const stu = members.find(m => m.role === r)
      let total = 0
      if (stu) {
        for (const [, weekMap] of matrix.get(g.id) ?? new Map()) {
          total += weekMap.get(stu.id) ?? 0
        }
      }
      subtotalCells.push(stu ? total : '')
    }
    const grandTotal = weeklyTotalsForGroup.reduce((a, b) => a + b, 0)
    subtotalCells.push(grandTotal)
    subtotalCells.push('')
    const subtotalRow = sheet.addRow(subtotalCells)
    styleSubtotal(subtotalRow)

    // ── 邊框 ──
    addBorders(sheet, 2, sheet.lastRow!.number, 1, 9)
  }

  // ── 觸發下載 ──
  const fileName = opts.fileName
    ?? `小組加分表_${opts.cls.name}班_${formatDate(Date.now())}.xlsx`
  await downloadWorkbook(wb, fileName)
}

// ── 2. 加分明細表 ────────────────────────────────────────────

export interface ScoreLogExportOptions {
  cls:        Class
  students:   Student[]
  events:     ScoreEvent[]
  fileName?:  string
}

/**
 * exportScoreLog
 * 將所有 ScoreEvent 列成明細表，方便老師逐筆檢視。
 * 欄：時間、座號、姓名、類型、分數、備註
 */
export async function exportScoreLog(opts: ScoreLogExportOptions): Promise<void> {
  const wb    = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('加分明細')

  // 標題
  sheet.mergeCells('A1', 'F1')
  const title = sheet.getCell('A1')
  title.value = `${opts.cls.grade} 年 ${opts.cls.name} 班 加分明細表`
  title.font  = { name: '微軟正黑體', size: 14, bold: true, color: { argb: 'FFC00000' } }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 26

  // 欄寬
  const widths = [18, 8, 12, 10, 10, 30]
  widths.forEach((w, i) => sheet.getColumn(i + 1).width = w)

  // 表頭
  const headerRow = sheet.addRow(['時間', '座號', '姓名', '類型', '分數', '備註'])
  styleHeader(headerRow)

  // 學生快取
  const stuMap = new Map(opts.students.map(s => [s.id, s]))

  // 排序：時間升冪
  const sorted = [...opts.events].sort((a, b) => a.timestamp - b.timestamp)

  for (const evt of sorted) {
    const stu = stuMap.get(evt.studentId)
    const row = sheet.addRow([
      formatDateTime(evt.timestamp),
      stu?.seatNo ?? '',
      stu?.name ?? '（已刪除）',
      typeLabel(evt.type),
      evt.score,
      evt.note ?? ''
    ])
    // 分數欄位上色
    const scoreCell = row.getCell(5)
    if (evt.score > 0) scoreCell.font = { color: { argb: 'FF2E7D32' } }
    else if (evt.score < 0) scoreCell.font = { color: { argb: 'FFC62828' } }
  }

  addBorders(sheet, 2, sheet.lastRow!.number, 1, 6)

  const fileName = opts.fileName
    ?? `加分明細_${opts.cls.name}班_${formatDate(Date.now())}.xlsx`
  await downloadWorkbook(wb, fileName)
}

// ── 樣式工具 ─────────────────────────────────────────────────

function styleHeader(row: ExcelJS.Row): void {
  row.font      = { name: '微軟正黑體', size: 11, bold: true, color: { argb: 'FFC00000' } }
  row.alignment = { horizontal: 'center', vertical: 'middle' }
  row.height    = 22
  row.eachCell(c => {
    c.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF8E1' }
    }
  })
}

function styleSubtotal(row: ExcelJS.Row): void {
  row.font      = { name: '微軟正黑體', size: 11, bold: true }
  row.alignment = { horizontal: 'center', vertical: 'middle' }
  row.eachCell(c => {
    c.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    }
  })
}

/** 將分數欄上色（正綠負紅） */
function colorScoreRow(row: ExcelJS.Row, fromCol: number, toCol: number): void {
  for (let i = fromCol; i <= toCol; i++) {
    const cell = row.getCell(i)
    const v = Number(cell.value)
    if (Number.isFinite(v)) {
      if (v > 0) cell.font = { color: { argb: 'FF2E7D32' } }
      else if (v < 0) cell.font = { color: { argb: 'FFC62828' } }
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  }
}

function addBorders(
  sheet: ExcelJS.Worksheet,
  rowFrom: number, rowTo: number,
  colFrom: number, colTo: number
): void {
  for (let r = rowFrom; r <= rowTo; r++) {
    for (let c = colFrom; c <= colTo; c++) {
      sheet.getCell(r, c).border = {
        top:    { style: 'thin', color: { argb: 'FF999999' } },
        left:   { style: 'thin', color: { argb: 'FF999999' } },
        bottom: { style: 'thin', color: { argb: 'FF999999' } },
        right:  { style: 'thin', color: { argb: 'FF999999' } }
      }
    }
  }
}

function typeLabel(type: ScoreEvent['type']): string {
  switch (type) {
    case 'correct':       return '答對'
    case 'wrong':         return '答錯'
    case 'group_correct': return '全班答對'
    case 'group_wrong':   return '全班答錯'
    case 'group_done':    return '全組完成'
    case 'homework':      return '作業未繳'
    case 'manual':        return '手動加分'
    case 'quiz':          return '平常考'
    case 'exam':          return '段考'
    default:              return String(type)
  }
}
