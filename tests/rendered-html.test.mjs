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
  const [page, orders, checkin, css] = await Promise.all([read("app/page.tsx"), read("app/api/orders/route.ts"), read("app/api/checkin/route.ts"), read("app/globals.css")]);
  assert.match(page, /status-\$\{order\.status\}/);
  assert.match(page, /目前入住中/);
  assert.match(page, /查看入住資訊/);
  assert.match(page, /checkinEditing/);
  assert.match(page, /StaySummary/);
  assert.match(orders, /receptionChecklists/);
  assert.match(orders, /breakfastTime/);
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
  assert.match(page, /setSelectedId\(todayOrders\[0\]\?\.id \?\? ""\)/);
  assert.match(page, /selected\.arrivalDate !== today/);
  assert.match(page, /今日入住/);
  assert.match(page, /function openTodayPrep\(\)/);
  assert.match(page, /await loadPrep\(today, today\)/);
  assert.match(page, /今日備料人數/);
  assert.match(page, /value=\{prepFrom\}/);
  assert.match(page, /value=\{prepTo\}/);
});
