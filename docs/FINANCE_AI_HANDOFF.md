# 方糖民宿 Finance 模組 AI 接手文件

更新日期：2026-08-14（Asia/Taipei）

本文件只描述 Finance（支出記帳）模組，不包含接待、訂單、備料與其他營運功能。下一個 AI 應先閱讀本文件，再修改 `app/finance/`、Finance API、資料庫與相關樣式。

## 1. 模組目標

Finance 是財務人員使用的手機友善支出記帳介面。第一版不處理收入，核心原則是：

- 輸入快速、欄位少、日期預設今日。
- 可離線先儲存，恢復網路後背景同步。
- 支出必須同時保存「大類」與「費用細項」，讓後續能分析例如食材細項成本。
- 財務頁面與接待工作台概念分離，但後端共用既有 D1。

## 2. 目前線上入口與版本

- 線上入口：<https://fangtang-mobile-reception.dk8515.chatgpt.site/finance>
- Sites project id：讀取 `.openai/hosting.json`，不可自行更換。
- 最新 Finance 變更 commit：`0b836bb Add finance navigation tabs`
- 最新成功部署為 Sites Version 35（部署日期 2026-08-13）。
- 目前共用 D1 綁定名稱：`DB`。

## 3. 目前程式檔案

| 檔案 | 職責 |
|---|---|
| `app/finance/page.tsx` | Finance 手機頁、離線狀態、輸入表單、明細與統計計算 |
| `app/api/finance/transactions/route.ts` | Finance 交易 GET/POST API、驗證、去重、audit log |
| `db/schema.ts` | `financialTransactions` 資料表定義 |
| `drizzle/0006_fluffy_jazinda.sql` | Finance 初始 migration |
| `app/globals.css` | `.finance-*` 手機樣式與三個標籤樣式 |
| `public/finance-manifest.webmanifest` | Finance PWA manifest |
| `tests/` | 目前專案整體測試；Finance 專用測試尚待補強 |

## 4. UI 現況

使用者指定以參考記帳 App 左側畫面為主：按日期分組、每日總額、支出細項與大按鈕新增。現況 UI 包含：

### 標籤列

頁面頂端有三個標籤：

1. **新增支出**：預設 active；按鈕會將新增支出表單保留在頁面中。
2. **支出明細**：目前按下後會以平滑捲動移動到 `.finance-ledger`，尚非真正路由或條件渲染標籤。
3. **統計分析**：目前按下後會捲動到第一個 `.finance-query`，尚非真正獨立頁面。

> 重要：`activeTab` state 已存在，但目前標籤按鈕仍以 scroll 為主，ledger、summary、query、form 仍同時 render。若要達到真正多頁標籤，下一步應改為條件渲染或 CSS 隱藏，並讓 active 狀態可切換。

### 新增支出

目前欄位：

- 費用類別：預設「食材」；預設類別為人事、房務、食材、公共營運、行銷平台、訂閱服務、貸款、其他。
- 新增類別：輸入文字後按「新增類別」。目前只存在 React state，尚未寫入後端或獨立 localStorage。
- 費用細項：必填，例如雞蛋、洗衣、電費。
- 金額：必填，正數。
- 「更多資訊（選填）」：日期、付款方式、供應商、備註、收據照片檔名。
- 日期預設台北今日；付款方式預設現金。
- 儲存後先寫入 localStorage，再進背景同步佇列。

### 支出明細

- 以 `summaryMonth` 過濾月份。
- 以日期分組，依日期新到舊排列。
- 每日卡片顯示日期與每日總額。
- 每筆顯示類別首字圓形標籤、費用細項、類別／供應商與金額。
- 尚無資料時顯示「本月尚無支出」。

### 統計分析

- 月結總結：當月總支出、交易筆數、主要類別與主要細項提示。
- 自訂日期區間與類別查詢。
- 大類明細與細項成本排行。
- 目前的 AI 文字只是規則式提示，尚未呼叫 AI API。

## 5. 前端資料與離線同步

`app/finance/page.tsx` 使用：

```text
localStorage key: fangtang-finance-expenses-v1
```

本機 `Expense` 型別欄位：

```text
id, transactionDate, category, item, amount,
paymentMethod, vendor, note, receiptFileName,
syncClientId, synced
```

流程：

1. 頁面載入：讀 localStorage。
2. 有網路：POST 所有 `synced === false` 的資料。
3. 成功後將該筆標為 synced 並重新保存 localStorage。
4. GET `/api/finance/transactions` 取得雲端資料，依 `syncClientId` 合併。
5. `online`／`offline` 事件會更新狀態並重試同步。
6. 使用者新增支出時立即更新畫面，不等待網路。

目前限制：

- 收據只保存檔名，尚未上傳圖片至 R2 或其他檔案儲存。
- 沒有同步失敗重試次數、錯誤明細與手動重試按鈕。
- localStorage 不適合大量資料；後續 PWA 應改 IndexedDB。
- 類別自訂資料尚未跨裝置同步。

## 6. API 規格

### GET `/api/finance/transactions`

Query parameters：

- `from=YYYY-MM-DD`（選填）
- `to=YYYY-MM-DD`（選填）

回傳最多 500 筆，依 `transactionDate DESC`、`createdAt DESC` 排序。

### POST `/api/finance/transactions`

必要欄位：

- `transactionDate`：ISO 日期。
- `category`：非空字串。
- `item`：非空字串。
- `amount`：正數。
- `syncClientId`：裝置同步識別碼。

選填欄位：`paymentMethod`、`vendor`、`note`、`receiptFileName`、`source`、`direction`。

同一 `syncClientId` 已存在時回傳 duplicate，不重複寫入。

每筆成功建立會寫入 `audit_log`，action 為 `financial_transaction.created`。

## 7. 資料表

`financial_transactions` 目前核心欄位：

```text
id
transaction_date
direction            -- 現階段預設 expense；不要在 UI 加收入
category
item
amount
payment_method
vendor
note
receipt_file_name
source
sync_client_id       -- unique，用於離線去重
created_by
created_at
```

既有 index：交易日期、類別；`sync_client_id` 有 unique index。

## 8. 目前已驗證

最近一次 `pnpm test` 通過，整體專案測試 31 項皆成功；Finance 目前主要依 build 與整體渲染驗證，應補充：

- 新增支出正確顯示與清空表單。
- 離線新增後恢復網路可同步。
- duplicate `syncClientId` 不重複建立。
- 月份分組與每日總額正確。
- 類別與細項統計正確。
- 標籤切換不會破壞輸入中的表單。

## 9. 下一步建議（依優先順序）

### P0：簡潔輸入體驗

1. 將三個標籤改成真正 activeTab 條件渲染：預設只顯示新增支出。
2. 新增支出只保留類別、細項、金額與儲存；其他欄位放進「更多資訊」。
3. 類別改成可點選的圖示／快速按鈕，同時保留新增類別。
4. 類別清單保存於 localStorage 或後端設定表。

### P1：可靠離線資料

1. localStorage 改 IndexedDB。
2. 建立同步佇列狀態：pending、syncing、synced、failed。
3. 顯示最後同步時間、失敗原因與重新同步按鈕。
4. 收據照片壓縮後背景上傳，交易先保存文字資料。

### P2：財務分析

1. 食材、房務等大類下鑽至細項與供應商。
2. 月結總結與前月比較。
3. AI 分析成本異常與主要細項原因；需先定義 AI 輸入／輸出格式。
4. 年繳費用按月攤提、貸款本金／利息分離、年度報表。

## 10. 開發與部署注意事項

- 只修改 Finance 相關檔案時，不要改接待頁面資料流程。
- Schema 變更必須建立 Drizzle migration。
- 不提交 `.env`、token、cookie、收據原圖或個資。
- 建置指令：`pnpm test`（包含 build 與測試）。若 Node PATH 不完整，使用專案既有 bundled Node PATH。
- Sites 部署必須以 `.openai/hosting.json` 的 project id、目前 HEAD、package archive、save version、deploy、poll status 順序執行。
- Finance 線上 URL：<https://fangtang-mobile-reception.dk8515.chatgpt.site/finance>
