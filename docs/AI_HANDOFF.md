# 方糖民宿 AI CFO／營運工作台 — AI 開發交接文件

更新日期：2026-08-13（Asia/Taipei）  
用途：提供下一個 AI 或工程師直接接手開發的單一入口。

## 1. 專案定位

本專案是方糖民宿的營運工作台，現階段優先支援接待、訂單、早餐與備料；財務模組規劃為獨立的手機友善介面，避免接待人員與財務人員在同一頁看到過多功能。

正式網站：https://fangtang-mobile-reception.dk8515.chatgpt.site  
Sites project id：由 .openai/hosting.json 讀取，勿自行改寫。

## 2. 目前已完成

- 訂單週／月曆與自訂期間查詢。
- 訂單匯入：Gmail OwlTing 郵件解析、OwlNest CSV 核對、本機 Playwright Agent。
- 新訂單頁：近 7 天、依匯入時間倒序、未讀數字徽章、點擊即已讀、全部標示已讀。
- 接待流程：實際入住人數、身分證雜湊／末四碼、訂金與尾款、付款方式、早餐時間／人數／餐點、備註與稽核紀錄。
- 基礎資料：房型／房號、餐點、早餐時段、付款方式、訂單來源、排程服務設定。
- 備料：按日期區間彙總人數；目前只輸出人數，食材用量待配方確認。
- 首頁資料與月曆已採快取策略，寫入後會失效。
- 目前正式部署版本：Version 29（以 Sites 版本記錄為準）。

## 3. 主要技術

- Next/vinext + React + TypeScript。
- Cloudflare Sites／D1；Drizzle ORM。
- Node.js >= 22.13。
- OwlNest Agent 使用 Playwright；登入、下載與查詢必須維持唯讀，不繞過 2FA、CAPTCHA 或權限。

常用指令：

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm db:generate
```

## 4. 重要目錄

| 路徑 | 用途 |
|---|---|
| app/page.tsx | 工作台主畫面、導航、月曆、接待、新訂 |
| app/globals.css | 全域與手機／橫向模式樣式 |
| app/api/ | 訂單、接待、備料、設定、匯入與新訂 API |
| db/schema.ts | D1／Drizzle 資料模型 |
| lib/order-query.ts | 訂單查詢與資料整形 |
| lib/prep-query.ts | 早餐與備料彙總 |
| lib/home-page-cache.ts | 首頁快取與失效 |
| lib/import-orders.ts | 匯入、去重與更新規則 |
| scripts/owlnest-daily-reconcile.mjs | 本機 OwlNest 自動核對 Agent |
| drizzle/ | 已產生的資料庫 migration |
| tests/ | parser、渲染與功能測試 |
| .openai/hosting.json | Sites project／D1 設定，不要改 project id |

## 5. 資料模型重點

核心表：reservations、reservation_events、payments、reception_checklists、meal_requirements、meals、meal_prep_items、audit_log、setting_options、automation_jobs、order_reconciliation_runs。

reservations 重要欄位：

- sourceSystem／sourceChannel：來源與通路。
- otaExternalId：外部訂單編號。
- arrivalDate／departureDate：入住區間。
- adults／children／infants：訂單人數；缺少資料不得假設為真實 1 人。
- totalAmount／receivedAmount／balanceAmount：總額、已收、餘額。
- readAt：新訂單未讀狀態；近 7 天且為 null 代表未讀。

資料庫變更後必須產生 migration，不可只修改 TypeScript schema。

## 6. 財務模組方向（尚未完成）

財務人員與接待人員不同，請規劃獨立入口／PWA，先做離線優先的手機費用輸入：

```
手機財務 PWA → 本機 SQLite／IndexedDB → 待同步佇列 → 財務 API → D1
```

第一版範圍：費用日期、科目大類／細項、金額、付款方式、供應商、備註、收據照片、同步狀態。後續再做收入、成本明細下鑽、月損益、現金流、年度報表、年繳費用攤提、貸款本金／利息與固定資產。

請勿把財務功能直接塞入接待首頁；共用後端資料，但前端入口與權限分開。

## 7. 尚未完成的優先事項

### P0：營運穩定

1. 多房訂單正式改為一對多房間關聯。
2. OwlNest 缺少人數時顯示「待核對」，不得顯示推定 1 人。
3. OwlNest 每日排程連續驗收 7 天，正常不通知、異常才通知。
4. 完成管理者／接待人員的功能與資料權限限制。

### P1：來訪模組

1. 建立來訪事件、媒體、狀態、訂單綁定資料表。
2. 監控端上傳 GIF／代表截圖到工作台。
3. 接待手機頁可綁定訂單、標記非住客／忽略、重試失敗上傳。
4. 不做人臉辨識、不自動判定房客身分。

### P2：財務核心

1. 財務科目與單一交易表。
2. 手機離線費用輸入與自動同步。
3. 成本明細下鑽、月損益、現金流、年度財報。
4. 年繳費用按月攤提；貸款本金與利息分離。
5. 會計匯出與月結／更正流程。

## 8. 重要業務規則

- PMS／OwlNest 決定訂金比例與付款原則；本系統只接收資料。
- 線上訂金與現場尾款要分開記錄；未輸入尾款時可產生待人工確認，不可直接當作會計實收。
- 取消訂單不可只依匯出缺少判定，必須有來源狀態或人工確認。
- 訂單修改、入住、付款、餐點與人數更正都要留下 audit log。
- 身分證不保存明文，只保存雜湊與末四碼。
- 食材用量與採購量在配方確認前不可假造精準數字。
- ADR／RevPAR／入住率需有可靠每日入住資料或 PMS 串接後才啟用。

## 9. 開發與部署規則

1. 先閱讀本文件、docs/PROJECT_PROGRESS.md、README.md 與相關 API。
2. 修改 schema 時產生 Drizzle migration。
3. 先執行 pnpm test，再執行 pnpm build／pnpm lint。
4. 不讀取、不提交 .env*（範例除外）、token、cookie、登入 session、原始訂單個資與本機照片。
5. Sites 部署必須使用 .openai/hosting.json 的 project id，先推送精確 commit，再 package、save version、deploy、poll status。
6. 不要 force push，也不要刪除使用者未要求刪除的資料。

## 10. 接手後第一個工作

先確認目前 HEAD 與測試：

```bash
git status --short
git log -5 --oneline
pnpm test
```

接著以「財務手機 PWA 費用輸入」建立設計文件與資料模型，不要直接改接待首頁。完成資料模型與 API 規格後，再實作離線儲存、同步佇列與權限。

## 11. 機密與資料安全

本交接包只包含程式與非機密文件。下列檔案／資料不可打包或提交：.env*（範例除外）、OAuth／Gmail token、Playwright session、Cloudflare／Sites 憑證、原始 Gmail、原始 OwlNest CSV、身分證明文、私人照片與影片。

