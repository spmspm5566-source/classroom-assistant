/**
 * excel.ts — ExcelJS 包裝工具
 *
 * 提供：
 *  - readStudentsFromFile(file)    從 Excel/CSV 讀取學生清單
 *  - downloadWorkbook(workbook, filename)  將 ExcelJS workbook 觸發瀏覽器下載
 *
 * 學生匯入欄位（Excel 第一列為標題）：
 *  座號 | 姓名 | 備註（可選）
 *
 * 也支援英文標題：seatNo | name | remarks
 */

import ExcelJS from 'exceljs'
import type { StudentRole } from '../db/schema'

// ── 學生匯入 ─────────────────────────────────────────────────

export interface ImportedStudent {
  seatNo:      number
  name:        string
  groupNumber?: number       // 組別數字（如 1, 2, 3…），匯入後依組號對應實際組 id
  role?:       StudentRole   // 角色（組長/助教/組員A…）
  remarks?:    string
}

/** 中文角色名稱 → StudentRole */
function parseRole(raw: string): StudentRole | undefined {
  const v = raw.trim().toLowerCase()
  if (['教練', '組長', 'leader'].includes(v)) return 'leader'
  if (['助教', 'assistant'].includes(v)) return 'assistant'
  if (['組員a', '員a', 'membera', 'member_a', '組員a'].includes(v)) return 'memberA'
  if (['組員b', '員b', 'memberb', 'member_b', '組員b'].includes(v)) return 'memberB'
  if (['組員c', '員c', 'memberc', 'member_c', '組員c'].includes(v)) return 'memberC'
  if (['組員d', '員d', 'memberd', 'member_d', '組員d'].includes(v)) return 'memberD'
  return undefined
}

/**
 * readStudentsFromFile
 * 解析 Excel/CSV 檔，回傳學生陣列。
 * 自動偵測標題列的中文/英文欄名。
 */
export async function readStudentsFromFile(file: File): Promise<ImportedStudent[]> {
  const buf = await file.arrayBuffer()
  const wb  = new ExcelJS.Workbook()

  // 依副檔名選擇載入方式
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') {
    // ExcelJS CSV 讀取需要 stream，這裡用簡單字串解析
    const text = new TextDecoder('utf-8').decode(buf)
    return parseCsv(text)
  } else {
    await wb.xlsx.load(buf)
  }

  const sheet = wb.worksheets[0]
  if (!sheet) throw new Error('Excel 檔內找不到工作表')

  // 讀取標題列，找出各欄位 index
  const headerRow = sheet.getRow(1)
  const colIdx = { seatNo: -1, name: -1, group: -1, role: -1, remarks: -1 }

  headerRow.eachCell((cell, colNumber) => {
    const v = String(cell.value ?? '').trim().toLowerCase()
    if (['座號', 'seatno', 'seat_no', 'seat'].includes(v))       colIdx.seatNo  = colNumber
    if (['姓名', 'name'].includes(v))                             colIdx.name    = colNumber
    if (['組別', '小組', 'group', 'group_no', 'groupno'].includes(v)) colIdx.group = colNumber
    if (['角色', 'role'].includes(v))                             colIdx.role    = colNumber
    if (['備註', 'remark', 'remarks', 'note'].includes(v))        colIdx.remarks = colNumber
  })

  if (colIdx.seatNo === -1 || colIdx.name === -1) {
    throw new Error('找不到「座號」或「姓名」欄位，請檢查 Excel 第一列標題')
  }

  // 從第 2 列開始讀資料
  const result: ImportedStudent[] = []
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row     = sheet.getRow(i)
    const seatNo  = Number(row.getCell(colIdx.seatNo).value)
    const name    = String(row.getCell(colIdx.name).value ?? '').trim()
    if (!seatNo || !name) continue

    const groupNum = colIdx.group > 0
      ? Number(row.getCell(colIdx.group).value) || undefined
      : undefined
    const roleRaw = colIdx.role > 0
      ? String(row.getCell(colIdx.role).value ?? '').trim()
      : ''
    const remarks = colIdx.remarks > 0
      ? String(row.getCell(colIdx.remarks).value ?? '').trim() || undefined
      : undefined

    result.push({
      seatNo,
      name,
      groupNumber: groupNum,
      role:        roleRaw ? parseRole(roleRaw) : undefined,
      remarks
    })
  }

  return result
}

// ── 多班一次匯入（每張工作表 = 一個班級） ────────────────────

export interface ImportedClassSheet {
  /** 工作表名稱，作為班級名稱（如 "203", "208"） */
  className: string
  /** 推算的年級（取班級名稱第一位數，無法判斷則為 1） */
  grade: number
  /** 該班學生 */
  students: ImportedStudent[]
  /** 解析錯誤訊息（缺欄位等），有錯就不可匯入 */
  error?: string
}

/**
 * readMultiClassFromFile
 * 讀取一個 Excel 檔，把每張工作表視為一個班級的學生名單。
 * 工作表名稱會被當作班級名稱，例如分頁 "203" 表示 2 年 203 班。
 *
 * 不支援 CSV（CSV 沒有多工作表的概念）。
 */
export async function readMultiClassFromFile(file: File): Promise<ImportedClassSheet[]> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'xlsx' && ext !== 'xls') {
    throw new Error('多班匯入只支援 .xlsx / .xls 檔（CSV 不能多分頁）')
  }

  const buf = await file.arrayBuffer()
  const wb  = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)

  const result: ImportedClassSheet[] = []

  for (const sheet of wb.worksheets) {
    const className = String(sheet.name ?? '').trim()
    if (!className) continue

    // 讀取標題列
    const headerRow = sheet.getRow(1)
    const colIdx = { seatNo: -1, name: -1, group: -1, role: -1, remarks: -1 }

    headerRow.eachCell((cell, colNumber) => {
      const v = String(cell.value ?? '').trim().toLowerCase()
      if (['座號', 'seatno', 'seat_no', 'seat'].includes(v))           colIdx.seatNo  = colNumber
      if (['姓名', 'name'].includes(v))                                 colIdx.name    = colNumber
      if (['組別', '小組', 'group', 'group_no', 'groupno'].includes(v)) colIdx.group   = colNumber
      if (['角色', 'role'].includes(v))                                 colIdx.role    = colNumber
      if (['備註', 'remark', 'remarks', 'note'].includes(v))            colIdx.remarks = colNumber
    })

    if (colIdx.seatNo === -1 || colIdx.name === -1) {
      result.push({
        className,
        grade:    inferGrade(className),
        students: [],
        error:    `工作表「${className}」找不到「座號」或「姓名」欄`
      })
      continue
    }

    const students: ImportedStudent[] = []
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row    = sheet.getRow(i)
      const seatNo = Number(row.getCell(colIdx.seatNo).value)
      const name   = String(row.getCell(colIdx.name).value ?? '').trim()
      if (!seatNo || !name) continue
      const groupNum = colIdx.group > 0 ? Number(row.getCell(colIdx.group).value) || undefined : undefined
      const roleRaw  = colIdx.role > 0 ? String(row.getCell(colIdx.role).value ?? '').trim() : ''
      const remarks  = colIdx.remarks > 0
        ? String(row.getCell(colIdx.remarks).value ?? '').trim() || undefined
        : undefined
      students.push({
        seatNo,
        name,
        groupNumber: groupNum,
        role:        roleRaw ? parseRole(roleRaw) : undefined,
        remarks
      })
    }

    result.push({
      className,
      grade:    inferGrade(className),
      students
    })
  }

  return result
}

/**
 * inferGrade
 * 從班級名稱推算年級（台灣常見命名：第一位數即年級）。
 * 例如 "203" → 2、"101" → 1、"301" → 3、"7班" → 7（國中）。
 * 若無數字則回傳 1。
 */
function inferGrade(className: string): number {
  const m = className.match(/\d/)
  if (!m) return 1
  const n = Number(m[0])
  return n >= 1 && n <= 9 ? n : 1
}

// ── 簡易 CSV 解析（處理 UTF-8 BOM 與基本逗號分隔） ──────────

function parseCsv(text: string): ImportedStudent[] {
  // 去除 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const header = splitCsvLine(lines[0]).map(s => s.trim().toLowerCase())
  const idx = {
    seatNo:  header.findIndex(h => ['座號', 'seatno', 'seat_no', 'seat'].includes(h)),
    name:    header.findIndex(h => ['姓名', 'name'].includes(h)),
    group:   header.findIndex(h => ['組別', '小組', 'group', 'group_no', 'groupno'].includes(h)),
    role:    header.findIndex(h => ['角色', 'role'].includes(h)),
    remarks: header.findIndex(h => ['備註', 'remark', 'remarks', 'note'].includes(h))
  }

  if (idx.seatNo === -1 || idx.name === -1) {
    throw new Error('找不到「座號」或「姓名」欄位，請檢查 CSV 第一列標題')
  }

  const result: ImportedStudent[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const seatNo = Number(cells[idx.seatNo])
    const name   = (cells[idx.name] ?? '').trim()
    if (!seatNo || !name) continue
    const roleRaw = idx.role >= 0 ? (cells[idx.role] ?? '').trim() : ''
    result.push({
      seatNo,
      name,
      groupNumber: idx.group >= 0 ? Number(cells[idx.group]) || undefined : undefined,
      role:        roleRaw ? parseRole(roleRaw) : undefined,
      remarks:     idx.remarks >= 0 ? (cells[idx.remarks] ?? '').trim() || undefined : undefined
    })
  }
  return result
}

/** 切分一行 CSV，支援雙引號內含逗號 */
function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result
}

// ── 通用：下載 Workbook ──────────────────────────────────────

export async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buf  = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
