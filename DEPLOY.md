# 部署與使用指引

班級助手是「雙軌制」應用：

- 🖥 **Electron 桌面版**：完整功能（懸浮模式、視窗永遠最上層）— 老師自己的電腦
- 🌐 **PWA 網頁版**：跨平台（Windows / Mac / Chromebook / iPad / Android 平板）— 任何裝置

兩個版本**共用同一份程式碼**，由 `utils/platform.ts` 在 runtime 自動偵測環境並切換 UI。

---

## 一、本機開發

```bash
# 桌面版（含 Electron）
npm run dev

# 網頁版（純瀏覽器）
npm run dev:web
# → 自動開 http://localhost:5174
```

---

## 二、桌面版：打包成 .exe 給其他電腦

### 安裝打包工具（一次性）

```bash
npm install --save-dev electron-builder
```

### `package.json` 加入打包設定

在 `package.json` 加：

```json
{
  "build": {
    "appId": "com.spmsp.classroomassistant",
    "productName": "班級助手",
    "directories": {
      "output": "release"
    },
    "win": {
      "target": ["portable", "nsis"],
      "icon": "src/renderer/public/icon.svg"
    },
    "mac": { "target": "dmg" },
    "linux": { "target": "AppImage" }
  },
  "scripts": {
    "package": "electron-vite build && electron-builder"
  }
}
```

### 打包

```bash
npm run package
```

產物會放在 `release/` 資料夾：

- `班級助手_v2.0.0_portable.exe`（portable，雙擊即執行，免安裝，約 72MB）
- `班級助手_v2.0.0_setup.exe`（NSIS 安裝程式，約 72MB）

把 `portable.exe` 放隨身碟就能在任何 Windows 電腦執行。

> ⚠ 若打包報 `Cannot create symbolic link`（Windows 無 symlink 權限），
> 用 `7za x winCodeSign-2.6.0.7z -owinCodeSign-2.6.0 -snl-` 預解壓到
> electron-builder cache 後重跑。詳見 CLAUDE.md 問題 #8。

---

## 三、網頁版：打包並部署 PWA

### 打包

```bash
npm run build:web
```

產物放在 `dist-web/`，是純靜態 HTML/JS/CSS，可放任何 HTTPS 伺服器。

### 部署選項（推薦免費的）

#### 選項 A：Cloudflare Pages（**最推薦**）

1. 把專案推到 GitHub
2. 上 [pages.cloudflare.com](https://pages.cloudflare.com) → Connect to Git
3. Build command：`npm run build:web`
4. Build output：`dist-web`
5. 部署完會給你 `https://classroom-assistant.pages.dev` 之類的網址
6. 老師在任何裝置打開該網址即可使用，可選「加到主畫面」當 PWA

**優點**：免費、無流量限制、自帶 HTTPS、自動部署、全球 CDN

#### 選項 B：GitHub Pages

1. 在 GitHub repo 設定 Actions 自動 build & 推到 `gh-pages` 分支
2. 或手動 `npm run build:web` → 把 `dist-web/` 推到 `gh-pages` 分支
3. 網址：`https://USERNAME.github.io/REPO_NAME/`
4. ⚠ 記得把 `vite.web.config.ts` 的 `base` 改成 `/REPO_NAME/`

#### 選項 C：本機網路（純內網用）

```bash
npm run build:web
npm run preview:web
# → http://localhost:4174
```

老師可在同一個區網內，平板用瀏覽器連 `http://電腦IP:4174` 開來用。
（注意：iOS Safari 要 HTTPS 才能裝 PWA；HTTP 仍可用但無法加到主畫面）

#### 選項 D：file://（極限懶人）

雙擊 `dist-web/index.html` 即可開啟（單一電腦離線使用）。
**限制**：service worker 不能用、`fetch` 受限，IndexedDB 仍可用。

---

## 四、平板上把 PWA 安裝成 App

### iPad / iPhone（Safari）

1. 用 Safari 開啟你部署的網址
2. 下方分享按鈕 → 「加到主畫面」
3. App 圖示出現在主畫面，點開像原生 App，全螢幕、有自己的圖示

### Android（Chrome）

1. 用 Chrome 開啟網址
2. 右上選單 → 「加到主畫面」 / 「安裝應用程式」
3. 啟動器會出現「班級助手」捷徑

### Windows / Mac 桌面（Chrome / Edge）

1. 網址列右側會出現「⊕ 安裝」圖示
2. 點下去 → 桌面建立捷徑、可獨立視窗運行

---

## 五、雙軌制功能差異

| 功能 | 🖥 Electron | 🌐 PWA |
|------|-----------|-------|
| 計時器 | ✅ 獨立小視窗（永遠最上層） | ✅ 全螢幕覆蓋 |
| 抽籤器 | ✅ 獨立小視窗（永遠最上層） | ✅ 全螢幕覆蓋 |
| 加分總覽 | ✅ | ✅ |
| 考試成績 | ✅ | ✅ |
| Excel 匯入 / 匯出 | ✅ | ✅ |
| 班級切換 | ✅ | ✅ |
| 段考期管理 | ✅ | ✅ |
| 音效 | ✅ | ✅ |
| **懸浮模式（小視窗永遠最上層）** | ✅ | ❌ 瀏覽器禁止 |
| **無邊框視窗** | ✅ | ❌ 用瀏覽器原生 |
| 離線使用 | ✅ 完全離線 | ✅ Service Worker 快取 |
| 資料儲存 | IndexedDB | IndexedDB |

---

## 六、跨裝置資料

⚠ 本系統採離線優先設計，**每個裝置／瀏覽器有獨立的 IndexedDB**。
換電腦、換瀏覽器、清除瀏覽器資料都會失去本機資料。以下兩個方案皆**已實作**。

入口都在：**加分規則 → 資料備份／還原**。

### 方案 A：JSON 備份／還原（已實作）✅

匯出整包資料成 `.json` 檔，存到 Google Drive / OneDrive / 隨身碟，換電腦時匯入還原。

三種範圍各自獨立：

| 範圍 | 內容 |
|------|------|
| 📦 完整備份 | 所有資料 + 系統設定（含密碼、規則、語料庫） |
| 👥 學生分組與角色 | 班級、學生、分組、段考期 |
| 📊 加分與考試成績 | 加分事件、考試、分數 |

匯入為「覆蓋」模式（清空對應表再還原），完成後自動 `location.reload()`。
JSON 自帶 schema 版本檢查，擋掉版本不符或他 App 的檔。

### 方案 B：☁️ 雲端備份（已實作，**每班獨立**）✅

登入雲端帳號 →「上傳班級…」勾要傳的班；換電腦登入同帳號 →「下載班級…」勾要的班。

- **每個班級各存一筆**：在某台電腦只上傳那台有的班，**不會蓋掉雲端其他班**；
  下載也只把所選班合併進本機，**本機其他班保留**。多教室電腦各管各班、互不干擾。
- 可選單班 / 部分 / 全選（清單有勾選框 + 全選）
- 後端 Supabase（免費 tier），每班資料 **AES-GCM 加密後才上傳**，雲端只存密文
- 加解密金鑰 = 雲端帳號密碼（**忘記密碼 = 雲端那份解不開**，刻意設計）
- 雲端帳號與本機鎖屏密碼是兩套獨立系統
- 不含全域設定（規則/語料庫/密碼）；要連設定一起搬請用方案 A 完整 JSON
- **非即時同步**：手動按「上傳/下載」，個人使用足夠
- 詳細架構與 Supabase 建表 SQL 見 [CLAUDE.md 第 20 章](./CLAUDE.md#20-雲端備份跨電腦跨教室)

> **建議**：日常用方案 B（雲端，省事）；重大改動前另存一份方案 A 的完整 JSON 當離線保險。

---

## 七、常見問題

### Q: 老師家裡沒網路，PWA 還能用嗎？
A: 可以。第一次連網開過 PWA 後，所有檔案都被 Service Worker 快取下來；之後沒網路打開仍能正常使用，IndexedDB 也是離線資料庫。

### Q: 平板網頁版可以做加分嗎？
A: 可以，所有功能（除懸浮模式外）都和桌面版完全一樣。

### Q: 換新電腦後資料會跟過去嗎？
A: 會。兩種方式（見第六節）：① 雲端備份 — 新電腦登入同一雲端帳號，按「從雲端下載」即整包還原；② JSON 備份 — 舊電腦匯出完整 JSON，新電腦匯入。建議平常用雲端、重大改動前另存 JSON。

### Q: 雲端備份的密碼忘記了怎麼辦？
A: 雲端那份**永遠解不開**（這是刻意的加密設計，連我們也解不開）。所以請務必記住雲端帳號密碼，並養成另存一份 JSON 完整備份的習慣當保險。

### Q: 雲端備份安全嗎？學生姓名會外洩嗎？
A: 上傳前整包資料已用你的密碼 AES-GCM 加密，雲端（Supabase）只看得到密文，看不到任何學生姓名或成績。

### Q: PWA 升級後老師怎麼拿到新版？
A: 自動。Service Worker 偵測到新版會在背景下載，下次重開即生效。

### Q: 學校禁止安裝軟體，可以用嗎？
A: 用 PWA 網頁版即可，**不需安裝**，瀏覽器即用。
