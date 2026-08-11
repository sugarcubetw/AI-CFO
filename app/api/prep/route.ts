import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, prepReportLines, prepReports } from "../../../db/schema";
import { actorId, cleanText, isIsoDate, jsonError } from "../../../lib/server";
import { queryPrepDemand } from "../../../lib/prep-query";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? from;
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return jsonError("日期區間無效");
  const db = getDb();
  const demand = await queryPrepDemand(from, to);
  const [latest] = await db.select().from(prepReports)
    .where(and(eq(prepReports.periodFrom, from), eq(prepReports.periodTo, to)))
    .orderBy(desc(prepReports.revision)).limit(1);
  return Response.json({ from, to, ...demand, latestReport: latest ?? null, quantitiesDeferred: true });
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const from = cleanText(body.from);
  const to = cleanText(body.to);
  const requestedType = cleanText(body.reportType, "draft");
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return jsonError("日期區間無效");
  if (!['draft', 'formal'].includes(requestedType)) return jsonError("報表類型無效");
  const db = getDb();
  const demand = await queryPrepDemand(from, to);
  const [previous] = await db.select().from(prepReports)
    .where(and(eq(prepReports.periodFrom, from), eq(prepReports.periodTo, to)))
    .orderBy(desc(prepReports.revision)).limit(1);
  const previousLines = previous ? await db.select().from(prepReportLines).where(eq(prepReportLines.reportId, previous.id)) : [];
  const revision = (previous?.revision ?? 0) + 1;
  const reportType = requestedType;
  const reportId = `prep-${from}-${to}-r${revision}-${crypto.randomUUID().slice(0, 8)}`;
  const user = await actorId();
  await db.insert(prepReports).values({ id: reportId, periodFrom: from, periodTo: to, reportType, revision, basedOnReportId: previous?.id ?? null, generatedBy: user });
  for (const row of demand.summary) {
    await db.insert(prepReportLines).values({ reportId, mealDate: row.mealDate, demandState: row.demandState, mealId: row.mealId, mealName: row.mealName, guestCount: row.guestCount });
  }
  const before = new Map(previousLines.map((line) => [`${line.mealDate}|${line.demandState}|${line.mealId ?? "unselected"}`, line.guestCount]));
  const after = new Map(demand.summary.map((line) => [`${line.mealDate}|${line.demandState}|${line.mealId ?? "unselected"}`, line.guestCount]));
  const keys = new Set([...before.keys(), ...after.keys()]);
  const differences = [...keys].map((key) => ({ key, before: before.get(key) ?? 0, after: after.get(key) ?? 0, delta: (after.get(key) ?? 0) - (before.get(key) ?? 0) })).filter((row) => row.delta !== 0);
  await db.insert(auditLog).values({ actorId: user, action: `prep_report.${reportType}`, objectType: "prep_report", objectId: reportId, detailRedacted: JSON.stringify({ from, to, revision, totals: demand.totals, differenceCount: differences.length }) });
  return Response.json({ ok: true, report: { id: reportId, reportType, revision, isRevision: Boolean(previous), basedOnReportId: previous?.id ?? null }, totals: demand.totals, differences }, { status: 201 });
}
