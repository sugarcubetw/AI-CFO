#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

function loadEnv() {
  const envFile = resolve(process.env.OWLNEST_ENV_FILE ?? ".env.owlnest-agent");
  try {
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch { /* The caller may provide variables directly. */ }
}

export async function postGmailMessages(messages) {
  loadEnv();
  const site = process.env.OPS_SITE_URL ?? "https://fangtang-mobile-reception.dk8515.chatgpt.site";
  const token = process.env.OPS_SITE_BYPASS_TOKEN ?? "";
  const response = await fetch(new URL("/api/import/gmail", site), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "OAI-Sites-Authorization": `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
  });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); }
  catch { throw new Error(`工作台未回傳 JSON（HTTP ${response.status}）：${raw.slice(0, 160)}`); }
  if (!response.ok) throw new Error(body?.error ?? `工作台匯入失敗（HTTP ${response.status}）`);
  return body;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const input = process.argv[2];
  if (!input) throw new Error("用法：pnpm run gmail:post -- /absolute/path/messages.json");
  const payload = JSON.parse(await readFile(resolve(input), "utf8"));
  const messages = Array.isArray(payload) ? payload : payload.messages;
  if (!Array.isArray(messages) || messages.length === 0) throw new Error("輸入檔必須包含 messages 陣列");
  const result = await postGmailMessages(messages);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
