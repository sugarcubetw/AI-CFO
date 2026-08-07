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
const DEBUG_SCREENSHOTS = process.env.OWLNEST_DEBUG_SCREENSHOTS !== "false";

function log(message) { process.stdout.write(`[OwlNest Agent] ${message}\n`); }
function localIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function period() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + PERIOD_DAYS);
  return { from: localIsoDate(from), to: localIsoDate(to) };
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

async function openPersistentBrowser(chromium) {
  await mkdir(PROFILE_DIR, { recursive: true });
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: process.argv.includes("--login") ? false : HEADLESS,
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
}

function observeBrowser(context) {
  const observePage = (page) => {
    log(`瀏覽器頁面：${page.url() || "新頁面"}`);
    page.on("close", () => log(`瀏覽器頁面已關閉：${page.url() || "未知頁面"}`));
    page.on("download", (download) => log(`偵測到下載事件：${download.suggestedFilename()}`));
  };
  for (const page of context.pages()) observePage(page);
  context.on("page", observePage);
  context.on("close", () => log("瀏覽器 Session 已關閉"));
}

async function captureDiagnostics(page, label) {
  if (!DEBUG_SCREENSHOTS || page.isClosed()) return;
  await mkdir(STATE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const safeLabel = label.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
  const imagePath = join(STATE_DIR, `owlnest-${safeLabel}-${stamp}.png`);
  const infoPath = join(STATE_DIR, `owlnest-${safeLabel}-${stamp}.json`);
  const info = {
    at: new Date().toISOString(),
    url: page.url(),
    title: await page.title().catch(() => ""),
    pages: page.context().pages().map((item) => ({ url: item.url(), closed: item.isClosed() })),
  };
  await writeFile(infoPath, JSON.stringify(info, null, 2));
  await page.screenshot({ path: imagePath, fullPage: false }).catch(() => {});
  log(`已保存畫面診斷：${imagePath}`);
}

async function selectOwlNestOrderList(page) {
  const roleTab = page.getByRole("tab", { name: "訂單列表", exact: true });
  const tab = await roleTab.count()
    ? roleTab.first()
    : page.locator('[role="tab"]').filter({ hasText: "訂單列表" }).first();
  if (!await tab.count()) return false;
  if (await tab.getAttribute("aria-selected") !== "true") {
    log("正在切換 OwlNest 至「訂單列表」…");
    await tab.click();
    await page.waitForTimeout(800);
  }
  const download = page.getByText("下載訂單列表", { exact: true }).last();
  return await download.count() > 0 && await download.isVisible();
}

async function waitForOwlNestOrderList(page, timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  let nextLogAt = 0;
  while (Date.now() < deadline) {
    if (await selectOwlNestOrderList(page)) return;
    if (Date.now() >= nextLogAt) {
      log("等待 OwlNest 登入完成，Agent 會自動切換至「訂單列表」…");
      nextLogAt = Date.now() + 10000;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error("等待 OwlNest 登入或訂單列表逾時，未安全執行下載");
}

async function selectDateFromCalendar(page, input, value) {
  // OwlNest's date input can display a typed value without committing it to
  // the Vue date-picker model. Use the same visible calendar interaction as a
  // receptionist: open the field, navigate to the target month, and click the
  // target day. This reliably triggers OwlNest's change event.
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) throw new Error(`無效日期：${value}`);
  await input.click();
  const panel = page.locator(".el-picker-panel.el-date-picker:visible").last();
  await panel.waitFor({ state: "visible", timeout: 5000 });
  const targetYear = target.getFullYear();
  const targetMonth = target.getMonth() + 1;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const labels = await panel.locator(".el-date-picker__header-label").allTextContents();
    const year = Number((labels[0] ?? "").match(/20\d{2}/)?.[0]);
    const month = Number((labels[1] ?? "").match(/\d{1,2}/)?.[0]);
    if (year === targetYear && month === targetMonth) break;
    const currentIndex = year * 12 + month;
    const targetIndex = targetYear * 12 + targetMonth;
    const button = panel.locator(`button[aria-label="${targetIndex > currentIndex ? "下個月" : "上個月"}"]`);
    if (!await button.count()) throw new Error("OwlNest 日期選擇器缺少月份切換按鈕，未安全執行下載");
    await button.click();
    await page.waitForTimeout(100);
    if (attempt === 23) throw new Error("OwlNest 日期選擇器無法切換至指定月份，未安全執行下載");
  }
  const day = String(target.getDate());
  const dayCell = panel.locator("td.available:not(.prev-month):not(.next-month)").filter({ hasText: new RegExp(`^\\s*${day}\\s*$`) }).first();
  if (!await dayCell.count()) throw new Error(`OwlNest 日期選擇器找不到 ${value}，未安全執行下載`);
  await dayCell.click();
  await page.waitForTimeout(350);
  const actual = (await input.getAttribute("value").catch(() => null)) ?? await input.evaluate((element) => element.value);
  if (actual.replaceAll("/", "-") !== value) throw new Error(`OwlNest 日期未成功選取：${value}，未安全執行下載`);
}

async function chooseDateRange(page, from, to) {
  // OwlNest renders two date-range components. The inactive report panel can
  // appear first in the DOM with hidden inputs, while the order-list panel is
  // the one whose date inputs are visible. Always target the visible panel.
  const datePicker = page.locator(".date-range-field .date-range-picker").first();
  const inputs = datePicker.locator("input");
  const descriptors = await inputs.evaluateAll((elements) => elements.map((element) => ({
    value: element.value,
    placeholder: element.getAttribute("placeholder") ?? "",
    aria: element.getAttribute("aria-label") ?? "",
    type: element.getAttribute("type") ?? "",
  })));
  const dateIndexes = descriptors.map((item, index) => ({ item, index })).filter(({ item }) =>
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(item.value) || /日期|date|yyyy/i.test(`${item.placeholder} ${item.aria}`),
  ).map(({ index }) => index);
  if (dateIndexes.length >= 2) {
    const startInput = inputs.nth(dateIndexes[0]);
    const endInput = inputs.nth(dateIndexes[1]);
    await selectDateFromCalendar(page, startInput, from);
    await selectDateFromCalendar(page, endInput, to);
    const typedValues = await inputs.evaluateAll((elements, indexes) => indexes.map((index) => elements[index]?.value ?? ""), dateIndexes.slice(0, 2));
    log(`日期欄位已填入：${typedValues[0] ?? ""} ～ ${typedValues[1] ?? ""}`);
  } else {
    throw new Error("OwlNest 日期欄位結構已變更，未安全執行下載");
  }
  // The order-list panel's date range is submitted by the visible search
  // button beside the optional order-number/name field. It is outside the
  // date-picker element; the button inside the first date-picker belongs to a
  // hidden report panel and must not be clicked.
  const orderSearch = page.locator(".orders-list-header__filters .search-field button").first();
  if (!await orderSearch.count() || !await orderSearch.isVisible()) throw new Error("找不到 OwlNest 訂單列表搜尋按鈕，未安全執行下載");
  log("正在按下 OwlNest 訂單列表搜尋…");
  await orderSearch.click();
  await page.waitForTimeout(800);
  const finalValues = await inputs.evaluateAll((elements, indexes) => indexes.map((index) => elements[index]?.value ?? ""), dateIndexes.slice(0, 2));
  if (finalValues[0].replaceAll("/", "-") !== from || finalValues[1].replaceAll("/", "-") !== to) throw new Error("OwlNest 日期區間未成功套用，未安全執行下載");

  // Guard against a stale query state: the input can show the new values while
  // OwlNest still has the previous range selected internally. The order list
  // has booking/check-in/check-out dates; validate only the check-in date,
  // because a stay may check out after the selected search window.
  const deadline = Date.now() + 15000;
  while (true) {
    const rows = await page.locator("tbody tr").allTextContents();
    const outOfRange = rows.some((text) => {
      const dates = [...text.matchAll(/20\d{2}[-/]\d{2}[-/]\d{2}/g)].map((match) => match[0].replaceAll("/", "-"));
      const checkInDate = dates[1];
      return Boolean(checkInDate && (checkInDate < from || checkInDate > to));
    });
    if (!outOfRange) break;
    if (Date.now() >= deadline) throw new Error("OwlNest 查詢結果仍不是指定入住區間，未安全下載");
    await page.waitForTimeout(500);
  }
  log(`已確認 OwlNest 訂單列表區間：${from} ～ ${to}`);
}

async function downloadCsv(page) {
  log("正在開啟訂單列表下載選單…");
  await captureDiagnostics(page, "before-download-menu");
  const button = page.getByText("下載訂單列表", { exact: true }).locator("xpath=..");
  if (!await button.count()) throw new Error("找不到 OwlNest 訂單列表下載按鈕");
  await button.click();
  await page.waitForTimeout(350);
  await captureDiagnostics(page, "download-menu-open");
  const menuId = await button.getAttribute("aria-controls");
  let csv = menuId ? page.locator(`#${menuId}`).getByText("CSV", { exact: true }) : null;
  if (!csv || !await csv.count() || !await csv.isVisible()) {
    const visibleMenu = page.locator(".el-dropdown-menu:visible").last();
    csv = visibleMenu.getByText("CSV", { exact: true });
  }
  if (!await csv.count() || !await csv.isVisible()) throw new Error("訂單列表下載選單沒有可見 CSV，已停止避免抓錯格式");
  // OwlNest generates the report asynchronously. Large date ranges can take
  // longer than Playwright's default 30-second event timeout.
  log("OwlNest 正在製作檔案，最多等待 180 秒…");
  const downloadPromise = page.waitForEvent("download", { timeout: 180000 });
  try {
    await csv.last().click();
  } catch (error) {
    await captureDiagnostics(page, "download-click-error");
    throw error;
  }
  let download;
  try {
    download = await downloadPromise;
  } catch (error) {
    await captureDiagnostics(page, "download-wait-error");
    log(`下載等待失敗時頁面狀態：${page.isClosed() ? "已關閉" : page.url()}`);
    throw error;
  }
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
    const raw = await response.text();
    let body;
    try { body = JSON.parse(raw); }
    catch { body = { error: `核對 API 未回傳 JSON（HTTP ${response.status}）`, responsePreview: raw.slice(0, 240) }; }
    return { status: response.status, body };
  }, { content, range });
  if (result.status >= 400 || result.body?.error) {
    const preview = result.body?.responsePreview ? `：${result.body.responsePreview}` : "";
    throw new Error(`${result.body?.error ?? `核對 API 回傳 ${result.status}`}${preview}`);
  }
  return result.body;
}

async function run() {
  const startedAt = Date.now();
  log("啟動每日核對 Agent…");
  const { chromium } = await loadPlaywright();
  log("正在啟動持久瀏覽器 Session…");
  const context = await openPersistentBrowser(chromium);
  observeBrowser(context);
  try {
    const loginMode = process.argv.includes("--login");
    const owlPage = await context.newPage();
    log("正在開啟 OwlNest…");
    await owlPage.goto(OWLNEST_URL, { waitUntil: "domcontentloaded" });
    await owlPage.waitForTimeout(1200);
    if (loginMode) {
      log("請在 Agent 新開的 OwlNest 視窗完成登入；完成後會自動繼續，不需按 Enter。");
      await waitForOwlNestOrderList(owlPage);
      log("OwlNest 登入與訂單列表確認完成。");
    } else if (!await selectOwlNestOrderList(owlPage)) {
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
