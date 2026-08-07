#!/usr/bin/env node

/**
 * Daily, read-only OwlNest collector.
 *
 * OwlNest has no API in this project. This runner uses a user-authorized,
 * persistent Playwright browser profile to download the CSV from the same
 * screens a staff member uses, then submits it to the reconciliation route.
 * It never changes an OwlNest order and stops on login/DOM changes.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import process from "node:process";

const envFile = resolve(process.env.OWLNEST_ENV_FILE ?? ".env.owlnest-agent");
try {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
} catch { /* Optional local env file. launchd can provide variables directly. */ }

const OWLNEST_URL = process.env.OWL_NEST_URL ?? "https://www.owlting.com/booking/admin/?p=statistics&l=zh_TW";
const OPS_SITE_URL = process.env.OPS_SITE_URL ?? "https://fangtang-mobile-reception.dk8515.chatgpt.site";
const PROFILE_DIR = resolve(process.env.OWL_NEST_PROFILE_DIR ?? join(homedir(), ".fangtang", "owlnest-browser"));
const STATE_DIR = resolve(process.env.OWLNEST_AGENT_STATE_DIR ?? join(homedir(), ".fangtang", "owlnest-agent"));
const PERIOD_DAYS = Math.max(1, Number(process.env.OWLNEST_PERIOD_DAYS ?? 90));
const HEADLESS = process.env.OWLNEST_HEADLESS !== "false";

function log(message) { process.stdout.write(`[OwlNest Agent] ${message}\n`); }
function isoDate(date) { return date.toISOString().slice(0, 10); }
function period() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + PERIOD_DAYS);
  return { from: isoDate(from), to: isoDate(to) };
}

async function notify(payload) {
  const text = `[方糖 OwlNest 每日核對] ${payload.title}\n${payload.lines.join("\n")}`;
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(join(STATE_DIR, "last-alert.json"), JSON.stringify({ ...payload, text, at: new Date().toISOString() }, null, 2));
  if (process.env.RECONCILE_NOTIFY_WEBHOOK_URL) {
    await fetch(process.env.RECONCILE_NOTIFY_WEBHOOK_URL, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, ...payload }),
    });
  }
  if (process.platform === "darwin") {
    const escaped = text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
    const { execFile } = await import("node:child_process");
    execFile("osascript", ["-e", `display notification "${escaped}" with title "方糖 OwlNest 核對"`]);
  }
}

async function loadPlaywright() {
  try { return await import("playwright"); }
  catch { throw new Error("找不到 Playwright。請在本機執行 pnpm add -D playwright，並安裝 Chromium。此步驟只在本機執行，不會把登入資料上傳。"); }
}

async function waitForEnter(message) {
  process.stdout.write(`${message}\n完成後按 Enter 繼續。`);
  await new Promise((resolvePromise) => process.stdin.once("data", resolvePromise));
}

async function openPersistentBrowser(chromium) {
  await mkdir(PROFILE_DIR, { recursive: true });
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: process.argv.includes("--login") ? false : HEADLESS,
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
}

async function hasOwlNestOrderList(page) {
  return await page.getByText("下載訂單列表", { exact: true }).count() > 0;
}

async function chooseDateRange(page, from, to) {
  const inputs = page.locator("input[type=date]");
  if (await inputs.count() >= 2) {
    await inputs.nth(0).fill(from);
    await inputs.nth(1).fill(to);
  } else {
    throw new Error("OwlNest 日期欄位結構已變更，未安全執行下載");
  }
  const search = page.getByRole("button", { name: /搜尋|查詢|套用/ });
  if (await search.count()) await search.first().click();
  else await inputs.nth(1).press("Enter");
  await page.waitForTimeout(800);
}

async function downloadCsv(page) {
  log("正在開啟訂單列表下載選單…");
  const button = page.getByText("下載訂單列表", { exact: true }).locator("xpath=..");
  if (!await button.count()) throw new Error("找不到 OwlNest 訂單列表下載按鈕");
  await button.click();
  const csv = page.getByText("CSV", { exact: true });
  if (!await csv.count()) throw new Error("下載選單沒有 CSV，已停止避免抓錯格式");
  const downloadPromise = page.waitForEvent("download");
  await csv.last().click();
  const download = await downloadPromise;
  const target = join(STATE_DIR, `owlnest-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.csv`);
  await mkdir(dirname(target), { recursive: true });
  await download.saveAs(target);
  log(`CSV 已下載：${target}`);
  return target;
}

async function postToOperations(page, content, range) {
  const result = await page.evaluate(async ({ content: csv, range: periodRange }) => {
    const response = await fetch("/api/reconcile/owlting", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: csv, periodFrom: periodRange.from, periodTo: periodRange.to, sourceExportedAt: new Date().toISOString(), notes: "本機 OwlNest 每日自動核對" }),
    });
    return { status: response.status, body: await response.json() };
  }, { content, range });
  if (result.status >= 400) throw new Error(result.body?.error ?? `核對 API 回傳 ${result.status}`);
  return result.body;
}

async function run() {
  const startedAt = Date.now();
  log("啟動每日核對 Agent…");
  const { chromium } = await loadPlaywright();
  log("正在啟動持久瀏覽器 Session…");
  const context = await openPersistentBrowser(chromium);
  try {
    const loginMode = process.argv.includes("--login");
    const owlPage = await context.newPage();
    log("正在開啟 OwlNest…");
    await owlPage.goto(OWLNEST_URL, { waitUntil: "domcontentloaded" });
    if (loginMode) {
      await waitForEnter("請在開啟的 OwlNest 視窗完成登入，確認可看見「銷售概況／訂單列表」");
      if (!await hasOwlNestOrderList(owlPage)) throw new Error("尚未確認 OwlNest 訂單列表，停止執行");
      log("OwlNest 登入與訂單列表確認完成。");
    } else if (!await hasOwlNestOrderList(owlPage)) {
      throw new Error("OwlNest 登入失效或頁面改版，未確認訂單列表，停止執行");
    }
    const range = period();
    log(`設定入住查詢區間：${range.from} ～ ${range.to}`);
    await chooseDateRange(owlPage, range.from, range.to);
    log("正在下載 OwlNest 訂單列表 CSV…");
    const csvPath = await downloadCsv(owlPage);
    const content = await readFile(csvPath, "utf8");

    const opsPage = await context.newPage();
    log("正在開啟方糖營運工作台…");
    await opsPage.goto(OPS_SITE_URL, { waitUntil: "domcontentloaded" });
    if (loginMode) await waitForEnter("請確認營運工作台已登入且可看見「方糖營運工作台」首頁");
    log("正在送出訂單列表進行核對…");
    const result = await postToOperations(opsPage, content, range);
    const summary = { at: new Date().toISOString(), range, csvPath, result };
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(join(STATE_DIR, "last-run.json"), JSON.stringify(summary, null, 2));
    const conflicts = Number(result.changed ?? 0) + Number(result.missingFromExport ?? 0) + Number(result.duplicateInExport ?? 0) + Number(result.errors?.length ?? 0) + Number(result.warnings?.length ?? 0);
    if (conflicts > 0) {
      log(`核對完成，但有 ${conflicts} 項需要人工確認。`);
      await notify({ title: "需要人工確認", lines: [`區間：${range.from}～${range.to}`, `匯入 ${result.received} 筆`, `欄位差異 ${result.changed ?? 0} 筆`, `匯出未出現 ${result.missingFromExport ?? 0} 筆`, `匯出重複 ${result.duplicateInExport ?? 0} 筆`, `解析錯誤 ${result.errors?.length ?? 0} 筆`, `資料警示 ${result.warnings?.length ?? 0} 項`] });
    } else log(`核對完成：${result.received} 筆，無需人工確認。`);
    log(`本次執行耗時 ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} 秒。`);
  } finally {
    await context.close();
  }
}

run().catch(async (error) => {
  const reason = error instanceof Error ? error.message : String(error);
  await notify({ title: "自動核對未完成", lines: [reason, "請人工確認 OwlNest 登入狀態或頁面是否改版。"] }).catch(() => {});
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
});
