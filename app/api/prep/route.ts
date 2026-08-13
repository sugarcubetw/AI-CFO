import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, mealRequirements, meals, prepReportLines, prepReports, reservations } from "../../../db/schema";
import { actorId, cleanText, isIsoDate, jsonError } from "../../../lib/server";
import { queryPrepDemand } from "../../../lib/prep-query";
import { invalidateHomePageCache } from "../../../lib/home-page-cache";

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

export async function PATCH(request: Request) {
  const body = await request.json() as { from?: unknown; to?: unknown; items?: unknown };
  const from = cleanText(body.from);
  const to = cleanText(body.to);
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return jsonError("日期區間無效");
  if (!Array.isArray(body.items)) return jsonError("餐點安排格式無效");
  const db = getDb();
  const user = await actorId();
  const changes = body.items as Array<{ reservationId?: unknown; mealDate?: unknown; mealTime?: unknown; mealId?: unknown }>;
  for (const change of changes) {
    const reservationId = cleanText(change.reservationId);
    const mealDate = cleanText(change.mealDate);
    const mealTime = cleanText(change.mealTime, "待確認");
    const mealId = cleanText(change.mealId) || null;
    if (!reservationId || !isIsoDate(mealDate) || mealDate < from || mealDate > to) return jsonError("餐點安排日期無效");
    const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
    if (!reservation || reservation.status === "cancelled") return jsonError("找不到可安排的住宿訂單");
    if (mealDate <= reservation.arrivalDate || mealDate > reservation.departureDate) return jsonError("餐點日期不在住宿期間");
    const guestCount = Math.max(0, reservation.adults + reservation.children);
    if (mealId) {
      const [meal] = await db.select().from(meals).where(and(eq(meals.id, mealId), eq(meals.isActive, true))).limit(1);
      if (!meal) return jsonError("餐點不存在或已停用");
      await db.insert(mealRequirements).values({ reservationId, mealDate, mealTime, guestCount, mealId })
        .onConflictDoUpdate({ target: [mealRequirements.reservationId, mealRequirements.mealDate], set: { mealTime, guestCount, mealId, notes: null } });
    } else {
      await db.delete(mealRequirements).where(and(eq(mealRequirements.reservationId, reservationId), eq(mealRequirements.mealDate, mealDate)));
    }
  }
  await db.insert(auditLog).values({ actorId: user, action: "prep.meals_scheduled", objectType: "prep", objectId: `${from}:${to}`, detailRedacted: JSON.stringify({ from, to, count: changes.length }) });
  invalidateHomePageCache();
  const demand = await queryPrepDemand(from, to);
  return Response.json({ ok: true, from, to, ...demand });
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
