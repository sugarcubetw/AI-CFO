# Gmail 訂單匯入（Google Apps Script）

方糖民宿使用 Google 官方 Apps Script 授權讀取 OwlNest 訂單通知，每 15 分鐘送入營運工作台。此方案不模擬 Gmail 網頁，因此不會遇到「瀏覽器或應用程式可能有安全疑慮」的登入阻擋。

## 首次設定

1. 開啟 <https://script.google.com/>，使用接收 OwlNest 通知的 Gmail 帳號登入。
2. 建立新專案，名稱可填「方糖 Gmail 訂單同步」。
3. 將 `scripts/google-apps-script/GmailOrderImporter.gs` 全部貼入編輯器並儲存。
4. 在「專案設定 → 指令碼屬性」新增：
   - `OPS_SITE_URL`：`https://fangtang-mobile-reception.dk8515.chatgpt.site`
   - `OPS_SITE_BYPASS_TOKEN`：方糖工作台目前使用的私密 bypass token。
5. 在函式選單選擇 `installFifteenMinuteTrigger`，按「執行」。
6. Google 首次會要求 Gmail 與外部連線授權；選擇接收訂單的帳號並允許。

首次執行會搜尋最近 30 天的 OwlNest 郵件，再只匯入成立、修改及取消通知，並建立每 15 分鐘觸發器。重複執行安全：工作台以 Gmail message id 與事件雜湊排除重複。

## 驗證

- Apps Script「執行項目」應顯示 `syncOwlNestOrders` 成功。
- 工作台「基礎設定 → 排程與通知服務 → Gmail 訂單檢查」會顯示上次執行時間與 `success`／`failed`。
- 工作台執行記錄只保存統計數量與錯誤摘要，不保存郵件全文。

## 安全原則

- Apps Script 只搜尋 `owlnest@owlting.com` 寄出的成立、修改及取消通知。
- 不寄信、不刪信、不變更 Gmail 標籤。
- bypass token 僅存於 Google Script Properties，不可貼入程式碼或 GitHub。
- 失敗時不猜測訂單資料；保留錯誤狀態供管理者查看。
