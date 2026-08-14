# 新訂頁面手動修改功能 — AI 開發提示詞

## 角色

你是本專案的資深全端工程師，請在不破壞既有訂單、入住、備料與同步流程的前提下，維護方糖民宿營運工作台。

## 目前已完成的功能

新訂頁面（「新訂」）現在可以對最近匯入的訂單進行人工確認與修改。修改入口共用訂單頁既有的 `OrderEditForm` 與 `/api/orders` PATCH API，不可另建一套新訂專用資料表或修改 API。

使用者可修改：

- 成人數 `adults`
- 兒童數 `children`
- 房客留言／飲食禁忌／訂單備註 `specialRequests`

修改後應直接更新原訂單，並在訂單頁、新訂頁、月曆、入住與備料畫面呈現同一份資料。

## 資料一致性原則

所有訂單都以資料庫 `reservations` 為唯一來源：

```text
Gmail／OwlNest／手動新增
        ↓
reservations
        ↓
新訂頁／訂單頁／月曆／入住／備料
```

禁止：

- 為新訂頁建立複製訂單。
- 在前端永久保存另一份訂單內容。
- 建立與 `/api/orders` 不一致的修改規則。

## 相關程式位置

- `app/page.tsx`
  - `NewOrdersData`：新訂頁資料型別。
  - `loadNewOrders()`：載入近 7 天新訂單。
  - `markNewOrderRead()`：標示已讀。
  - `updateOrder()`：共用訂單修改提交流程。
  - `OrderEditForm`：成人、兒童、留言／飲食注意事項表單。
  - 新訂頁的「新訂單資料確認」區塊：選擇訂單後開啟編輯表單。

- `app/api/new-orders/route.ts`
  - 只負責近 7 天新訂篩選與 `readAt` 已讀狀態。
  - 不負責修改成人、兒童或備註。

- `app/api/orders/route.ts`
  - `PATCH action=update` 是唯一人工修改訂單入口。
  - 會驗證成人至少 1、兒童不可小於 0。
  - 會更新 `reservations`。
  - 會寫入 `audit_log`，action 為 `reservation.updated_manually`。
  - 會失效首頁快取。

## 操作流程

1. 使用者開啟「新訂」。
2. 系統顯示最近 7 天匯入訂單。
3. 使用者按某筆訂單的「編輯」。
4. 系統將該筆訂單放入共用訂單狀態並開啟 `OrderEditForm`。
5. 使用者輸入成人數、兒童數、房客留言或飲食注意事項。
6. 按「儲存修改」。
7. 前端呼叫：

```http
PATCH /api/orders
Content-Type: application/json
```

```json
{
  "id": "訂單編號",
  "action": "update",
  "adults": 2,
  "children": 1,
  "specialRequests": "不吃牛、早餐避免堅果"
}
```

8. API 更新 `reservations` 並建立稽核紀錄。
9. 前端重新載入訂單資料，使新訂、訂單、入住與備料同步。

## 後續優化要求

下一個 AI 若要優化此功能，請依序處理：

1. 讓新訂頁的編輯表單顯示目前原始人數與備註。
2. 儲存成功後立即更新新訂頁卡片，不必整頁重新整理。
3. 顯示「最後修改時間」與「已由人工確認」狀態。
4. 若匯入資料缺少人數，顯示「待人工確認」，不可默認為真實 1 人。
5. 飲食注意事項可在入住與備料頁直接查看。
6. 修改後使首頁、月曆與備料快取失效。
7. 所有修改都必須保留 `audit_log`。

## 驗收條件

- 新訂頁可選擇任一近 7 天訂單並開啟編輯。
- 成人與兒童欄位可修改並通過驗證。
- 可輸入房客留言、飲食禁忌與其他備註。
- 儲存後訂單頁與新訂頁顯示相同結果。
- 備料頁使用更新後的人數與備註。
- 資料庫只有一筆原訂單，不產生副本。
- `audit_log` 有人工修改紀錄。
- 既有自動匯入與已讀功能不受影響。

## 開發規則

- 修改前先閱讀 `docs/AI_HANDOFF.md` 與本文件。
- 不修改 `reservations` 的既有欄位語意。
- Schema 變更必須建立 Drizzle migration。
- 完成後執行 `pnpm test` 與 `pnpm build`。
- 不提交 token、cookie、Gmail 內容、OwlNest 原始匯出檔或個資。
