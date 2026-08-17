# 方糖民宿完整資料庫匯出

## 目的

`GET /api/admin/export` 是一次性、受 Token 保護的邏輯備份入口。它會完整讀取目前 Drizzle schema 的資料表，輸出 JSON、各表筆數與 SHA-256 校驗碼；不會刪除或修改舊資料。

此方式比讀取訂單畫面可靠，因為畫面只呈現符合查詢條件的訂單，並不包含設定、付款、入住、備料、財務及操作紀錄。

## 啟用方式

在舊工作台的部署環境新增伺服器端 Secret：

```text
FANGTANG_EXPORT_TOKEN=<一次性隨機長字串>
```

不要把 Token 寫入 Git、前端程式、URL 或聊天訊息。匯出完成後應刪除或輪替此 Secret。

## 匯出方式

在本機執行，Token 只放在環境變數：

```bash
export FANGTANG_EXPORT_TOKEN='由你產生的一次性Token'
curl --fail-with-body --location \
  -H "Authorization: Bearer ${FANGTANG_EXPORT_TOKEN}" \
  -o fangtang-d1-backup.json \
  'https://fangtang-mobile-reception.dk8515.chatgpt.site/api/admin/export'
```

## 匯出後核對

備份檔必須包含以下欄位：

- `format = fangtang-d1-logical-backup`
- `schemaVersion`
- `exportedAt`
- `complete`：是否所有預期資料表都存在
- `missingTables`：舊 schema 尚未建立的資料表；此欄位非空時不可直接視為完整備份
- `counts`：每張表的資料筆數
- `sha256`：對 `{ schemaVersion, missingTables, tables }` 的 canonical JSON 計算的 SHA-256
- `tables`：完整資料表內容

匯入 Cloudflare D1 前，先保存原始 JSON，不要直接覆蓋。匯入程式必須依照外鍵順序、使用 upsert／去重，並在完成後再次輸出 `counts` 與金額總計比對。

## 包含的資料表

`roomTypes`、`rooms`、`reservations`、`reservationEvents`、`payments`、`meals`、`mealVersions`、`mealPrepItems`、`receptionChecklists`、`mealRequirements`、`auditLog`、`settingOptions`、`automationJobs`、`orderReconciliationRuns`、`orderReconciliationItems`、`financialTransactions`、`expenses`、`prepReports`、`prepReportLines`。

## 安全注意事項

- 這是完整備份，包含住客姓名、房號、日期、付款及留言等敏感資料。
- 僅傳送到你自己的舊工作台與 Cloudflare 帳戶。
- 匯出完成後立即輪替／刪除 `FANGTANG_EXPORT_TOKEN`。
- 舊工作台在整個核對完成前保留不變，Cloudflare 僅作為複本。
