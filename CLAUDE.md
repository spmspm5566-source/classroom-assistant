# ClassroomAssistant — 設計規劃文件

> 班級助手雙軌應用 | Electron 桌面版 + PWA 網頁版 | React + TypeScript + Tailwind
>
> 版本：v0.5.1 (前述全部 + ☁️ 雲端備份改「每班一筆」+ 段考期刪除/智慧舊資料提示 + 鎖屏視窗控制)　最後更新：2026-05-17
>
> 🌐 **PWA 線上版**：https://classroom-assistant.spmspm5566.workers.dev（Cloudflare Workers Static Assets）

---

## 目錄

1. [專案定位](#1-專案定位)
2. [技術棧](#2-技術棧)
3. [檔案結構](#3-檔案結構)
4. [資料模型 (Dexie/IndexedDB Schema)](#4-資料模型-dexieindexeddb-schema)
5. [視窗模式系統](#5-視窗模式系統)
6. [核心功能模組](#6-核心功能模組)
7. [加分規則系統](#7-加分規則系統)
8. [段考期分組系統](#8-段考期分組系統)
9. [分組概覽（教室／實驗桌雙視圖）](#9-分組概覽教室實驗桌雙視圖)
10. [考試成績系統](#10-考試成績系統)
11. [登入密碼與鎖屏](#11-登入密碼與鎖屏)
12. [Excel 匯入 / 匯出](#12-excel-匯入--匯出)
13. [全域狀態管理 (Zustand)](#13-全域狀態管理-zustand)
14. [音效系統](#14-音效系統)
15. [關鍵設計決策](#15-關鍵設計決策)
16. [Schema 升級與資料遷移](#16-schema-升級與資料遷移)
17. [已修正的重大問題](#17-已修正的重大問題)
18. [打包與部署](#18-打包與部署)
19. [未完成功能與後續路線](#19-未完成功能與後續路線)
20. [雲端備份（跨電腦／跨教室）](#20-雲端備份跨電腦跨教室)

---

## 1. 專案定位

**ClassroomAssistant（班級助手）** 是國中／國小老師在課堂上即時使用的工具，採**雙軌制**：

- 🖥 **Electron 桌面版** — Windows/Mac 老師個人電腦，含懸浮模式等完整功能
- 🌐 **PWA 網頁版** — iPad / Android 平板 / Chromebook / 任何瀏覽器，可離線

兩軌共用同一份 React 程式碼，由 `utils/platform.ts` 在 runtime 偵測環境切換 UI。
詳見 [DEPLOY.md](./DEPLOY.md) 部署指引。

### 整合五大核心

| 工具 | 用途 |
|------|------|
| ⏱ 計時器 | 倒數計時、警示音、可懸浮在其他軟體之上 |
| 🎲 抽籤器 | 加權隨機抽籤、輪盤動畫、浮字效果、老師指定模式、即時加減分、答對/答錯反饋語 |
| 📊 加分系統 | 全班/小組/個人累計、競賽名次、依段考期分別統計、Excel 匯出 |
| 📝 考試成績 | 平常考/段考輸入，依規則自動算加分，套用後即進入加分總覽 |
| 🔐 鎖屏 | 課堂中離開教室一鍵鎖屏，含閒置自動鎖；防學生偷看 |

### 設計核心理念

- **離線優先**：完全不需網路，所有資料儲存在本機 IndexedDB
- **單檔部署簡易**：Electron 包成 portable .exe，雙擊即執行，免安裝
- **跨平台**：同一份程式碼產出桌面版 + PWA 網頁版，平板也能用
- **視覺輕量**：低性能舊電腦也能流暢運作（規則設定可關閉動畫）
- **無強制流程**：老師可以只用其中一個工具，不必設定全部資料
- **錯誤隔離**：ErrorBoundary 包覆每個模式，單頁 crash 不會拖垮整個 App

---

## 2. 技術棧

| 層次 | 技術 |
|------|------|
| 桌面框架 | Electron 31+（單一 BrowserWindow + 模式切換） |
| 桌面打包 | electron-builder（portable.exe + NSIS setup.exe） |
| 前端框架 | React 18 + TypeScript |
| 樣式 | Tailwind CSS（含 brand 主題色系） |
| 建構工具 | electron-vite（桌面）+ Vite 5（PWA） |
| 本地資料庫 | Dexie 4 (IndexedDB) — 即時查詢與索引 |
| 全域狀態 | Zustand 4（含 persist middleware） |
| 表格 / Excel | ExcelJS（讀寫格式化 .xlsx，含多工作表） |
| 動畫 | Framer Motion（輪盤、計分浮動、浮字） |
| 拖曳 | @dnd-kit/core（座位互換） |
| 音效 | 原生 Web Audio API（程式產生波形，無音檔依賴） |
| 密碼雜湊 | Web Crypto API SHA-256（無第三方套件） |
| 雲端備份 | Supabase (`@supabase/supabase-js`) — Auth + Postgres + RLS |
| 加密 | Web Crypto AES-GCM + PBKDF2（雲端備份內容加密） |
| ID | nanoid |
| Reactive Hooks | dexie-react-hooks (`useLiveQuery`) |
| PWA | Service Worker + Web App Manifest |

> **不使用** Redux、TanStack Query、styled-components 等較重的套件，保持依賴最小化。

---

## 3. 檔案結構

```
ClassroomAssistant/
├── src/
│   ├── main/                         # Electron 主程序
│   │   ├── index.ts                  # 進入點：app lifecycle
│   │   └── windowManager.ts          # 視窗建立 + 模式切換
│   ├── preload/
│   │   └── index.ts                  # contextBridge 暴露 electronAPI
│   └── renderer/
│       ├── index.html                # 含 PWA manifest 連結 + Service Worker 註冊
│       ├── public/
│       │   ├── manifest.webmanifest  # PWA app metadata
│       │   ├── sw.js                 # Service Worker（離線快取）
│       │   └── icon.svg              # App 圖示
│       └── src/
│           ├── App.tsx               # 雙層路由 + 鎖屏閘 + 閒置自動鎖
│           ├── window.d.ts           # window.electronAPI 型別宣告
│           │
│           ├── db/                   # ── 資料層 ──
│           │   ├── schema.ts         # Dexie 資料表 + interface 定義（v3）
│           │   ├── classRepo.ts      # 班級 CRUD + createClassWithFirstPeriod
│           │   ├── studentRepo.ts    # 學生 CRUD + bulkImport + assignGroup（含 lab 鏡射）
│           │   ├── groupRepo.ts      # 小組 CRUD（依段考期）
│           │   ├── examPeriodRepo.ts # 段考期 CRUD（建立時自動產生 6 組）
│           │   ├── examRepo.ts       # 考試 CRUD
│           │   ├── examScoreRepo.ts  # 考試分數 + applyExamBonuses（套用加分）
│           │   ├── sessionRepo.ts    # 課堂節次（每天一節）
│           │   ├── scoreRepo.ts      # 加分事件 + 累計查詢
│           │   └── configRepo.ts     # 系統設定 + 自我修復 + 密碼 API
│           │
│           ├── lib/
│           │   └── supabaseClient.ts # Supabase 連線（雲端備份）
│           │
│           ├── store/                # ── Zustand 狀態 ──
│           │   ├── useAppStore.ts    # 班級/段考期/頁面/靜音（持久化）
│           │   ├── useAuthStore.ts   # 鎖屏驗證（瞬時，重啟必重鎖）
│           │   ├── useCloudAuthStore.ts # 雲端帳號登入 + 記憶體通行碼
│           │   ├── useScoringStore.ts# 連對/答錯/抽籤權重（瞬時）
│           │   ├── useTimerStore.ts  # 倒數計時器
│           │   └── useDrawerStore.ts # 抽籤器狀態機（含 manualPick）
│           │
│           ├── data/                 # ── 預設資料 ──
│           │   ├── default-rules.ts
│           │   └── default-praise.ts # 30 句讚美 + 30 句鼓勵
│           │
│           ├── utils/                # ── 工具函式 ──
│           │   ├── platform.ts       # isElectron / isWeb / isPWAStandalone
│           │   ├── auth.ts           # SHA-256 雜湊（Web Crypto）
│           │   ├── backup.ts         # JSON 整包備份匯出/匯入（full/roster/scoring）
│           │   ├── cloudBackup.ts    # 雲端加密上傳/解密下載（AES-GCM）
│           │   ├── semester.ts       # 學年/學期/升年級觸發判斷
│           │   ├── audio.ts          # Web Audio 程式產生音效
│           │   ├── scoring.ts        # 加分計算公式
│           │   ├── draw.ts           # 加權隨機抽籤
│           │   ├── period.ts         # 週次/日期區間
│           │   ├── excel.ts          # Excel 讀寫（單班 + 多班一次匯入）
│           │   └── excelExport.ts    # 週小組加分表 + 加分明細表
│           │
│           ├── hooks/
│           │   ├── useWindowMode.ts  # 模式切換（雙軌制 IPC vs React state）
│           │   ├── useRoulette.ts    # 輪盤動畫（ref 模式避免無限迴圈）
│           │   └── useStudentScores.ts # 即時學生 / 小組分數
│           │
│           ├── components/
│           │   ├── TitleBar.tsx       # 含鎖屏按鈕，web 模式自動隱藏視窗操作
│           │   ├── ClassSwitcher.tsx
│           │   ├── PeriodSwitcher.tsx
│           │   ├── Sidebar.tsx
│           │   ├── MiniWidget.tsx
│           │   ├── LockScreen.tsx     # 鎖屏（首設/解鎖）
│           │   ├── ErrorBoundary.tsx  # 全域錯誤邊界
│           │   ├── shared/            # Button, Modal, Input, Select, EmptyState, ManualAdjustDialog
│           │   ├── students/          # StudentRow, GroupBoard, StudentImportDialog,
│           │   │                      #   MultiClassImportDialog, ClassroomLayout, LabTableLayout
│           │   ├── drawer/            # SeatGrid, SeatCard, DrawerControls, DrawResultModal,
│           │   │                      #   FeedbackOverlay, ClassAnswerMode,
│           │   │                      #   ManualPickOverlay, DrawingExcitementOverlay
│           │   ├── exams/             # ExamScoreDialog
│           │   ├── cloud/             # LoginDialog（雲端帳號登入/註冊）
│           │   └── rules/             # RuleSection, NumberField, SecuritySection,
│           │                          #   BackupSection（含 CloudBackupCard）
│           │
│           └── pages/
│               ├── HomePage.tsx
│               ├── ClassesPage.tsx
│               ├── StudentsPage.tsx
│               ├── TimerPage.tsx
│               ├── DrawerPage.tsx
│               ├── RulesPage.tsx     # 含 SecuritySection（密碼/自動鎖）
│               ├── PhrasesPage.tsx
│               ├── DashboardPage.tsx # 依段考期過濾
│               ├── ExamsPage.tsx     # 考試成績主頁
│               ├── ExportPage.tsx    # 依段考期匯出
│               └── PlaceholderPage.tsx
│
├── electron.vite.config.ts           # Electron 桌面版 build
├── vite.web.config.ts                # PWA 網頁版 build
├── wrangler.toml                     # Cloudflare Workers Static Assets 部署設定
├── package.json                      # 含 electron-builder 設定（portable + NSIS）
├── tsconfig.web.json
├── tailwind.config.mjs
├── postcss.config.mjs
├── build/icon.png                    # electron-builder Windows 圖示（PowerShell 產生）
├── DEPLOY.md                         # 部署指引
└── CLAUDE.md                         # ← 本文件
```

---

## 4. 資料模型 (Dexie/IndexedDB Schema)

資料庫名稱：`ClassroomAssistantDB`，目前 schema 版本 v3。

### 4.1 資料表清單

| Table | 主鍵 | 說明 |
|-------|------|------|
| `classes` | id | 班級基本資料 |
| `students` | id | 學生（含教室與實驗桌兩套座位欄位） |
| `groups` | id | 小組（每段考期 N 組） |
| `sessions` | id | 課堂節次（一天通常一筆） |
| `scoreEvents` | id | 加分扣分事件 — 寫入量最大 |
| `examPeriods` | id | 段考期（第一/二/三次段考） |
| `exams` | id | 一場考試的元資料（v3 新增） |
| `examScores` | id | 學生個別考試成績（v3 重設結構） |
| `config` | key='main' | 系統設定（規則、語料庫、偏好、密碼） |

### 4.2 主要 interface

```typescript
interface Class {
  id, name, grade, rows, cols, semester, createdAt
}

interface Student {
  id, classId, seatNo, name,
  // 教室檢視座位
  groupId:    string | null,
  role:       StudentRole | null,
  // 實驗桌檢視座位（與教室獨立）
  labGroupId?: string | null,
  labRole?:    StudentRole | null,
  // 教室實體座位位置（保留欄位，未實作 UI）
  position:   { row, col } | null,
  standardScore?: { quiz, exam },
  remarks?, createdAt
}

interface Group {
  id, classId,
  examPeriodId,         // 每段考期一套小組
  number,               // 1, 2, 3, ...（不限 6 組）
  name?, color?, createdAt
}

interface ExamPeriod {
  id, classId, number, name,
  startDate, endDate, weekCount,
  createdAt
}

interface Exam {
  id, classId, examPeriodId,
  type: 'quiz' | 'exam',
  number, name, date,
  appliedAt: number | null,    // 已套用加分的時間戳
  createdAt
}

interface ExamScore {
  id, examId, studentId,
  score, bonusEarned, createdAt
}

interface ScoreEvent {
  id, studentId, classId, sessionId,
  examPeriodId,                // 段考期
  groupId, timestamp, score, type,
  meta?: { role, streak, wrongCount, examScore, examNumber, examId, examName },
  note?
}

interface ConfigDoc {
  key: 'main',
  rules:         ScoringRules,
  praise:        string[],
  encouragement: string[],
  prefs: {
    isMuted, showAnimations,
    // 鎖屏
    passwordHash?:    string | null,
    passwordHint?:    string,
    autoLockMinutes?: number     // 0 = 永不
  }
}

type ScoreEventType =
  | 'correct' | 'wrong'
  | 'group_correct' | 'group_wrong'
  | 'group_done'        // 全組完成 +100
  | 'homework'          // 作業未繳 -70
  | 'manual'            // 手動加減分
  | 'quiz' | 'exam'
```

### 4.3 索引設計

```
classes:     'id, name, grade'
students:    'id, classId, seatNo, groupId, [classId+seatNo]'
groups:      'id, classId, examPeriodId, number, [classId+examPeriodId]'
sessions:    'id, classId, date, [classId+date]'
scoreEvents: 'id, studentId, classId, sessionId, examPeriodId, type, timestamp,
              [classId+timestamp], [classId+examPeriodId]'
examPeriods: 'id, classId, number'
exams:       'id, classId, examPeriodId, type, date, [classId+examPeriodId+type]'
examScores:  'id, examId, studentId, [examId+studentId]'
config:      'key'
```

複合索引 `[classId+examPeriodId]`、`[classId+timestamp]` 是 Dashboard 與 Excel 匯出的查詢核心。

---

## 5. 視窗模式系統（雙軌制）

`useWindowMode` hook 雙軌實作：Electron 透過 IPC 真的調作業系統視窗；
Web/PWA 純 React state，模式切換 = 全螢幕覆蓋切換。對外接口完全相同。

| Mode | Electron 行為 | Web/PWA 行為 | 對應頁面 |
|------|------|------|----------|
| `normal` | 1200×750 主視窗 | 一般網頁 | HomePage / ClassesPage / ... |
| `timer` | 360×220 永遠最上層 popup | 全螢幕覆蓋 | TimerPage |
| `drawer` | 720×600 永遠最上層 popup | 全螢幕覆蓋 | DrawerPage |
| `mini` | 280×72 右上角迷你 widget | ❌ 不支援（瀏覽器禁止） | MiniWidget |

**判斷環境**：`utils/platform.ts` → `isElectron()` / `isWeb()` / `isPWAStandalone()`。
TitleBar 在 web 模式自動隱藏視窗操作按鈕；HomePage 在 web 模式隱藏「懸浮模式」卡片。

**Electron Windows 視窗注意事項：**
- 切換模式必須先 `setMinimumSize(0, 0)` 再 `setBounds()`，否則高度會卡在最小尺寸
- `setAlwaysOnTop(true, 'pop-up-menu')` 才能蓋過大多數應用視窗
- DrawerPage 自外層套 `drag-region`，內部模態必須加 `no-drag` 才能點擊（DrawResultModal、FeedbackOverlay、ClassAnswerMode、ManualPickOverlay 都已加）

**PWA 設定檔：**
- `src/renderer/public/manifest.webmanifest` — App 名稱、圖示、theme color
- `src/renderer/public/sw.js` — Stale-While-Revalidate 快取策略
- `src/renderer/public/icon.svg` — 動態 SVG 圖示
- `vite.web.config.ts` — web 軌打包設定，輸出到 `dist-web/`

---

## 6. 核心功能模組

### 6.1 計時器 (Timer)

- **狀態：** Idle → Running → Finished
- **設計：** 用 `endAt` 時間戳，而非 setInterval 累計（避免 drift）
- **音效：** 倒數最後 5 秒「嗶嗶嗶」、結束「叮咚」
- **持久化：** Timer 設定（preset 時間）寫到 localStorage
- **常見預設：** 5 分鐘（小考）、10 分鐘（默寫）、25 分鐘（番茄）

### 6.2 抽籤器 (Drawer)

**狀態機：**
```
idle ──開始抽籤──> spinning ──輪盤停止──> result
                                              ├── 答對 ──> feedback (correct)
                                              ├── 答錯 ──> feedback (wrong)
                                              └── 取消 ──> idle
idle ──老師指定──> manualPick ─點選學生─> result（跳過輪盤動畫）
idle ──全班作答──> classMode  ──確認送出─> feedback (batch)
```

**三種抽籤入口：**
1. **🎲 隨機抽籤** — 加權演算法 + 輪盤動畫
2. **👆 老師指定** — 全螢幕學生選單，點哪位就跳結果視窗（`ManualPickOverlay`）
3. **👥 全班作答** — 老師勾選誰答對，一次 `bulkAddScoreEvents`

**加權隨機演算法：**
- 基礎權重：每位候選學生 = 1
- 答錯歷史加權（本次程式啟動以來累計）：×1.5、×2.0、×2.0（封頂）
- 排除「上一個被抽中者」避免立刻再被抽
- 重啟程式後加權歸零

**輪盤動畫：**
- 共 28 步，間隔由 50ms 漸慢到 280ms（緩動）
- 序列前 27 個為干擾項，第 28 個為實際得獎人
- **DrawingExcitementOverlay**（v0.4 新增）：抽籤期間隨機冒出候選學生姓名泡泡，5 種橘黃漸層、80ms 一顆、最多 15 顆飄上淡出，營造緊張感

### 6.3 計分系統 (Scoring)

**寫入入口：**
1. `DrawerPage`（抽籤答對/答錯、老師指定、全班作答）
2. `ManualAdjustDialog`（手動加減分）
3. `ExamScoreDialog`（套用考試加分）

**即時計算：** `useStudentScores` 用 `useLiveQuery` 監聽 `scoreEvents`。

---

## 7. 加分規則系統

預設值定義於 `data/default-rules.ts`，老師可在「加分規則」頁調整。

### 7.1 角色基礎分（答對時）

| 角色 | 預設加分 |
|------|---------|
| 組長 | 10 |
| 助教 | 15 |
| 組員 A~D | 20 |

> **設計思路：** 組員拿最多分以鼓勵主動發言；組長/助教因身份天然更願意答題，給少一點以平衡機會。

### 7.2 連對加成

每多連對一次 +5 分。例：組員（基礎 20）連對第 3 次 = 20 + 2×5 = 30。

### 7.3 答錯扣分

- 第 1 次答錯：免扣（可關閉）
- 第 N 次答錯：扣 (N-1) × 10
- 累計範圍：「該節課內」（換節清零）

### 7.4 抽籤機率倍率

詳見 6.2 節。

### 7.5 快速加分按鈕

預設 `[5, 10, 15, 20, 25, 30]`，用於抽籤結果視窗的「自定義加分」。

### 7.6 作業 / 全組獎勵

- 作業每項未繳：-70
- 全組完成獎勵：+100

### 7.7 平常考規則（依角色）

| 角色 | 標準分 | 每高 1 分 | 每低 1 分 | ≥90 加 | ≥95 加 | 100 加 |
|------|--------|-----------|-----------|--------|--------|--------|
| 組長 | 70 | +2 | -2 | +30 | +50 | +100 |
| 助教 | 65 | +2 | -2 | +30 | +50 | +100 |
| 組員 | 60 | +2 | -2 | +30 | +50 | +100 |

### 7.8 段考規則

全角色共用一個公式，但「標準分」改用 `Student.standardScore.exam`（學生個人標準分）。

---

## 8. 段考期分組系統

### 8.1 設計需求

> 「我每一次段考會重新分組、重新計算加分。所以分組選項要加上第一次段考、第二次段考、第三次段考，每次段考完會統計一次分數及競賽名次。」

### 8.2 資料模型

每個 **班級** 可有多個 **段考期**（ExamPeriod），每個段考期擁有自己的 **N 個小組**：

```
Class (203 班)
├── ExamPeriod 第一次段考
│   ├── Group 1, 2, 3, 4, 5, 6 [各組學生]
│   └── ScoreEvents（examPeriodId 標記）
│
├── ExamPeriod 第二次段考
│   ├── Group 1-N [重新分組]
│   └── ScoreEvents
│
└── ExamPeriod 第三次段考 ...
```

### 8.3 PeriodSwitcher 元件

位於標題列班級切換器旁邊：
- 段考期下拉選單
- ＋ 按鈕：建立下一次段考（自動序號 + 6 組初始）
- 班級無段考期時顯示「點此建立第一次段考」提示
- 用 ref guard 避免無限渲染（每班只 auto-select 一次）

### 8.4 競賽名次計算

DashboardPage 直接從 `ScoreEvent.groupId` 統計，不依賴 Student.groupId。
這樣即使學生跨段考期換組，也能正確算出「該段考期該組的得分」。

---

## 9. 分組概覽（教室／實驗桌雙視圖）

進「學生與分組 → 分組概覽」可見**兩種檢視**，用同一份學生資料、**獨立的座位安排**：

### 9.1 🏫 教室檢視（`ClassroomLayout`）

預設視圖。每組為一直行，學生座位由上往下垂直排列：

```
              講桌                   ← 教室前方
[第N組] ... [第3組] [第2組] [第1組]
              ↓ 教室後方
```

- 第 1 組在最右側（老師站講桌前的視角）
- 直行寬度 130px，組數多時自動橫向滾動
- 每張座位：角色徽章 + 座號 + 姓名

### 9.2 🧪 實驗桌檢視（`LabTableLayout`）

```
           講桌                       ← 教室前方
   [第3組] [第2組] [第1組]            ← 第一列（靠講桌）
   [第6組] [第5組] [第4組]
   [第9組] [第8組] [第7組]
           ↓ 教室後方
```

- 每列固定 3 組，自動算列數（6 組=2 列、9 組=3 列）
- 同列右側為較小組號
- 每張實驗桌：黃色桌身內顯示「● 第N組 ／ X 人」+ 6 個座位環繞四周

座位↔角色對應（圍繞長方形桌子）：
- 上方中央 = 組長
- 下方中央 = 助教
- 左上/左下 = 員 A、B
- 右上/右下 = 員 C、D

### 9.3 拖曳行為

兩種檢視都用 `@dnd-kit/core` 支援：

| 起點 → 終點 | 行為 |
|------------|------|
| 同組、同位置 | 不動作 |
| 同組、不同位置 | 兩人對換**角色** |
| 跨組（兩端都有人） | 兩人對換 **角色 + 組別**（A 到 B 的位置，B 到 A 的位置） |
| 拖到空位 | 該學生**移動**到目標位置 |

`makeSwapHandler(students, layout)` 是共用函式（layout = 'classroom' | 'lab'），
告訴它寫哪一組欄位（`groupId/role` vs `labGroupId/labRole`）。

### 9.4 兩個檢視「互相獨立」

- `Student.groupId/role` = 教室檢視座位
- `Student.labGroupId/labRole` = 實驗桌檢視座位（v0.4 新增）
- 在教室拖曳 → 只動 `groupId/role`，實驗桌不變
- 在實驗桌拖曳 → 只動 `labGroupId/labRole`，教室不變
- **首次分組自動鏡射**：當 lab 欄位是 null 時，`assignGroup` 會把同樣值寫到 lab 欄位，讓兩邊第一眼看起來一致；之後就獨立

### 9.5 工具列

GroupBoard 上方提供：
- 🏫 / 🧪 檢視切換
- 🎲 **隨機排座位** — 對「已分組但 role=null」的學生隨機塞進空位（操作目前檢視的欄位）
- 📋 **從教室複製**（僅實驗桌檢視顯示）— 一鍵把教室座位灌進實驗桌（會覆蓋）
- ＋ **新增小組** — 動態增加小組（突破預設 6 組限制）
- − **移除最末組** — 連帶解除組內成員分組

---

## 10. 考試成績系統

進「考試成績」頁面（v0.4 新增）：

### 10.1 流程

```
新增考試 (CreateExamDialog)
   ↓ 填名稱、類型(quiz/exam)、日期 → 自動序號「第 N 次平常考/段考」
建立考試（含初始 appliedAt=null）
   ↓ 點考試卡片
ExamScoreDialog 開啟
   ├── 表格列出全班：座號 | 姓名 | 角色 | 標準分 | 成績輸入 | 預計加分（即時計算）
   ├── 規則速覽（顯示目前生效公式）
   ├── 操作：儲存草稿 / 套用加分 / 撤銷加分
   ↓ 套用加分
為每位學生產生一筆 ScoreEvent（type='quiz'/'exam', meta.examId=...）
標記 Exam.appliedAt = Date.now()
即時反映在加分總覽
```

### 10.2 計算公式

- **平常考**：依角色標準（`rules.quizRules[role]`）
- **段考**：依學生個人標準（`student.standardScore.exam`）
- 公式：`(score - standard) × perAbove`（高於）或 `-(standard - score) × perBelow`（低於）+ 90/95/100 階梯獎勵

### 10.3 撤銷重套

已套用的考試會鎖定欄位（防誤改）。要修改分數需先按「撤銷加分」：
- 用 `meta.examId` 找出對應 ScoreEvent 並刪除
- `Exam.appliedAt` 清回 null
- 編輯後可再次套用

### 10.4 與段考期整合

- 考試屬於某段考期（`Exam.examPeriodId`），自動跟著切換
- ExamsPage 依 Tab（平常考 / 段考）+ 目前段考期過濾
- 套用後產生的 ScoreEvent 也標記同段考期，加分總覽同期統計

---

## 11. 登入密碼與鎖屏

v0.4 新增。設計目標：**擋下課堂上偷看的學生／同事**，不是抗駭客級加密。

### 11.1 流程

```
首次啟動
  ↓
🔐 LockScreen 顯示「設定密碼」
  ・輸入兩次密碼（≥4 字元）
  ・選填提示文字（「你的舊家門牌號」）
  ↓
進入 App
  ↓
閒置 N 分鐘 → 自動回鎖屏（預設 30 分鐘，可在規則頁調整或設 0=不鎖）
按右上 🔒 → 立即鎖屏
  ↓
🔒 LockScreen 顯示「請輸入密碼」+ 提示
  ・連錯 5 次 → 鎖死 60 秒倒數
  ・「忘記密碼？」連結 → 雙重確認後砍整個 IndexedDB 重來
  ↓
密碼正確 → markAuthed() → 解鎖
```

### 11.2 技術細節

- **`utils/auth.ts`**：Web Crypto API SHA-256，固定 salt
- **`store/useAuthStore.ts`**：瞬時狀態，重啟必重鎖；含防硬猜計數與鎖死 timestamp
- **`components/LockScreen.tsx`**：兩種模式（setup / unlock）的全螢幕覆蓋
- **`components/rules/SecuritySection.tsx`**：規則頁頂端區塊，含修改密碼、自動鎖屏分鐘、立即鎖屏按鈕
- **App.tsx 閒置偵測**：監聽 `mousedown/keydown/touchstart/mousemove`，重置計時器

### 11.3 安全等級（誠實標示）

✅ 擋下：學生/同事偷看、不小心點到、平板放教室桌上
❌ 擋不住：能拿到電腦的駭客（IndexedDB 資料本身仍是明文）

---

## 12. Excel 匯入 / 匯出

### 12.1 學生匯入（單班）

`StudentImportDialog` — 在學生與分組頁右上「匯入 Excel」。

格式（第一列為標題）：
```
座號 | 姓名 | 備註（可選）
```
也支援英文標題（seatNo / name / remarks）與 .xlsx / .xls / .csv。
匯入時會 **清空該班學生** 並重新寫入（加分歷史保留）。

### 12.2 多班一次匯入 ⭐

`MultiClassImportDialog` — 在班級管理頁右上「📥 多班一次匯入」。

**Excel 格式：**
- 一個檔案，多個工作表
- 工作表名稱 = 班級名稱（如「203」「208」「301」）
- 每張工作表第一列：座號 | 姓名 | 備註

**自動處理：**
- 從工作表名第一個數字推算年級（203→2、101→1）
- 已存在同名班級 → 預設「更新」
- 不存在 → 預設「將新建」（同時建立第一次段考 + 6 組）

預覽表可手動調整年級 / 學期 / 動作（建立 / 更新 / 略過）。

### 12.3 段考期小組加分表（Excel 匯出）

`exportWeeklyGroupSheet` 在 `excelExport.ts`。每組一張工作表：

```
標題：第 N 次段考  X 年 Y 班  小組加分表  （第 N 組）

職稱     │ 組長 │ 助教 │ 員A │ 員B │ 員C │ 員D │ 每週小計 │ 每週名次
姓名     │ 王X │ 李X │ ... │     │     │     │          │
個人標準 │ 70  │ 65  │ 60  │ ... │     │     │          │
第1週    │ +30 │ +20 │ ... │     │     │     │   +X     │  Y
...
小計     │  總 │  總 │  總 │     │     │     │   累計    │
```

- 週次自動依「最近 N 週」（週一到週日）切分
- 每週名次：分數低者排第 1（依老師需求）
- 紅字標題、儲存格邊框、配色都用 ExcelJS 寫入

### 12.4 加分明細表

逐筆列出 `ScoreEvent`：時間 / 座號 / 姓名 / 類型 / 分數 / 備註。
正分綠字、負分紅字。可選範圍：本段考期 or 全期間。

---

## 13. 全域狀態管理 (Zustand)

### 13.1 useAppStore（持久化）

| 欄位 | 持久化 | 說明 |
|------|--------|------|
| `currentClassId` | ✅ | 目前選中的班級 |
| `currentExamPeriodId` | ✅ | 目前段考期 |
| `isMuted` | ✅ | 全域靜音 |
| `currentSessionId` | ❌ | 本節課（重啟歸零） |
| `currentPage` | ❌ | 主控台目前頁面 |

切換班級時：清空 `currentSessionId`；不清空 `currentExamPeriodId`（避免引發 PeriodSwitcher 與 DrawerPage 兩個 useEffect 互相觸發無限迴圈）。

### 13.2 useAuthStore（瞬時，v0.4 新增）

| 欄位 | 說明 |
|------|------|
| `isAuthed` | 是否通過密碼驗證 |
| `failedAttempts` | 連續錯次 |
| `lockedUntil` | 暫時鎖死到此 timestamp |

不持久化 → 重啟 App 必重新解鎖。

### 13.3 useScoringStore（瞬時）

`wrongCounts`、`streaks`、`drawWeightCounts`、`lastDrawnId` — 全部在重啟時歸零，避免「昨天某學生答錯 3 次，今天還在被加權抽中」。

### 13.4 useTimerStore

倒數計時器：`endAt`、`originalDuration`、`phase`。

### 13.5 useDrawerStore

抽籤器狀態機：`phase`（idle/spinning/result/feedback/classMode/manualPick）、`drawMode`、`drawnId`、`feedback`。

---

## 14. 音效系統

`utils/audio.ts` 用原生 Web Audio API 程式產生音效，**沒有外部音檔**：

| 函式 | 用途 |
|------|------|
| `playTimerWarning()` | 倒數最後 5 秒嗶聲 |
| `playTimerEnd()` | 結束叮咚 |
| `playCorrect()` | 答對歡呼 |
| `playWrong()` | 答錯低音 |
| `playDrawTick()` | 輪盤滴答 |
| `playDrawStop()` | 輪盤停止鈴鐺 |

**`primeAudio()`**：第一次點擊任何音效相關按鈕時呼叫，繞過瀏覽器 autoplay policy。

---

## 15. 關鍵設計決策

### 15.1 為什麼用 IndexedDB 而非 localStorage？

- localStorage 5MB 上限，加分事件量大會爆
- IndexedDB 支援索引 + 範圍查詢
- Dexie 的 `useLiveQuery` 是反應式的，UI 自動同步

### 15.2 為什麼單一 BrowserWindow 而非多視窗？

- 狀態共享簡單（Zustand）
- 切換模式不必同步多個 process
- 計時器可以在背景持續跑

### 15.3 為什麼建立班級不自動切換？

早期版本建立完新班級就 `setCurrentClass(cls.id)`，造成老師建立 208 班時，學生與分組頁突然顯示「208 共 0 人」，誤以為剛匯入的 203 學生資料消失。
**修正後：** 建立完只顯示 toast 提示，要切換用班級卡片上的「📌 切換」按鈕或標題列下拉選單。

### 15.4 為什麼 Group 綁定 ExamPeriod？

老師需求：每次段考重新分組。如果 Group 屬於 Class（沒綁段考期），歷史分組資訊會被新分組覆蓋。
綁到 ExamPeriod 後，每期有獨立 N 組，歷史分組永久保留。

### 15.5 為什麼 ScoreEvent 同時存 groupId 與 examPeriodId？

- `groupId` 用於組別總分計算（不依賴 Student.groupId）
- `examPeriodId` 用於依段考期過濾事件
- 兩者皆儲存「事件當下」的快照

### 15.6 為什麼 getConfig 要做深度合併？

老師資料庫裡的 config 可能是早期版本，缺少新加的欄位（如 `quizRules`、`examRule`、`passwordHash`）。直接讀這些欄位會 crash 到全白頁面。
`getConfig()` 加入「自我修復」：每次讀取都和最新 DEFAULT 深度合併，補齊缺欄位後寫回 DB。

### 15.7 為什麼教室與實驗桌座位獨立？

老師反映：實驗課的分組考量（安全、實驗器材分配）和一般上課（討論、能力均衡）不同。如果共用同一套 `groupId/role`，老師每次切實驗課就要重新拖曳。
新增 `Student.labGroupId/labRole` 獨立欄位，加上「首次分組自動鏡射 + 之後完全獨立」的 UX，最佳化兩種場景。

### 15.8 為什麼跨組拖曳完整對換（包含組別）？

老師反映：「我想把 1 組組長和 5 組組員 C 對調」這種跨組互換很常見（例如想分散能力）。早期版本只支援同組互換，老師得拆成兩步：先解除分組、再重新指派。
現在 `makeSwapHandler` 把 DndContext 提到 layout 最外層，所有座位在同一個拖曳上下文中可互相拖放，跨組拖曳會把兩位學生的 `groupId+role` 同時對換。

### 15.9 為什麼考試成績要分「儲存草稿」與「套用加分」？

老師反映：輸入考試成績是漸進的（一邊改、一邊看其他人），中途不希望立刻影響加分總覽。分兩階段：
- 草稿期間（appliedAt=null）：成績只在 ExamScore 表，不寫 ScoreEvent
- 套用後（appliedAt=now）：產生 ScoreEvent，加分總覽即時反映；ExamScoreDialog 鎖定欄位防誤改
- 想改 → 「撤銷加分」清掉 ScoreEvent，回到草稿狀態

---

## 16. Schema 升級與資料遷移

### 16.1 v1 → v2 (2026-05-07)

**新增：**
- `Group.examPeriodId`（必填）
- `ScoreEvent.examPeriodId`（必填）
- `ExamPeriod.name`（必填）
- 索引 `groups.[classId+examPeriodId]`、`scoreEvents.[classId+examPeriodId]`

**自動遷移：** Dexie `upgrade` 中對每個現有班級自動建立「第一次段考」，把無 examPeriodId 的小組與加分事件歸入此期。

### 16.2 v2 → v3 (2026-05-08)

**新增：**
- `exams` 表（考試元資料）
- `Student.labGroupId / labRole`（不需 schema migration，新增非索引欄位）
- `ScoreEvent.meta.examId / examName`（同上）
- `ConfigDoc.prefs.passwordHash / passwordHint / autoLockMinutes`（同上）

**重設：**
- `examScores` 表結構大幅變更（從 examName-based 改為 examId-based），舊資料因該功能未實作，直接 `tx.table('examScores').clear()`

---

## 17. 已修正的重大問題

| # | 問題 | 原因 | 修正 |
|---|------|------|------|
| 1 | 切換懸浮模式高度卡死 | Windows `setSize()` 只改寬不改高 | 改用 `setBounds()` + 預先 `setMinimumSize(0,0)` |
| 2 | DevTools 自動彈出 | 開發時忘了關 `openDevTools()` | 移除自動呼叫，改 Ctrl+Shift+I 手動開 |
| 3 | 建立第二個班級「資料消失」 | 自動切到新班，舊班學生沒消失只是看不到 | 不再自動切換 + 班級卡片高亮目前班級 + 切換按鈕 |
| 4 | 加分規則 / 讚美鼓勵頁全白 | 舊 config 缺新欄位，render 時 TypeError | `getConfig` 深度合併補齊欄位 + try-catch |
| 5 | StudentRow `groupId` 跨段考期失效 | 學生 groupId 指向上期的組 | dropdown 只列當期組，不在當期就顯示「未分組」 |
| 6 | 抽籤器無限渲染（Maximum update depth） | `useRoulette.cancel` 每渲染都新 ref → useEffect cleanup → setHighlight | useRoulette 改用 useRef 暫存 opts，cancel useCallback 改空依賴；移除 `setCurrentClass` 自動清空 examPeriodId |
| 7 | 抽籤器答對/答錯按鈕沒反應 | DrawerPage 外層 `drag-region` 吃掉子元素 click | DrawResultModal / FeedbackOverlay / ClassAnswerMode 加 `no-drag` |
| 8 | electron-builder 解 winCodeSign 失敗（symlink） | Windows 一般使用者無權建 symbolic link | 預先用 `7za -snl-` 解壓到 cache 目錄 `winCodeSign-2.6.0/`，繞過 electron-builder 的解壓步驟 |
| 9 | 抽籤器空白畫面 | Maximum update depth（同 #6 子問題） | 已歸入 #6 |
| 10 | iPad/iOS Safari「教室列數」只能輸入特定值 | `<input type="number">` + min/max 在 iOS 有歷史 bug，會在打字過程拒絕某些數字 | ClassesPage、StudentsPage 改用 `type="text"` + `inputMode="numeric"` + `pattern="[0-9]*"` + 手動 onChange 過濾與 clamp，iOS 顯示純數字鍵盤且可正常輸入 |
| 11 | 雲端登入「Failed to fetch」 | `index.html` 的 CSP `default-src 'self'` 擋掉所有外部連線，Supabase 請求被封 | CSP 加 `connect-src 'self' https://*.supabase.co wss://*.supabase.co`（改 CSP meta 後 dev 須完整重啟，HMR 不更新 meta） |
| 12 | 雲端上傳「Could not find size_bytes / schema_version not-null」 | Supabase `user_backups` 表欄位與 upsert payload 不一致 | upsert 帶齊 `user_id/data/schema_version/size_bytes/updated_at`；缺欄位用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 補 |
| 13 | 在 203 電腦上傳雲端，208 備份被清空 | 舊版整庫一包存雲端一列，上傳即整列覆蓋；該電腦無 208 資料 | 改「每班一筆」`user_class_backups`，上傳/下載皆以 class 為粒度（見第 20 章） |
| 14 | 鎖屏時無邊框視窗關不掉 | 鎖屏覆蓋 TitleBar，無視窗控制鈕 | `LockScreen` 加 `LockWindowControls`（最小化/關閉，Electron-only） |

---

## 18. 打包與部署

### 18.1 桌面版 .exe 打包

```bash
# 一次性安裝
npm install --save-dev electron-builder

# 每次打包
npm run package    # 產出 portable + NSIS 兩個 .exe
```

產物在 `release/`：
- `班級助手_v2.0.0_portable.exe` — 71MB，雙擊即跑、免安裝（適合隨身碟）
- `班級助手_v2.0.0_setup.exe` — 71MB，NSIS 安裝程式（給其他老師正式安裝）
- `win-unpacked/` — 解壓的 App 資料夾（299MB）

### 18.2 winCodeSign symlink 問題（Windows 不允許 symlink）

如果第一次跑 `npm run package` 失敗，錯誤訊息含 `Cannot create symbolic link` 與 `libcrypto.dylib`：

```bash
# 找出 cache 目錄
ls C:/Users/$USER/AppData/Local/electron-builder/Cache/winCodeSign/

# 對任一個 .7z（或最新一個）手動用 -snl- 解壓到對應名稱
7za x winCodeSign-2.6.0.7z -owinCodeSign-2.6.0 -snl-

# 然後重跑
npm run package
```

詳見「17. 已修正的重大問題」#8。

### 18.3 PWA 網頁版部署（Cloudflare Workers Static Assets，已上線）

**線上網址**：https://classroom-assistant.spmspm5566.workers.dev

#### 一次性設定

1. GitHub 建 repo `classroom-assistant`
2. 本機 `git init && git remote add origin <URL> && git push -u origin main`
3. Cloudflare → Workers & Pages → Create application → Continue with GitHub → 選 repo
4. 「Set up your application」填：
   ```
   Project name:    classroom-assistant
   Build command:   npm run build:web
   Deploy command:  npx wrangler deploy   ← 預設
   ```
5. 點 Deploy，Cloudflare 跑 `npm install` → `npm run build:web` → `wrangler deploy`，
   讀 `wrangler.toml` 把 `dist-web/` 上傳為 Static Assets
6. 拿到 `*.workers.dev` 網址

#### `wrangler.toml` 設定

```toml
name = "classroom-assistant"
compatibility_date = "2024-09-23"

[assets]
directory = "./dist-web"
not_found_handling = "single-page-application"   # 404 → index.html
```

> 💡 Cloudflare 已把 Pages 整合進 Workers + Static Assets，新專案走 Workers 流程，
> 結果相同（拿到 `*.workers.dev` 或 `*.pages.dev` 網址）。

#### 後續更新

```bash
git add . && git commit -m "更新訊息" && git push
```

Cloudflare 自動偵測 push → 重新 build & deploy，1-2 分鐘後 iPad PWA 重整就拿到新版。

#### iPad 安裝為 PWA

iPad 用 **Safari**（不能用 Chrome）打開上述網址 → 分享按鈕 → **「加到主畫面」**
→ 主畫面出現「班級助手」App 圖示，點下去全螢幕，跟原生 App 一樣。

### 18.4 其他 PWA 部署選項

如不想用 Cloudflare：
- **GitHub Pages**：免費，但要設 `base` 在 `vite.web.config.ts`
- **本機 file://** 雙擊 `dist-web/index.html`（功能略受限）

詳見 [DEPLOY.md](./DEPLOY.md)。

---

## 19. 未完成功能與後續路線

### 19.1 待實作

- [x] ~~**JSON 備份/還原**~~：已完成，見 `utils/backup.ts` + `BackupSection`（full/roster/scoring 三範圍）
- [x] ~~**雲端備份**~~：已完成，見第 20 章（Supabase 加密備份，非即時同步）
- [ ] **座位表編排頁**：`Student.position` 已有資料模型，UI 還沒做（拖曳座位、自動排座）
- [ ] **段考期管理頁**：目前只能透過 PeriodSwitcher 建立段考期，缺刪除/重新命名 UI
- [ ] **複製分組**：建立新段考期時，提供「從上一段考期複製分組」（API 已寫，UI 還沒接）
- [ ] **加分撤銷單筆**：加分總覽列上加 ✕ 撤銷按鈕（API 已寫 `undoLastSessionEvent`）
- [ ] **雲端即時同步**：目前是手動「上傳/下載」最小備份，未做多裝置即時同步（刻意，個人用足夠）

### 19.2 改進方向

- [ ] **快捷鍵系統**：`Ctrl+1/2/3` 切換工具、`Space` 抽籤、`Enter` 答對等
- [ ] **效能**：當 ScoreEvent 達數萬筆，`useStudentScores` 全表掃描可能變慢，考慮加快取或彙總表
- [ ] **暗色主題**：Tailwind 已有 dark variant，老師反映晚自習太亮
- [ ] **EV Code Signing**：消除 Windows SmartScreen 警告（一年 ~$300 USD）

### 19.3 不在範圍

- 多老師帳號（單機個人工具設計）
- 行動端原生 App（用 PWA 即可）
- 即時雲端共編（不在課堂工具情境內）

---

## 20. 雲端備份（跨電腦／跨教室）

v0.5 新增。解決「學校 C 槽每次開機還原、會換電腦／教室 → 本機資料會不見」。

### 20.1 設計決策（老師選定）

| 問題 | 決定 |
|------|------|
| 上傳方式 | **加密上傳**（學生姓名等以密文儲存，非匿名化） |
| 使用範圍 | 單一老師個人用（非多帳號共編） |
| 開發路徑 | **最小雲端備份**（手動上傳/下載，非即時同步） |
| 預算 | 免費（Supabase free tier） |

### 20.2 架構（v0.5.1：改為「每班一筆」）

> **為什麼改：** 老師在不同教室電腦操作不同班級，每台只有該班資料。
> 舊版「整庫一包存雲端一列」→ 203 電腦上傳會把雲端 208 整個蓋掉（203 電腦上 208 是空的）。
> 改成**每班一筆**後：上傳只動所選班、下載只覆蓋所選班，互不干擾。

- **後端：** Supabase（PostgreSQL + Auth + RLS），免費 tier
  - 專案 URL：`https://nmmfazqbyknitoisqrkt.supabase.co`
  - publishable key 寫死於 `lib/supabaseClient.ts`（**非** service role，可安全進版控）
- **資料表 `user_class_backups`**（主鍵 `(user_id, class_id)`，**每班一列**，
  upsert `onConflict: 'user_id,class_id'`）：

  | 欄位 | 型別 | 說明 |
  |------|------|------|
  | `user_id` | uuid | = `auth.uid()` |
  | `class_id` | text | 班級 nanoid |
  | `class_name` | text | 班名（清單顯示用，未加密） |
  | `data` | jsonb | `{ cipher: "<base64 密文>" }`（該班完整資料包） |
  | `schema_version` | int | 對應 Dexie schema（目前 3），NOT NULL |
  | `size_bytes` | bigint | 密文大小 |
  | `updated_at` | timestamptz | 最後上傳時間 |

  4 條 RLS policy：本人才能 select / insert / update / delete 自己的列。

- **每班資料包內容**：該 `Class` + 其 `students / groups / examPeriods /
  exams / examScores / scoreEvents / sessions`。
  **不含**全域設定（`config`：規則/語料庫/密碼）——那屬全域，需要時用「完整 JSON 備份」。
- **舊表 `user_backups`**（整庫一包）已停用，保留無害，不再讀寫。

#### 主要 API（`utils/cloudBackup.ts`）

| 函式 | 作用 |
|------|------|
| `listLocalClasses()` | 本機班級清單（含學生數），上傳選單用 |
| `listCloudClasses()` | 雲端班級清單（class_name + 時間 + 大小），不解密，下載選單用 |
| `uploadClasses(ids, pass)` | 逐班蒐集→加密→upsert；回傳成功/失敗清單 |
| `downloadClasses(ids, pass)` | 逐班取回→解密→**只清該班本機資料再 bulkPut**，其他班保留 |

UI：`BackupSection` 的 `CloudBackupCard` →「上傳班級…/下載班級…」開
`ClassSelectDialog`（checkbox + 全選，顯示筆數/時間）。

### 20.3 加密機制

- 每班資料包 JSON → `JSON.stringify` → **AES-GCM** 加密 → base64 → 上傳
- 金鑰：雲端帳號密碼經 **PBKDF2**（10 萬次，salt `classroom-assistant-cloud-salt-v1`）衍生
- IV 隨機 12 bytes，串在密文前
- 雲端只看得到密文。**忘記密碼 = 雲端那份永遠解不開（刻意設計）**

### 20.4 通行碼（passphrase）

- 通行碼 = 雲端帳號登入密碼
- 登入/註冊成功時暫存 `useCloudAuthStore.passphrase`（**僅記憶體，不持久化、不寫任何地方**）
- 重整／重開 App 後為 null → 上傳/下載時用 `window.prompt` 補問一次
- `signOut` 會清掉

### 20.5 雲端帳號 ≠ 本機鎖屏密碼

兩套完全獨立：

| | 用途 | 存哪 |
|---|---|---|
| 本機鎖屏密碼（`useAuthStore`） | 開 App 解鎖 | 本機 IndexedDB（SHA-256） |
| 雲端帳號密碼（`useCloudAuthStore`） | 跨電腦備份 + 加解密金鑰 | Supabase Auth |

### 20.6 相關檔案

| 檔案 | 職責 |
|------|------|
| `lib/supabaseClient.ts` | Supabase client（URL + publishable key） |
| `store/useCloudAuthStore.ts` | 登入狀態 + 記憶體 passphrase |
| `utils/cloudBackup.ts` | `listLocalClasses` / `listCloudClasses` / `uploadClasses` / `downloadClasses` |
| `components/cloud/LoginDialog.tsx` | 登入/註冊 UI（英文錯誤訊息中文化） |
| `components/rules/BackupSection.tsx` | `CloudBackupCard` + `ClassSelectDialog`（選班上傳/下載） |
| `components/LockScreen.tsx` | 含 `LockWindowControls`（鎖屏時的最小化/關閉，Electron-only） |

入口：**加分規則 → 資料備份／還原 → ☁️ 雲端備份卡片**。

### 20.7 Supabase 一次性設定（已完成，紀錄備查）

1. 建表 `user_class_backups` + 4 條 RLS（SQL Editor）：

   ```sql
   create table if not exists user_class_backups (
     user_id        uuid not null references auth.users(id) on delete cascade,
     class_id       text not null,
     class_name     text,
     data           jsonb not null,
     schema_version int  not null,
     size_bytes     bigint,
     updated_at     timestamptz not null default now(),
     primary key (user_id, class_id)
   );
   alter table user_class_backups enable row level security;
   create policy "own_select" on user_class_backups for select using (auth.uid() = user_id);
   create policy "own_insert" on user_class_backups for insert with check (auth.uid() = user_id);
   create policy "own_update" on user_class_backups for update using (auth.uid() = user_id);
   create policy "own_delete" on user_class_backups for delete using (auth.uid() = user_id);
   ```
2. **Authentication → 關閉 Confirm email**（個人用免收驗證信）
3. `index.html` CSP 須含 `connect-src ... https://*.supabase.co wss://*.supabase.co`（見問題 #11）

### 20.8 換電腦／換教室流程（每班獨立）

- **上傳**：在某台電腦 → 加分規則 → 資料備份 → ☁️ 雲端備份 →「上傳班級…」→ 勾這台有的班 → 只更新雲端那幾班。
- **下載**：新電腦/教室 → 同帳號登入 →「下載班級…」→ 勾要的班 → 只把那幾班合併進本機，**本機其他班保留**。
- 不同教室電腦各管各的班，彼此上傳互不覆蓋。

---

## 附錄 A：本機開發

```bash
cd C:\Users\spmsp\Desktop\ClassroomAssistant
npm install

# 桌面版（含 Electron）
npm run dev            # Vite HMR + Electron
npm run build          # 編譯 main + preload + renderer
npm run package        # 打包成 portable.exe + setup.exe

# 網頁版（PWA）
npm run dev:web        # http://localhost:5174
npm run build:web      # 打包到 dist-web/
npm run preview:web    # 預覽打包成果

npm run typecheck      # 型別檢查
```

需要除錯時，在應用程式視窗按 `Ctrl+Shift+I` 開啟 DevTools；
網頁版用瀏覽器 F12 即可。

部署到 Cloudflare Pages、GitHub Pages 或打包 .exe 的詳細步驟見 [DEPLOY.md](./DEPLOY.md)。

## 附錄 B：常用查詢索引

| 查詢 | 索引 |
|------|------|
| 某班全部學生（座號排序） | `students` `[classId+seatNo]` |
| 某班某段考期所有事件 | `scoreEvents` `[classId+examPeriodId]` |
| 某班某時段事件 | `scoreEvents` `[classId+timestamp]` |
| 某段考期的小組 | `groups` `[classId+examPeriodId]` |
| 某段考期某類型考試 | `exams` `[classId+examPeriodId+type]` |
| 某考試的所有學生分數 | `examScores` `[examId+studentId]` |

## 附錄 C：快速開發提示詞

Claude Code 在 ClassroomAssistant 目錄啟動時會**自動載入此 CLAUDE.md**作為 project memory，無需手動讀取。

開新對話時直接說：

```
繼續開發：[一句話描述目標]
```

Claude 即可掌握架構、資料模型、設計決策、踩過的坑，不必重新解釋。

更新本檔的時機：
- 新增資料表或 schema 升版 → 更新第 4、16 章
- 完成路線圖項目 → 把 19.1 的 todo 移到 17（已修正）或刪除
- 做出重要架構決策 → 補到第 15 章「為什麼」
