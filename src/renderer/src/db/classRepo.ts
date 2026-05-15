/**
 * classRepo.ts — 班級資料操作（Repository Pattern）
 *
 * 將 Dexie 的 CRUD 集中在一處，避免 React 元件直接接觸資料庫，
 * 方便日後切換儲存方式（如改成 Apps Script 同步）或加入 cache。
 */

import { nanoid } from 'nanoid'
import { db, type Class, type ExamPeriod } from './schema'

// ── 查詢 ─────────────────────────────────────────────────────

export async function listClasses(): Promise<Class[]> {
  // 依年級、班名排序
  const all = await db.classes.toArray()
  return all.sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade
    return a.name.localeCompare(b.name)
  })
}

export async function getClass(id: string): Promise<Class | undefined> {
  return db.classes.get(id)
}

// ── 新增 ─────────────────────────────────────────────────────

export interface CreateClassInput {
  name:     string
  grade:    number
  rows?:    number    // 預設 6
  cols?:    number    // 預設 6
  semester: string
}

/**
 * createClass
 * 建立班級。注意：此函式只建立 Class 記錄。
 * 第一次段考 + 預設 6 組 由呼叫端用 examPeriodRepo.createExamPeriod 建立，
 * 以避免 schema 內循環相依。
 */
export async function createClass(input: CreateClassInput): Promise<Class> {
  const cls: Class = {
    id:        nanoid(),
    name:      input.name,
    grade:     input.grade,
    rows:      input.rows ?? 6,
    cols:      input.cols ?? 6,
    semester:  input.semester,
    createdAt: Date.now()
  }
  await db.classes.add(cls)
  return cls
}

/**
 * createClassWithFirstPeriod
 * 一次性建立班級 + 第一次段考 + 6 組預設小組。
 * 這是大多數情境（建立新班級）會用的便利函式。
 */
export async function createClassWithFirstPeriod(input: CreateClassInput): Promise<{
  cls: Class
  period: ExamPeriod
}> {
  const cls = await createClass(input)

  // 用 dynamic import 避免循環相依
  const { createExamPeriod } = await import('./examPeriodRepo')
  const { period } = await createExamPeriod({
    classId: cls.id,
    number:  1,
    name:    '第一次段考'
  })

  return { cls, period }
}

// ── 更新 ─────────────────────────────────────────────────────

export async function updateClass(id: string, patch: Partial<Class>): Promise<void> {
  await db.classes.update(id, patch)
}

// ── 升年級 ───────────────────────────────────────────────────

/**
 * bumpClassName
 * 智慧判斷班級名稱在升年級時要不要動：
 *   - 班名首位數字 === 目前年級 → 視為「年級+班序」命名，首位 +1
 *       例：grade=2, name="203" → 首字 2 == grade → 變成 "303"
 *       例：grade=1, name="105" → 首字 1 == grade → 變成 "205"
 *   - 否則 → 班名不動（純班序、特殊命名、首位 9 等情境）
 *       例：grade=2, name="3"      → 首字 3 ≠ grade → 不變（顯示為「3 年 3 班」）
 *       例：grade=2, name="資優班" → 首字非數字 → 不變
 *       例：grade=9, name="903"    → 首字 9 == grade，但 9+1=10 怪 → 不變
 */
function bumpClassName(name: string, currentGrade: number): string {
  const m = name.match(/^(\d)(.*)$/)
  if (!m) return name
  const firstDigit = Number(m[1])
  if (firstDigit !== currentGrade) return name   // 班名不含年級資訊
  if (firstDigit >= 9) return name               // 避免 9→10 怪數字
  return `${firstDigit + 1}${m[2]}`
}

export interface PromotionPreview {
  classId:     string
  fromGrade:   number
  fromName:    string
  /** 升年級後的新名稱（畢業/skip 時 = 原名稱） */
  toName:      string
  /** 升年級後的新年級（畢業/skip 時 = 原年級） */
  toGrade:     number
  /** 操作類型：
   *   promote  = 升一年級，清加分/考試/段考期，保留學生
   *   graduate = 3 年級 → 整班刪除（含學生與所有資料）
   *   skip     = 已畢業班或無法升級
   */
  action:      'promote' | 'graduate' | 'skip'
}

/**
 * previewPromotion
 * 對單一班級「預覽」升年級後的結果（不改資料庫），用來顯示給老師確認。
 */
export function previewPromotion(cls: Class): PromotionPreview {
  if (cls.graduated) {
    return {
      classId:   cls.id,
      fromGrade: cls.grade,
      fromName:  cls.name,
      toGrade:   cls.grade,
      toName:    cls.name,
      action:    'skip'
    }
  }
  if (cls.grade >= 3) {
    return {
      classId:   cls.id,
      fromGrade: cls.grade,
      fromName:  cls.name,
      toGrade:   cls.grade,
      toName:    cls.name,
      action:    'graduate'  // 3 年級 → 畢業 = 整班刪除
    }
  }
  return {
    classId:   cls.id,
    fromGrade: cls.grade,
    fromName:  cls.name,
    toGrade:   cls.grade + 1,
    toName:    bumpClassName(cls.name, cls.grade),
    action:    'promote'
  }
}

/**
 * promoteClass
 * 把單一班級升一年級。
 *  - grade < 3 → grade+1、name 智慧調整（首位數字 == grade 才 +1）
 *    並清空：加分事件、考試、考試成績、段考期、小組
 *    保留：學生資料；學生 groupId/role/labGroupId/labRole 一律解除
 *    最後：建立新的「第一次段考」 + 6 組
 *  - grade >= 3 → 畢業，**整班刪除**（連同學生、所有資料、班級本身）
 *  - 已畢業 → 直接跳過
 */
export async function promoteClass(classId: string): Promise<PromotionPreview> {
  const cls = await db.classes.get(classId)
  if (!cls) throw new Error('班級不存在')

  const plan = previewPromotion(cls)

  if (plan.action === 'skip') return plan

  if (plan.action === 'graduate') {
    // 3 年級畢業 = 整班刪除（含學生、加分、考試、段考期、設定）
    await deleteClass(classId)
    return plan
  }

  // ── action === 'promote'：完整升年級流程 ──

  await db.transaction(
    'rw',
    [db.classes, db.students, db.groups, db.sessions,
     db.scoreEvents, db.examPeriods, db.exams, db.examScores],
    async () => {
      // 1. 收集此班的段考期 + 考試 id（用於串聯清除）
      const periods = await db.examPeriods.where('classId').equals(classId).toArray()
      const exams   = await db.exams.where('classId').equals(classId).toArray()
      const examIds = exams.map(e => e.id)

      // 2. 清空：考試成績 → 考試 → 加分事件 → 節次 → 小組 → 段考期
      if (examIds.length > 0) {
        await db.examScores.where('examId').anyOf(examIds).delete()
      }
      await db.exams.where('classId').equals(classId).delete()
      await db.scoreEvents.where('classId').equals(classId).delete()
      await db.sessions.where('classId').equals(classId).delete()
      // 小組透過 examPeriodId 連動（每段考期一套），全砍
      if (periods.length > 0) {
        await db.groups.where('examPeriodId').anyOf(periods.map(p => p.id)).delete()
      }
      await db.examPeriods.where('classId').equals(classId).delete()

      // 3. 學生資料保留，但解除全部分組（教室 + 實驗桌）
      await db.students.where('classId').equals(classId).modify({
        groupId:    null,
        role:       null,
        labGroupId: null,
        labRole:    null
      })

      // 4. 更新班級名稱與年級
      await db.classes.update(classId, {
        grade: plan.toGrade,
        name:  plan.toName
      })
    }
  )

  // 5. 在 transaction 外建立新的第一次段考（內部又會開 transaction）
  const { createExamPeriod } = await import('./examPeriodRepo')
  await createExamPeriod({
    classId,
    number: 1,
    name:   '第一次段考'
  })

  return plan
}

/**
 * promoteAllClasses
 * 對所有未畢業的班級執行升年級。回傳每班的處理結果。
 */
export async function promoteAllClasses(): Promise<PromotionPreview[]> {
  const all     = await listClasses()
  const targets = all.filter(c => !c.graduated)

  const results: PromotionPreview[] = []
  for (const cls of targets) {
    try {
      const result = await promoteClass(cls.id)
      results.push(result)
    } catch (e) {
      console.error(`升年級失敗：${cls.name}`, e)
      results.push({
        classId:   cls.id,
        fromGrade: cls.grade,
        fromName:  cls.name,
        toGrade:   cls.grade,
        toName:    cls.name,
        action:    'skip'
      })
    }
  }
  return results
}

/**
 * recordPromotionDone
 * 記錄某個學年已處理過升年級，避免 App 反覆提示。
 * 寫到 config.prefs.lastPromotedSchoolYear。
 */
export async function recordPromotionDone(schoolYear: number): Promise<void> {
  const { getConfig, updateConfig } = await import('./configRepo')
  const cur = await getConfig()
  await updateConfig({
    prefs: { ...cur.prefs, lastPromotedSchoolYear: schoolYear }
  })
}

// ── 刪除（連同所有相關資料）──────────────────────────────────

/**
 * deleteClass
 * 刪除班級會連帶清除所有學生、小組、加分記錄、考試成績、段考期。
 * 使用 transaction 確保資料一致性。
 */
export async function deleteClass(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.classes, db.students, db.groups, db.sessions, db.scoreEvents, db.examPeriods, db.examScores],
    async () => {
      await db.scoreEvents.where('classId').equals(id).delete()
      await db.examScores.where('classId').equals(id).delete()
      await db.examPeriods.where('classId').equals(id).delete()
      await db.sessions.where('classId').equals(id).delete()
      await db.groups.where('classId').equals(id).delete()
      await db.students.where('classId').equals(id).delete()
      await db.classes.delete(id)
    }
  )
}
