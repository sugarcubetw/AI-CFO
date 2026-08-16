# Sites Git 部署連線問題紀錄

## 摘要

本次部署未完成，原因不是應用程式、資料庫或建置錯誤，而是 Codex 執行環境無法解析 Sites Git 主機：

```text
Could not resolve host: git.chatgpt-team.site
```

最新程式碼仍保留在本機，正式站台未更新。

## 專案與部署資訊

- 專案：方糖民宿 AI CFO / Reception Mobile Site
- 本機專案目錄：`reception-mobile-site/`
- 正式站台：`https://fangtang-mobile-reception.dk8515.chatgpt.site`
- GitHub remote：`origin`
- Sites Git remote：`sites`
- Sites 分支：`main`

不要將 Sites token、GitHub PAT 或其他密鑰寫入本文件。

## 發生的現象

### Codex 執行環境

執行推送：

```bash
git push sites HEAD:main
```

結果：

```text
fatal: unable to access 'https://git.chatgpt-team.site/...':
Could not resolve host: git.chatgpt-team.site
```

即使重新取得 Sites 短期 token、重試推送及重啟 Codex，仍可能出現相同錯誤。

### 使用者 Mac

使用者在本機執行：

```bash
curl -I https://git.chatgpt-team.site
```

曾得到：

```text
HTTP/2 404
server: cloudflare
```

這代表使用者 Mac 已能解析並連到主機。`404` 是根路徑沒有對應頁面，不代表 DNS 或 HTTPS 連線失敗。

## 根因判斷

`ping`、`curl` 與 `git push` 測試的層級不同：

| 測試 | 驗證內容 |
|---|---|
| `ping` | ICMP 是否能到達某個 IP |
| `curl -I` | DNS、TCP 443、TLS 與 HTTP 是否可用 |
| `git push` | DNS、HTTPS、Sites Git 認證與遠端 Git 操作 |

目前證據顯示：

1. 使用者 Mac 的網路與 Sites 主機可達。
2. Codex 沙箱執行環境的 DNS 快取或網路路由仍無法解析 `git.chatgpt-team.site`。
3. 問題發生在 Git 認證之前，因此不是 token 錯誤。
4. `git remote -v` 已確認 `sites` remote 指向正確的 Sites 專案。

## 建議診斷流程

### 1. 在使用者 Mac 測試 DNS 與 HTTPS

```bash
dscacheutil -q host -a name git.chatgpt-team.site
curl -I --max-time 10 https://git.chatgpt-team.site
```

看到 `HTTP/2 404`、`401` 或其他 HTTP 回應，都表示主機已經可連線；只有 `Could not resolve host` 才是 DNS 解析失敗。

### 2. 清除 macOS DNS 快取

```bash
dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

必要時可暫時指定公共 DNS：

```bash
networksetup -setdnsservers Wi-Fi 1.1.1.1 8.8.8.8
```

### 3. 重啟 Codex 工作階段

Codex 沙箱可能保留舊的 DNS 狀態。完成本機 DNS 處理後，完全關閉並重新開啟 Codex，再重新執行部署。

### 4. 確認 Git remote

```bash
git remote -v
```

應看到兩個 remote：

```text
origin  https://github.com/...
sites   https://git.chatgpt-team.site/...git
```

不要把 `sites` remote 改成 GitHub remote；兩者用途不同。

## Sites token 注意事項

- Sites token 是短期、專案限定的部署憑證。
- GitHub 密碼與 GitHub PAT 不能代替 Sites token。
- 不要把 token 貼到聊天、文件、shell history 或 commit。
- 優先由 Sites 連接器以 HTTP extra header 安全使用 token。
- 若本機 `git push` 跳出 `Username` / `Password`，先按 `Ctrl+C`，避免把錯誤密碼寫入 credential helper。

## 正確部署順序

1. 確認工作樹與測試狀態。
2. 確認 `HEAD` 是要發布的 commit。
3. 使用 Sites 短期 token 推送：

   ```bash
   git push sites HEAD:main
   ```

4. 以相同 commit 建立 Sites archive。
5. 呼叫 Sites `save_site_version`。
6. 呼叫 Sites production deploy。
7. 查詢 deployment status，直到 `succeeded`。
8. 用正式站台檢查首頁、財務頁及資料庫連線。

## 本次狀態

- 原始碼：保留在本機。
- 測試：先前本機測試通過。
- Archive：可在本機建立。
- Sites Git push：因 Codex DNS 解析失敗而未完成。
- Production deploy：尚未執行，避免部署未推送或不一致的 commit。

## 恢復後驗收清單

- [ ] `curl -I https://git.chatgpt-team.site` 可取得 HTTP 回應。
- [ ] `git push sites HEAD:main` 成功。
- [ ] Sites 儲存的 commit SHA 與本機 `git rev-parse HEAD` 一致。
- [ ] Sites version 建立成功。
- [ ] Production deployment 狀態為 `succeeded`。
- [ ] 正式站台可開啟。
- [ ] 財務模組頁面與既有營運資料正常。
