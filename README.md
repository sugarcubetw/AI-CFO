# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## OwlNest 訂單核對

OwlNest 目前沒有提供本專案可直接使用的 API，因此 V1 採安全的唯讀流程：在 OwlNest「銷售概況 → 訂單列表」設定入住日期區間，選擇「下載訂單列表 → CSV」，再到營運工作台的「核對」頁上傳 CSV。系統以 OwlNest 訂單編號比對，會記錄相符、新增、欄位差異及本次匯出未出現的訂單；未出現不會自動視為取消。

每日核對建議以今日至未來 90 日為區間，並在入住前更新一次。訂金比例與付款規則仍由 OwlNest/PMS 決定，本系統只接收列表上的已收、未收、付款方式與付款狀態。

## 每日自動核對（本機 Agent）

要做到「平常自動執行、只有異常才通知」，請在每天開機的 Mac 上使用 `scripts/owlnest-daily-reconcile.mjs`。它會使用本機受限的 Playwright 持久 session，唯讀開啟 OwlNest、下載 CSV、以同一瀏覽器 session 呼叫營運工作台的核對 API；正常時不通知，只有欄位差異、匯出未出現、解析錯誤、登入失效或頁面改版才通知。

首次設定需人工完成一次登入：

```bash
pnpm add -D playwright
pnpm exec playwright install chromium
cp scripts/owlnest-agent.env.example .env.owlnest-agent
pnpm run owlnest:login
```

登入完成後不需要按 Enter；Agent 會自動偵測登入結果、切換至「訂單列表」、設定日期並按下查詢。確認 OwlNest 訂單列表與營運網站都能在同一個瀏覽器 session 開啟後，才啟用 `scripts/com.fangtang.owlnest-reconcile.plist.example` 的 macOS `launchd` 排程。這個 Agent 不會繞過 2FA、CAPTCHA 或權限，也不會回寫 OwlNest。通知通道需填入受限的 `RECONCILE_NOTIFY_WEBHOOK_URL`；若未設定，Mac 仍會顯示系統通知並保存錯誤紀錄。

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
