import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import {
  auditLog,
  automationJobs,
  expenses,
  financialTransactions,
  mealPrepItems,
  mealRequirements,
  mealVersions,
  meals,
  orderReconciliationItems,
  orderReconciliationRuns,
  payments,
  prepReportLines,
  prepReports,
  receptionChecklists,
  reservationEvents,
  reservations,
  rooms,
  roomTypes,
  settingOptions,
} from "../../../../db/schema";

const EXPORT_SCHEMA_VERSION = "drizzle-0007";

type ExportTables = Record<string, unknown[]>;

function configuredExportToken() {
  const values = env as unknown as Record<string, unknown>;
  const token = values.FANGTANG_EXPORT_TOKEN ?? values.EXPORT_TOKEN;
  return typeof token === "string" ? token.trim() : "";
}

function authenticatedSessionAllowed() {
  const values = env as unknown as Record<string, unknown>;
  return values.FANGTANG_EXPORT_ENABLED === "true";
}

function requestExportToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-fangtang-export-token")?.trim() ?? "";
}

function stableRows(rows: unknown[]) {
  return [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

async function readTable<T>(name: string, query: () => Promise<T[]>, missingTables: string[]) {
  try {
    return stableRows(await query());
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) {
      missingTables.push(name);
      return [];
    }
    throw error;
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const expected = configuredExportToken();
  const provided = requestExportToken(request);
  const signedInUser = request.headers.get("oai-authenticated-user-id")?.trim();
  const tokenAuthorized = Boolean(expected && provided && provided === expected);
  const sessionAuthorized = Boolean(signedInUser && authenticatedSessionAllowed());
  if (!expected && !sessionAuthorized) {
    return Response.json({ error: "匯出功能尚未設定 FANGTANG_EXPORT_TOKEN" }, { status: 503 });
  }
  if (!tokenAuthorized && !sessionAuthorized) {
    return Response.json({ error: "匯出 Token 無效" }, { status: 401 });
  }

  const db = getDb();
  const missingTables: string[] = [];
  const tables: ExportTables = {
    roomTypes: await readTable("roomTypes", () => db.select().from(roomTypes), missingTables),
    rooms: await readTable("rooms", () => db.select().from(rooms), missingTables),
    reservations: await readTable("reservations", () => db.select().from(reservations), missingTables),
    reservationEvents: await readTable("reservationEvents", () => db.select().from(reservationEvents), missingTables),
    payments: await readTable("payments", () => db.select().from(payments), missingTables),
    meals: await readTable("meals", () => db.select().from(meals), missingTables),
    mealVersions: await readTable("mealVersions", () => db.select().from(mealVersions), missingTables),
    mealPrepItems: await readTable("mealPrepItems", () => db.select().from(mealPrepItems), missingTables),
    receptionChecklists: await readTable("receptionChecklists", () => db.select().from(receptionChecklists), missingTables),
    mealRequirements: await readTable("mealRequirements", () => db.select().from(mealRequirements), missingTables),
    auditLog: await readTable("auditLog", () => db.select().from(auditLog), missingTables),
    settingOptions: await readTable("settingOptions", () => db.select().from(settingOptions), missingTables),
    automationJobs: await readTable("automationJobs", () => db.select().from(automationJobs), missingTables),
    orderReconciliationRuns: await readTable("orderReconciliationRuns", () => db.select().from(orderReconciliationRuns), missingTables),
    orderReconciliationItems: await readTable("orderReconciliationItems", () => db.select().from(orderReconciliationItems), missingTables),
    financialTransactions: await readTable("financialTransactions", () => db.select().from(financialTransactions), missingTables),
    expenses: await readTable("expenses", () => db.select().from(expenses), missingTables),
    prepReports: await readTable("prepReports", () => db.select().from(prepReports), missingTables),
    prepReportLines: await readTable("prepReportLines", () => db.select().from(prepReportLines), missingTables),
  };

  const exportedAt = new Date().toISOString();
  const counts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));
  const canonical = JSON.stringify({ schemaVersion: EXPORT_SCHEMA_VERSION, missingTables, tables });
  const payload = {
    format: "fangtang-d1-logical-backup",
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt,
    source: "fangtang-reception",
    complete: missingTables.length === 0,
    missingTables,
    counts,
    sha256: await sha256(canonical),
    tables,
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Disposition": `attachment; filename="fangtang-d1-backup-${exportedAt.replaceAll(":", "-")}.json"`,
    },
  });
}
