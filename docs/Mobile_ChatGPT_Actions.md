# Mobile ChatGPT Actions

## 1. 決策

方糖民宿目前使用 ChatGPT Plus。近期手機入口採「私人 Custom GPT + Actions」：

- GPT 在 ChatGPT 網頁版建立及維護。
- 經營者在 ChatGPT 手機 App 開啟私人 GPT。
- GPT 以 OpenAPI 定義的 Actions 呼叫方糖民宿 HTTPS API。
- 本機資料庫及 OwlNest 登入資訊不直接提供給 ChatGPT。

此為規劃，尚未建立 GPT 或 Actions API。

## 2. 介面責任

ChatGPT 負責：

- 將自然語言轉為明確查詢或草稿。
- 顯示資料來源時間與完整性。
- 對需要確認的動作呈現摘要。

本機 API 負責：

- 身分驗證、授權、資料篩選及稽核。
- 確定性計算。
- 草稿、確認 token、重複防護及逾時。
- 限制回傳的住客個資。

## 3. 第一批 Actions

| operationId | 權限 | 確認 | 輸出／效果 |
|---|---|---|---|
| `get_today_arrivals` | 管理者 | 否 | 今日入住、資料時間、必要備註 |
| `get_upcoming_meals` | 管理者 | 否 | 用餐時段、人數、去識別化禁忌 |
| `get_operational_status` | 管理者 | 否 | PMS 同步、通知及 Agent 健康 |
| `get_financial_summary` | 財務管理者 | 否 | 期間收入、成本、現金流及來源 |
| `get_cost_details` | 財務管理者 | 否 | 大類、細項、供應商、交易下鑽 |
| `create_purchase_draft` | 管理者 | 否 | 採購草稿與缺漏欄位 |
| `confirm_purchase` | 財務管理者 | 是 | 以草稿 ID 和單次 token 正式寫入 |
| `create_meal_change_draft` | 管理者 | 否 | 用餐異動草稿 |
| `confirm_meal_change` | 管理者 | 是 | 寫入營運需求，不回寫 PMS |
| `get_reception_checklist` | 接待人員 | 否 | 顯示證件、用餐及尾款確認狀態 |
| `complete_reception_draft` | 接待人員 | 否 | 預填訂單餘額並建立接待草稿 |
| `confirm_reception` | 接待人員 | 是 | 確認核驗、用餐及尾款，不回寫 PMS |
| `create_notification_draft` | 管理者 | 否 | LINE 訊息預覽與收件群組 |
| `send_notification` | 管理者 | 是 | 發送已核准草稿 |
| `request_shortcut_action` | 管理者 | 視風險 | 交由規則引擎判斷，不直接操作 HomeKit |

## 4. 草稿／確認協定

1. 使用者提出自然語言要求。
2. GPT 呼叫 `create_*_draft`。
3. API 回傳標準欄位、影響、缺漏、有效期限及 `draft_id`。
4. GPT 清楚顯示「尚未執行」。
5. 使用者明確確認。
6. GPT 呼叫 `confirm_*`，帶入 `draft_id` 與單次確認 token。
7. API 檢查擁有者、內容雜湊、期限及是否已執行。
8. 回傳成功、拒絕或需人工處理，並建立 audit log。

確認不得只依模糊的「好」「可以」跨越多個待確認草稿。

## 5. 安全與隱私

- GPT 設為私人，不公開到 GPT Store。
- Actions API 僅暴露必要 operation，不提供任意 SQL、URL 或 Shortcut 名稱。
- 每個回應包含 `data_as_of`、`completeness` 及 `source`.
- 不回傳電話、Email、證件、付款卡號、PMS Cookie 或密碼。
- 飲食禁忌只回傳執行工作必要資訊，避免附完整住客身分。
- 證件確認只傳送是否完成及證件類型，不傳身分證號碼或照片。
- 金鑰存本機秘密管理，不提交 Git。
- Actions API 使用 TLS、驗證、速率限制、重放防護及完整稽核。

## 6. 網路拓撲

ChatGPT Actions 與 LINE webhook 需要可由外部到達的 HTTPS 端點。開發時須從下列方案中選一個：

- 受管反向通道／零信任 tunnel。
- 小型雲端 gateway 再以主動連線連回 Mac。
- 受管 API hosting，僅保存最少狀態。

禁止直接在家用路由器公開本機服務埠。Mac 離線時，外部 gateway 應回傳「暫時無法使用」並排隊安全的通知事件，不可假裝成功。

## 7. 對話限制

- Custom GPT 不依賴跨對話記憶作為正式狀態；正式資料均由 API 取得。
- 每個查詢明示日期範圍及資料更新時間。
- 當 PMS 同步非 `HEALTHY` 時，入住與用餐回答必須警告可能不完整。
- AI 建議不可直接成為設備動作或付款。

## 8. 驗收對話

- 「今天誰入住？」能回傳必要資訊、更新時間與資料狀態。
- 「明天早餐有哪些禁忌？」不洩漏不必要個資。
- 「全聯買食材 2350 現金」只建立草稿；確認後僅寫入一次。
- 「通知群組 203 改 8:30」先顯示群組及訊息預覽。
- 「203 證件已看、尾款 2400 現金、早餐 8:30」先建立接待草稿，確認後分別寫入稽核、用餐及付款事件。
- 同一確認呼叫重送不重複寫入。
- 本機離線、token 過期及權限不足均有明確安全回覆。

## 9. 待確認

- `TBC-GPT-001`：Actions API 公開 HTTPS 入口方案。
- `TBC-GPT-002`：唯一管理者或多位管理者。
- `TBC-GPT-003`：哪些財務數字可從手機查詢。
- `TBC-GPT-004`：個人 ChatGPT 資料控制與資料保留設定。
