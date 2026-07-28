# LINE Notification Design

## 1. 前提

- LINE Official Account 已建立。
- 實作使用 LINE Messaging API，不使用已終止的 LINE Notify。
- Messaging API Channel、webhook、Access Token、Channel Secret 與測試群組狀態待確認。
- 本文件只規劃，不建立 Channel 或發送訊息。

## 2. 用途

| 類型 | 觸發 | 最少內容 |
|---|---|---|
| 新訂單 | OwlNest 新事件完成驗證 | 入住日、房型／房號、人數、來源、必要備註 |
| 訂單異動 | 關鍵欄位變更 | 變更前後差異及更新時間 |
| 取消 | PMS 確認取消 | 入住日、房型／房號及取消狀態 |
| 入住前摘要 | 排程 | 今日入住、預計時間、未完成任務 |
| 早餐準備 | 排程／需求異動 | 時段、人數、餐食禁忌及版本 |
| 備料表 | 所有接待完成或每日 18:00 | 餐點份數、食材需求、缺漏及版本 |
| 系統異常 | 健康檢查 | 故障元件、開始時間、影響及人工動作 |
| 財務提醒 | 月結／異常規則 | 僅管理者私訊，不進一般工作群組 |

## 3. Webhook 規則

1. 對原始 request body 驗證 LINE 簽章。
2. 未驗證前不解析或執行事件。
3. 以 webhook event ID 去重。
4. 快速回覆 HTTP，再非同步處理。
5. 記錄接收、處理、通知、失敗與重試狀態。
6. 群組／使用者採白名單；未知來源不執行管理命令。
7. 不將 Channel Secret 或長效 Token 寫入 log。

## 4. 通知政策

- 一般群組只收營運所需資訊。
- 財務摘要、系統設定與完整稽核只允許管理者。
- 飲食禁忌顯示房號／用餐批次即可，除非工作確實需要住客稱呼。
- 同一事件只發一次；內容變更另發「異動」而非覆蓋歷史。
- 低風險例行摘要可自動發送。
- 人工輸入的臨時通知先建立草稿並確認。
- 安靜時段僅允許入住異常、取消、重大系統故障及安全警示；其餘延後彙整。

## 5. 訊息模板

```text
[今日入住｜資料截至 {data_as_of}]
房號／房型：{room}
人數：成人 {adults}、兒童 {children}
預計入住：{arrival_time}
用餐：{meal_time}
注意：{minimal_requirement}
來源：{source}
```

```text
[早餐準備｜{meal_date}]
{meal_time}：{count} 位
注意：{dietary_summary}
資料版本：{version}
```

18:00 後異動只發送相較前版的新增、取消及變更，不重複發送完整清單。

```text
[系統異常]
元件：{component}
狀態：{status}
開始：{started_at}
影響：{impact}
請執行：{manual_action}
```

## 6. 傳送狀態

`DRAFT -> APPROVED -> QUEUED -> SENT`

失敗時：

`QUEUED -> RETRY_WAIT -> SENT` 或 `DEAD_LETTER`

每次重試使用相同 idempotency key。達重試上限後通知管理者，不無限重送。

## 7. 驗收

- 偽造簽章無法觸發任何操作。
- 同一 webhook 重送不重複建立採購、任務或通知。
- 未授權群組不能查財務或執行動作。
- 通知不含電話、Email、付款或登入資料。
- 安靜時段、彙整及重大警示規則可用測試時鐘驗證。
- LINE API 失敗後可重試且不重複發送。

## 8. 待確認

- `TBC-LINE-001`：Messaging API Channel 是否已啟用。
- `TBC-LINE-002`：管理者 LINE user ID 及測試 group ID；由 webhook 安全取得。
- `TBC-LINE-003`：工作群組角色及可見內容。
- `TBC-LINE-004`：安靜時段與例外。
- `TBC-LINE-005`：新訂單、入住前、早餐摘要的通知提前量。
