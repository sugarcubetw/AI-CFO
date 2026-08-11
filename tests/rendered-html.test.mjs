import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server renders the Fangtang operations shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /方糖民宿接待工作台/);
  assert.match(html, /方糖營運工作台/);
});

test("P2–P5 routes and UI are wired", async () => {
  const [page, schema, orders, checkin, prep, prepAuto, importRoute, hosting] = await Promise.all([
    read("app/page.tsx"), read("db/schema.ts"), read("app/api/orders/route.ts"),
    read("app/api/checkin/route.ts"), read("app/api/prep/route.ts"), read("app/api/prep/auto/route.ts"), read("app/api/import/route.ts"),
    read(".openai/hosting.json"),
  ]);
  assert.match(page, /手動新增訂單/);
  assert.match(page, /身分證號／證件號碼/);
  assert.match(page, /備料人數/);
  assert.match(page, /已確認/);
  assert.match(page, /預估/);
  assert.match(page, /待選餐/);
  assert.match(schema, /identityHash/);
  assert.doesNotMatch(schema, /identityNumber|identityPlaintext/);
  assert.match(orders, /arrivalDate/);
  assert.match(checkin, /paymentMethodsFor/);
  assert.match(checkin, /不可超過目前未收金額/);
  assert.match(page, /無新收款填 0/);
  assert.match(page, /修改入住資料/);
  assert.match(prep, /prepReports/);
  assert.match(prep, /differences/);
  assert.match(prep, /quantitiesDeferred/);
  assert.match(prepAuto, /18:00/);
  assert.match(prepAuto, /reportType: "formal"/);
  assert.match(importRoute, /pending_review/);
  assert.equal(JSON.parse(hosting).d1, "DB");
});

test("P6 import uses event hash dedupe and cancellation precedence", async () => {
  const [logic, route] = await Promise.all([read("lib/import-orders.ts"), read("app/api/import/route.ts")]);
  assert.match(logic, /SHA-256/);
  assert.match(logic, /messageId/);
  assert.match(route, /priorEvent/);
  assert.match(route, /eventType === "cancelled" \? "cancelled"/);
  assert.match(route, /payloadRedacted/);
});

test("payment correction preserves an audit trail and requires exact-state confirmation", async () => {
  const route = await read("app/api/admin/payment-correction/route.ts");
  assert.match(route, /VOID_DUPLICATE_BALANCE_PAYMENT/);
  assert.match(route, /expectedReceivedAmount/);
  assert.match(route, /duplicatePayment\.amount !== correctionAmount/);
  assert.match(route, /status: "voided"/);
  assert.match(route, /payment\.duplicate_voided/);
});

test("reservation guest correction requires exact prior counts and records an audit event", async () => {
  const route = await read("app/api/admin/reservation-correction/route.ts");
  assert.match(route, /CORRECT_RESERVATION_GUESTS/);
  assert.match(route, /expectedAdults/);
  assert.match(route, /reservation\.guest_count_corrected/);
  assert.match(route, /breakfastEstimate: adults \+ children/);
});

test("base settings are persistent and every change is auditable", async () => {
  const [schema, settings, logs, bootstrap, checkin, settingsPage] = await Promise.all([
    read("db/schema.ts"), read("app/api/settings/route.ts"), read("app/api/logs/route.ts"),
    read("app/api/bootstrap/route.ts"), read("app/api/checkin/route.ts"), read("app/settings/page.tsx"),
  ]);
  assert.match(schema, /settingOptions/);
  assert.match(schema, /idx_setting_options_category_label_scope/);
  assert.match(settings, /setting\.created/);
  assert.match(settings, /room_type\.updated/);
  assert.match(logs, /auditLog/);
  assert.match(bootstrap, /onConflictDoNothing/);
  assert.match(checkin, /configuredBreakfast/);
  assert.match(checkin, /configuredPayments/);
  assert.match(settingsPage, /基礎資料設定/);
  assert.match(settingsPage, /執行記錄/);
});

test("automation schedules are configurable and audited from base settings", async () => {
  const [schema, seed, settings, settingsPage] = await Promise.all([
    read("db/schema.ts"), read("lib/base-data.ts"), read("app/api/settings/route.ts"), read("app/settings/page.tsx"),
  ]);
  assert.match(schema, /automationJobs/);
  assert.match(seed, /gmail-order-import/);
  assert.match(seed, /owlnest-reconcile/);
  assert.match(settings, /automation\.updated/);
  assert.match(settings, /intervalMinutes < 5/);
  assert.match(settingsPage, /排程與通知服務/);
  assert.match(settingsPage, /每日定時/);
  assert.match(settingsPage, /事件觸發/);
});

test("order status colors and post-check-in summary are wired", async () => {
  const [page, orders, orderQuery, checkin, css] = await Promise.all([read("app/page.tsx"), read("app/api/orders/route.ts"), read("lib/order-query.ts"), read("app/api/checkin/route.ts"), read("app/globals.css")]);
  assert.match(page, /status-\$\{order\.status\}/);
  assert.match(page, /目前入住中/);
  assert.match(page, /查看入住資訊/);
  assert.match(page, /checkinEditing/);
  assert.match(page, /StaySummary/);
  assert.match(orders, /getCalendarOrders/);
  assert.match(orderQuery, /receptionChecklists/);
  assert.match(orderQuery, /breakfastTime/);
  assert.match(checkin, /existingChecklist\?\.identityHash/);
  assert.match(checkin, /db\.delete\(mealRequirements\)/);
  assert.match(css, /order-result\.status-pending/);
  assert.match(css, /order-result\.status-checked_in/);
});

test("cross-page navigation uses native form submissions", async () => {
  const [page, settings] = await Promise.all([read("app/page.tsx"), read("app/settings/page.tsx")]);
  assert.doesNotMatch(page, /from ["']next\/link["']/);
  assert.doesNotMatch(settings, /from ["']next\/link["']/);
  assert.match(page, /<form className="header-nav-form" action="\/settings" method="get">/);
  assert.match(settings, /<form className="header-nav-form" action="\/" method="get">/);
});

test("check-in and prep tabs default to Taipei today", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /timeZone: "Asia\/Taipei"/);
  assert.match(page, /function openTodayCheckin\(\)/);
  assert.match(page, /const current = await loadTodayOrders\(\)/);
  assert.match(page, /selected\.arrivalDate !== today/);
  assert.match(page, /今日入住/);
  assert.match(page, /function openTodayPrep\(\)/);
  assert.match(page, /await loadPrep\(today, today\)/);
  assert.match(page, /今日備料人數/);
  assert.match(page, /value=\{prepFrom\}/);
  assert.match(page, /value=\{prepTo\}/);
});

test("today orders load independently and order search defaults to the next seven days", async () => {
  const [page, homeRoute, cache] = await Promise.all([read("app/page.tsx"), read("app/api/home/route.ts"), read("lib/home-page-cache.ts")]);
  assert.match(page, /function forwardWeekRange\(\)/);
  assert.match(page, /date\.setUTCDate\(date\.getUTCDate\(\) \+ 6\)/);
  assert.match(page, /fetch\(`\/api\/orders\?from=\$\{today\}&to=\$\{today\}`\)/);
  assert.match(page, /fetch\(`\/api\/home\?date=\$\{today\}`\)/);
  assert.match(homeRoute, /getHomePageData/);
  assert.match(cache, /\["home-page-data"\]/);
  assert.match(cache, /HOME_PAGE_CACHE_TTL_SECONDS = 900/);
  assert.match(cache, /timeZone: "Asia\/Taipei"/);
  assert.match(page, /今天起 7 天/);
});

test("home cache is invalidated by every order-affecting mutation", async () => {
  const routes = await Promise.all([
    "app/api/orders/route.ts",
    "app/api/checkin/route.ts",
    "app/api/import/route.ts",
    "app/api/reconcile/owlting/route.ts",
    "app/api/admin/payment-correction/route.ts",
    "app/api/admin/reservation-correction/route.ts",
    "app/api/meals/route.ts",
    "app/api/settings/route.ts",
  ].map(read));
  for (const route of routes) assert.match(route, /invalidateHomePageCache/);
});

test("pending orders can be manually cancelled with audit history", async () => {
  const [page, route] = await Promise.all([read("app/page.tsx"), read("app/api/orders/route.ts")]);
  assert.match(page, /手動取消訂單/);
  assert.match(page, /取消原因/);
  assert.match(route, /reservation\.cancelled_manually/);
  assert.match(route, /已入住訂單不可直接取消/);
  assert.match(route, /db\.delete\(mealRequirements\)/);
  assert.match(route, /eventType: "cancelled"/);
});

test("future orders support manual guest and message edits and room-capacity estimates", async () => {
  const [page, orders, guestCount, prep, reconcile] = await Promise.all([
    read("app/page.tsx"), read("app/api/orders/route.ts"), read("lib/guest-count.ts"),
    read("lib/prep-query.ts"), read("app/api/reconcile/owlting/route.ts"),
  ]);
  assert.match(page, /手動修改訂單/);
  assert.match(page, /房客留言／飲食禁忌／訂單備註/);
  assert.match(page, /房客留言：/);
  assert.match(orders, /reservation\.updated_manually/);
  assert.match(orders, /action === "update"/);
  assert.match(guestCount, /"204": 4/);
  assert.match(guestCount, /"201": 2/);
  assert.match(prep, /estimatedGuestCount/);
  assert.match(reconcile, /row\.roomNumbers\.reduce/);
});

test("calendar uses Monday through Sunday and keeps multi-night stay segments", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\['一','二','三','四','五','六','日'\]/);
  assert.match(page, /mondayBasedDayIndex/);
  assert.match(page, /order\.arrivalDate <= day && order\.departureDate > day/);
  assert.match(page, /`續住 \$\{order\.roomNumber/);
});

test("calendar order queries use a tagged read cache with direct-query fallback", async () => {
  const cache = await readFile(new URL("../lib/calendar-cache.ts", import.meta.url), "utf8");
  const ordersRoute = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  const homeCache = await readFile(new URL("../lib/home-page-cache.ts", import.meta.url), "utf8");
  assert.match(cache, /unstable_cache/);
  assert.match(cache, /revalidate: CALENDAR_CACHE_TTL_SECONDS/);
  assert.match(cache, /return queryOrders\(from, to\)/);
  assert.match(ordersRoute, /getCalendarOrders\(from, to\)/);
  assert.match(homeCache, /revalidateTag\(CALENDAR_CACHE_TAG/);
});
