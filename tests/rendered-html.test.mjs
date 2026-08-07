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
  const [page, schema, orders, checkin, prep, importRoute, hosting] = await Promise.all([
    read("app/page.tsx"), read("db/schema.ts"), read("app/api/orders/route.ts"),
    read("app/api/checkin/route.ts"), read("app/api/prep/route.ts"), read("app/api/import/route.ts"),
    read(".openai/hosting.json"),
  ]);
  assert.match(page, /手動新增訂單/);
  assert.match(page, /身分證號／證件號碼/);
  assert.match(page, /備料與採購/);
  assert.match(schema, /identityHash/);
  assert.doesNotMatch(schema, /identityNumber|identityPlaintext/);
  assert.match(orders, /arrivalDate/);
  assert.match(checkin, /paymentMethodsFor/);
  assert.match(prep, /missingMappings/);
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
