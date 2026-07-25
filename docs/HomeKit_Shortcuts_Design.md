# HomeKit Shortcuts Design

## 1. 設計原則

AI 不直接控制 HomeKit 裝置。AI 或訂單事件只能提出「營運意圖」，確定性規則引擎依住房、天氣、時間、安全限制及人工覆寫決定是否呼叫使用者維護的 Shortcut。

本文件只規劃介面與安全規則，不建立或執行 Shortcut。

## 2. 責任分界

| 層級 | 責任 |
|---|---|
| OwlNest Collector | 提供已驗證的入住／退房與房間狀態 |
| Weather Provider | 提供時間戳、地點及天氣狀態 |
| Rules Engine | 評估條件、衝突、優先序與安全預設 |
| Shortcut Runner | 只執行白名單 Shortcut，處理逾時與輸出 |
| Shortcut | 將標準意圖轉為 HomeKit 場景／裝置操作 |
| HomeKit／Home Hub | 實際設備控制與家庭自動化 |
| 使用者 | 定義設備用途、場景、安全限制及手動覆寫 |

## 3. 標準狀態

住宿狀態：

- `NO_GUESTS`
- `ARRIVAL_EXPECTED`
- `OCCUPIED`
- `CHECKOUT_PENDING`
- `UNKNOWN`

天氣狀態：

- `DRY`
- `RAINING`
- `SEVERE`
- `STALE`
- `UNKNOWN`

系統狀態：

- `NORMAL`
- `MANUAL_OVERRIDE`
- `PMS_STALE`
- `HOMEKIT_UNAVAILABLE`
- `SAFE_HOLD`

任何必要資料為 `UNKNOWN` 或過期時，預設不執行可能耗能、影響設備或造成風險的自動動作。

## 4. 規則範例

### RULE-HK-001 無住客夜間燈光

- 條件：住宿狀態為 `NO_GUESTS`，且處於使用者定義的夜間時段。
- 結果：不啟動「住客夜間照明」場景。
- 例外：安全照明、攝影或法規必要照明不受此規則關閉。
- 待確認：哪些燈屬安全照明。

### RULE-HK-002 有入住時準備

- 條件：狀態為 `ARRIVAL_EXPECTED`，距預計入住時間達設定門檻。
- 結果：可執行使用者指定的到房準備 Shortcut。
- 限制：PMS 資料過期、房號未確認或人工覆寫時不得自動執行。

### RULE-HK-003 下雨時抽水馬達

- 使用者需求：下雨時不用開抽水馬達。
- 狀態：**暫停自動化**。
- 原因：尚未確認馬達用途、積水風險、感測器及失敗後果。若為排水或防洪設備，「下雨不啟動」可能不安全。
- 解鎖條件：設備用途、安全預設、雨量來源、積水感測、人工覆寫及失聯行為均確認。

## 5. 規則優先序

由高至低：

1. 人身、消防、防洪及設備安全。
2. 人工緊急停止／手動覆寫。
3. 資料新鮮度與系統健康。
4. 住客舒適與入住流程。
5. 節能與一般排程。
6. AI 建議。

AI 建議永遠不能覆蓋 1～3。

## 6. Shortcut 合約

每個 Shortcut 必須登錄：

| 欄位 | 說明 |
|---|---|
| `shortcut_id` | 系統固定識別碼 |
| `shortcut_name` | macOS Shortcuts 中精確名稱 |
| `purpose` | 燈光、空調、馬達或場景 |
| `risk_level` | low、medium、high |
| `allowed_states` | 可執行的住宿／天氣／系統狀態 |
| `input_schema` | 接受的固定 JSON／文字欄位 |
| `timeout_seconds` | 最長執行時間 |
| `success_output` | 成功輸出格式 |
| `safe_default` | 不確定或失敗時行為 |
| `manual_override` | 手動覆寫位置及有效期 |

執行器只接受白名單 `shortcut_id`，不得接受 GPT 傳入任意 Shortcut 名稱或 shell 內容。

## 7. 執行與稽核

每次評估均保存：

- 觸發事件與來源版本。
- 入住、天氣及系統狀態快照。
- 命中的規則、未命中原因與優先序。
- 是否需確認、確認人及時間。
- Shortcut ID、開始／完成時間、輸出及錯誤。
- 手動覆寫與恢復時間。

同一規則、房間與時間窗使用 idempotency key，避免重複開關。

## 8. 驗收

- 沒住客時不啟動住客夜間照明，但保留安全照明。
- PMS 過期或房況未知時不執行入住準備。
- 手動覆寫優先於節能規則，且到期後可恢復。
- 任意自然語言不能直接指定未登錄 Shortcut。
- Shortcut 逾時、Mac 重啟及 HomeKit 無回應均有明確狀態與通知。
- 高風險設備未完成安全審核前保持停用。

## 9. 待確認

- `TBC-HK-001`：HomeKit 設備、房間、用途與 Home Hub 清冊。
- `TBC-HK-002`：現有 Shortcut 精確名稱及輸入／輸出。
- `TBC-HK-003`：夜間時段與安全照明清單。
- `TBC-HK-004`：到房前多久啟動準備。
- `TBC-HK-005`：抽水馬達用途、安全預設、感測器與人工覆寫。
- `TBC-HK-006`：天氣資料來源、地點與允許的資料最大年齡。

