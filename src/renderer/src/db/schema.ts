/**
 * schema.ts — Dexie (IndexedDB) 資料庫架構定義
 *
 * 使用 IndexedDB 而非 localStorage 的原因：
 *  - 加分記錄（ScoreEvent）量大，localStorage 5MB 上限會爆
 *  - IndexedDB 支援索引查詢（依 classId、sessionId、examPeriodId 快速撈出區段資料）
 *  - 結構化資料更易維護
 *
 * 資料表清單：
 *  1. classes      — 班級
 *  2. students     — 學生
 *  3. groups       — 小組（每段考期 6 組）
 *  4. sessions     — 課堂節次（一節課一筆）
 *  5. scoreEvents  — 加分扣分事件（最大量級的資料表）
 *  6. examPeriods  — 段考期間（每班可多個：第一次/第二次/第三次段考）
 *  7. examScores   — 學生段考/平常考成績
 *  8. config       — 系統設定（單筆，key='main'）
 *
 * v2 變更（2026-05-07）：
 *  - Group 加入 examPeriodId（每段考期一套小組）
 *  - ScoreEvent 加入 examPeriodId（每筆加分都標記所屬段考期）
 *  - 自動為現有班級建立「第一次段考」並把舊資料歸入此期
 */

import Dexie, { type Table } from 'dexie'
import { nanoid } from 'nanoid'

// ── 角色與類型定義 ────────────────────────────────────────────

/** 學生在小組內的角色 */
export type StudentRole = 'leader' | 'assistant' | 'memberA' | 'memberB' | 'memberC' | 'memberD'

/** 角色對應的中文標籤（顯示用） */
export const ROLE_LABELS: Record<StudentRole, string> = {
  leader:    '組長',
  assistant: '助教',
  memberA:   '組員A',
  memberB:   '組員B',
  memberC:   '組員C',
  memberD:   '組員D'
}

/** 加分事件類型 */
export type ScoreEventType =
  | 'correct'         // 答對
  | 'wrong'           // 答錯
  | 'group_correct'   // 全組答對
  | 'group_wrong'     // 全組答錯
  | 'group_done'      // 全組完成（+100）
  | 'homework'        // 作業未繳（-70）
  | 'manual'          // 手動加減分
  | 'quiz'            // 平常考
  | 'exam'            // 段考

// ── 資料表介面 ────────────────────────────────────────────────

/** 班級 */
export interface Class {
  id:        string
  name:      string      // e.g. "101"
  grade:     number      // 1, 2, 3
  rows:      number      // 教室排數（用於座位表配置）
  cols:      number      // 教室列數
  semester:  string      // e.g. "115-1"
  createdAt: number
}

/** 學生 */
export interface Student {
  id:        string
  classId:   string
  seatNo:    number          // 座號
  name:      string          // 姓名
  /**
   * 目前所屬小組 id。注意：每段考期會有自己的 6 組，
   * 此欄位指向「目前段考期」的某組。切換到其他段考期時，
   * StudentsPage 會將此欄位視為「對當前段考期的分組指派」。
   */
  groupId:   string | null
  role:      StudentRole | null
  // ── 實驗桌獨立座位（與教室分開） ──
  // 第一次將學生指派到「教室」分組時，會自動把 labGroupId/labRole 鏡射成相同值；
  // 之後在「實驗桌檢視」拖曳會直接寫入下面這兩欄，與教室完全獨立。
  // 反之，「教室檢視」拖曳只寫 groupId/role，不會影響實驗桌。
  labGroupId?: string | null
  labRole?:    StudentRole | null
  // 教室實體座位位置（可為空：尚未排定）
  position:  { row: number, col: number } | null
  // 個人標準分（用於段考加分計算，可選）
  standardScore?: {
    quiz: number    // 平常考個人標準
    exam: number    // 段考個人標準
  }
  remarks?:  string
  createdAt: number
}

/** 小組（每段考期 6 組） */
export interface Group {
  id:        string
  classId:   string
  /**
   * 所屬段考期。v2 之後一定有值；舊資料在 migration 時會歸入該班的「第一次段考」。
   */
  examPeriodId: string
  number:    number    // 1~6
  name?:     string    // 自訂組名（可選，e.g. "第一組" 或 "鳳凰組"）
  color?:    string    // 顯示用顏色
  createdAt: number
}

/** 課堂節次（一節課一筆，用於累計該節答錯次數） */
export interface Session {
  id:        string
  classId:   string
  date:      string      // YYYY-MM-DD
  startAt:   number      // timestamp
  endAt?:    number
  note?:     string      // 上課內容備註
}

/** 加分扣分事件 — 最重要的資料表 */
export interface ScoreEvent {
  id:        string
  studentId: string
  classId:   string
  sessionId: string         // 該節課
  /**
   * 所屬段考期。v2 之後新增的事件一定有值；舊資料在 migration 時會被標記為該班的第一次段考。
   */
  examPeriodId: string
  groupId:   string | null
  timestamp: number
  score:     number         // 正/負分
  type:      ScoreEventType
  // 關聯資訊（依事件類型不同而填）
  meta?: {
    role?:        StudentRole
    streak?:      number      // 連對第幾次
    wrongCount?:  number      // 答錯第幾次
    examScore?:   number      // 考試分數（學生實際考幾分）
    examNumber?:  number      // 第幾次段考 / 平常考
    examId?:      string      // 對應 Exam.id（用於刪除考試時連帶移除其加分）
    examName?:    string      // 顯示用：「第3次平常考」
  }
  note?:     string
}

/** 段考期間（每段考一筆，用於計算每週排名與分組重組） */
export interface ExamPeriod {
  id:        string
  classId:   string
  number:    number      // 第 N 次段考（1, 2, 3...）
  name:      string      // 顯示名稱，e.g. "第一次段考"
  startDate: string      // YYYY-MM-DD（可空）
  endDate:   string      // YYYY-MM-DD（可空）
  weekCount: number      // 期間共幾週（用於 Excel 匯出，可空時用 8）
  createdAt: number
}

/** 考試（一筆 = 一場考試的元資料；學生個別分數存 ExamScore） */
export interface Exam {
  id:           string
  classId:      string
  examPeriodId: string             // 屬於哪個段考期
  type:         'quiz' | 'exam'    // 平常考 / 段考
  number:       number             // 該段考期內第 N 次（自動序號）
  name:         string             // 顯示名稱，例：「第3次平常考」
  date:         string             // YYYY-MM-DD
  appliedAt:    number | null      // 已套用加分的時間戳（null = 尚未套用）
  createdAt:    number
}

/** 學生個別考試成績（綁定 Exam） */
export interface ExamScore {
  id:           string
  examId:       string             // refs Exam
  studentId:    string
  score:        number              // 0~100
  bonusEarned:  number               // 計算出來該加幾分（套用後寫入 ScoreEvent.score）
  createdAt:    number
}

/** 系統設定（單筆，key='main'） */
export interface ConfigDoc {
  key:    'main'
  // 加分規則
  rules:  ScoringRules
  // 語料庫（讚美/鼓勵）
  praise:        string[]   // 答對讚美語
  encouragement: string[]   // 答錯鼓勵語
  // 偏好設定
  prefs: {
    isMuted:        boolean   // 全域靜音
    showAnimations: boolean   // 顯示動畫（低階電腦可關）

    // ── 安全：登入密碼 ──
    /**
     * SHA-256 雜湊。null/undefined 表示尚未設定密碼（首次啟動）。
     * 詳見 utils/auth.ts。
     */
    passwordHash?:    string | null
    /** 密碼提示（公開顯示在鎖屏，例：「你的舊家門牌號」） */
    passwordHint?:    string
    /** 閒置幾分鐘自動回鎖屏；0 = 永不自動鎖。預設 30 分鐘。 */
    autoLockMinutes?: number
  }
}

/** 加分規則 */
export interface ScoringRules {
  // 角色基礎分（答對時）
  roleBaseScore: Record<StudentRole, number>
  // 連對加成（每多連對一次 +N）
  correctStreakBonus: number
  // 答錯規則
  wrongPenalty: {
    firstFree: boolean    // 該節第一次免扣
    perWrong:  number     // 之後每次扣 N（遞增：第2次-10、第3次-20）
  }
  // 抽籤機率調整
  drawWeights: {
    wrong1Multiplier: number   // 答錯 1 次的權重倍率（1.5）
    wrong2Multiplier: number   // 答錯 2 次（2.0）
    maxMultiplier:    number   // 上限（2.0）
  }
  // 快速加分按鈕
  quickScores: number[]
  // 作業未繳每項扣
  homeworkPenalty: number
  // 全組完成獎勵
  groupAllDoneBonus: number
  // 平常考規則（依角色）
  quizRules: Record<StudentRole, ExamScoringRule>
  // 段考規則（用個人標準分，全角色共用）
  examRule: ExamScoringRule
}

/** 考試加分規則（平常考/段考通用結構） */
export interface ExamScoringRule {
  standard:     number    // 標準分（達此分起算）
  perAbove:     number    // 每高 1 分加 N
  perBelow:     number    // 每低 1 分扣 N
  bonus90:      number    // 達 90 分額外加
  bonus95:      number    // 達 95 分額外加
  bonus100:     number    // 達 100 分額外加
}

// ── Dexie 資料庫類別 ──────────────────────────────────────────

export class ClassroomDB extends Dexie {
  classes!:     Table<Class, string>
  students!:    Table<Student, string>
  groups!:      Table<Group, string>
  sessions!:    Table<Session, string>
  scoreEvents!: Table<ScoreEvent, string>
  examPeriods!: Table<ExamPeriod, string>
  exams!:       Table<Exam, string>
  examScores!:  Table<ExamScore, string>
  config!:      Table<ConfigDoc, string>

  constructor() {
    super('ClassroomAssistantDB')

    // ── v1（初始）──
    this.version(1).stores({
      classes:     'id, name, grade',
      students:    'id, classId, seatNo, groupId, [classId+seatNo]',
      groups:      'id, classId, number',
      sessions:    'id, classId, date, [classId+date]',
      scoreEvents: 'id, studentId, classId, sessionId, type, timestamp, [classId+timestamp]',
      examPeriods: 'id, classId, number',
      examScores:  'id, studentId, classId, examPeriodId, examType, date',
      config:      'key'
    })

    // ── v2（2026-05-07）：加入 examPeriodId 索引 + 自動為舊班級建立第一次段考 ──
    this.version(2).stores({
      classes:     'id, name, grade',
      students:    'id, classId, seatNo, groupId, [classId+seatNo]',
      groups:      'id, classId, examPeriodId, number, [classId+examPeriodId]',
      sessions:    'id, classId, date, [classId+date]',
      scoreEvents: 'id, studentId, classId, sessionId, examPeriodId, type, timestamp, [classId+timestamp], [classId+examPeriodId]',
      examPeriods: 'id, classId, number',
      examScores:  'id, studentId, classId, examPeriodId, examType, date',
      config:      'key'
    }).upgrade(async (tx) => {
      // 對每個現有班級：若無段考期，自動建立「第一次段考」並把舊資料歸入此期
      const classesArr = await tx.table('classes').toArray()
      for (const cls of classesArr) {
        const periods = await tx.table('examPeriods').where('classId').equals(cls.id).toArray()
        let firstPeriodId: string

        if (periods.length === 0) {
          firstPeriodId = nanoid()
          await tx.table('examPeriods').add({
            id:        firstPeriodId,
            classId:   cls.id,
            number:    1,
            name:      '第一次段考',
            startDate: '',
            endDate:   '',
            weekCount: 8,
            createdAt: Date.now()
          })
        } else {
          // 用 number 最小者作為「第一次段考」
          const sorted = [...periods].sort((a: any, b: any) => a.number - b.number)
          firstPeriodId = sorted[0].id
          // 補上 name 欄位
          for (const p of periods) {
            if (!(p as any).name) {
              await tx.table('examPeriods').update((p as any).id, {
                name: `第${(p as any).number}次段考`
              })
            }
          }
        }

        // 把該班所有沒 examPeriodId 的小組歸入第一次段考
        await tx.table('groups').where('classId').equals(cls.id).modify((g: any) => {
          if (!g.examPeriodId) g.examPeriodId = firstPeriodId
        })

        // 把該班所有沒 examPeriodId 的加分事件歸入第一次段考
        await tx.table('scoreEvents').where('classId').equals(cls.id).modify((e: any) => {
          if (!e.examPeriodId) e.examPeriodId = firstPeriodId
        })
      }
    })

    // ── v3（2026-05-08）：考試成績功能 — 新增 exams 表 + 重設 examScores 結構 ──
    this.version(3).stores({
      classes:     'id, name, grade',
      students:    'id, classId, seatNo, groupId, [classId+seatNo]',
      groups:      'id, classId, examPeriodId, number, [classId+examPeriodId]',
      sessions:    'id, classId, date, [classId+date]',
      scoreEvents: 'id, studentId, classId, sessionId, examPeriodId, type, timestamp, [classId+timestamp], [classId+examPeriodId]',
      examPeriods: 'id, classId, number',
      exams:       'id, classId, examPeriodId, type, date, [classId+examPeriodId+type]',
      examScores:  'id, examId, studentId, [examId+studentId]',
      config:      'key'
    }).upgrade(async (tx) => {
      // 舊版 examScores 結構不同（schema 內欄位都換了），且尚未實作該功能，
      // 保險起見直接清空：避免殘留資料對不上新欄位導致查詢出錯。
      await tx.table('examScores').clear()
    })
  }
}

// 全域單例
export const db = new ClassroomDB()
