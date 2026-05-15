/**
 * semester.ts — 學年/學期代碼自動推算
 *
 * 台灣國中小高中學期慣例：
 *  - 上學期：9月 ~ 隔年 1月
 *  - 下學期：2月 ~ 8月
 *  - 學年命名：以開學的那一年命名
 *      114 學年上學期 (114-1) = 民國 114 年 9 月 ~ 民國 115 年 1 月
 *      114 學年下學期 (114-2) = 民國 115 年 2 月 ~ 民國 115 年 8 月
 *      115 學年上學期 (115-1) = 民國 115 年 9 月 ~ 民國 116 年 1 月
 *
 * 民國年 = 西元年 - 1911
 */

/**
 * getCurrentSchoolYear
 * 取得目前所屬「學年」的民國年數字。
 *  - 9-12 月 → 該民國年
 *  - 1 月    → 前一民國年
 *  - 2-8 月  → 前一民國年
 */
export function getCurrentSchoolYear(date: Date = new Date()): number {
  const month   = date.getMonth() + 1
  const mingguo = date.getFullYear() - 1911
  return month >= 9 ? mingguo : mingguo - 1
}

/**
 * getCurrentSemesterCode
 * 取得目前學期代碼，格式 `${民國年}-${1|2}`。
 *
 *  - 9, 10, 11, 12 月 → "<該民國年>-1"
 *  - 1 月             → "<前一民國年>-1"   (上學期跨年的後半段)
 *  - 2 ~ 8 月         → "<前一民國年>-2"   (下學期 + 暑假)
 */
export function getCurrentSemesterCode(date: Date = new Date()): string {
  const month        = date.getMonth() + 1
  const schoolYear   = getCurrentSchoolYear(date)
  const semesterPart = (month >= 2 && month <= 8) ? 2 : 1
  return `${schoolYear}-${semesterPart}`
}

/**
 * isNewSchoolYearTriggerWindow
 * 判斷現在是否進入「新學年開學前後」的時間窗（用來提示升年級）。
 * 預設視為 8 月起到 11 月底，期間提示老師：「新學年到了，要升年級嗎？」
 *
 * 8 月以前（例：暑假 7 月）老師可能還在處理上一學期，先不打擾。
 * 12 月以後通常已穩定運作，再提示反而干擾。
 */
export function isNewSchoolYearTriggerWindow(date: Date = new Date()): boolean {
  const month = date.getMonth() + 1
  return month >= 8 && month <= 11
}
