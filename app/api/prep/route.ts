import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, mealRequirements, meals, prepReportLines, prepReports, reservations } from "../../../db/schema";
import { actorId, cleanText, isIsoDate, jsonError } from "../../../lib/server";

type Demand = {
  reservationId: string; mealDate: string; mealTime: string; guestCount: number;
  mealId: string | null; mealName: string | null; roomNumber: string | null;
  demandState: "confirmed" | "estimated" | "unselected";
};

function breakfastDates(arrival: string, departure: string) {
  const result: string[] = [];
  const cursor = new Date(`${arrival}T00:00:00Z`);
  const stop = new Date(`${departure}T00:00:00Z`);
  for (cursor.setUTCDate(cursor.getUTCDate() + 1); cursor <= stop; cursor.setUTCDate(cursor.getUTCDate() + 1)) result.push(cursor.toISOString().slice(0, 10));
  return result;
}

async function buildDemand(from: string, to: string) {
  const db = getDb();
  const confirmedRows = await db.select({
    reservationId: mealRequirements.reservationId, mealDate: mealRequirements.mealDate,
    mealTime: mealRequirements.mealTime, guestCount: mealRequirements.guestCount,
    mealId: mealRequirements.mealId, mealName: meals.name, roomNumber: reservations.roomNumber,
  }).from(mealRequirements)
    .leftJoin(meals, eq(mealRequirements.mealId, meals.id))
    .leftJoin(reservations, eq(mealRequirements.reservationId, reservations.id))
    .where(and(gte(mealRequirements.mealDate, from), lte(mealRequirements.mealDate, to), ne(reservations.status, "cancelled")))
    .orderBy(asc(mealRequirements.mealDate), asc(mealRequirements.mealTime));

  const demands: Demand[] = confirmedRows.map((row) => ({
    ...row,
    demandState: row.mealId ? "confirmed" : "unselected",
  }));
  const existing = new Set(demands.map((row) => `${row.reservationId}|${row.mealDate}`));
  const pending = await db.select().from(reservations)
    .where(and(lte(reservations.arrivalDate, to), gte(reservations.departureDate, from), ne(reservations.status, "cancelled")));
  for (const reservation of pending) {
    for (const mealDate of breakfastDates(reservation.arrivalDate, reservation.departureDate)) {
      if (mealDate < from || mealDate > to || existing.has(`${reservation.id}|${mealDate}`)) continue;
      demands.push({
        reservationId: reservation.id, mealDate, mealTime: "待確認",
        guestCount: Math.max(0, reservation.adults + reservation.children), mealId: null,
        mealName: null, roomNumber: reservation.roomNumber, demandState: "estimated",
      });
    }
  }
  demands.sort((a, b) => a.mealDate.localeCompare(b.mealDate) || a.mealTime.localeCompare(b.mealTime));
  const summaryMap = new Map<string, { mealDate: string; demandState: string; mealId: string | null; mealName: string | null; guestCount: number }>();
  for (const row of demands) {
    const key = `${row.mealDate}|${row.demandState}|${row.mealId ?? "unselected"}`;
    const summary = summaryMap.get(key) ?? { mealDate: row.mealDate, demandState: row.demandState, mealId: row.mealId, mealName: row.mealName, guestCount: 0 };
    summary.guestCount += row.guestCount;
    summaryMap.set(key, summary);
  }
  const totals = demands.reduce((sum, row) => ({ ...sum, [row.demandState]: sum[row.demandState] + row.guestCount }), { confirmed: 0, estimated: 0, unselected: 0 });
  return { demands, summary: [...summaryMap.values()], totals };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? from;
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return jsonError("日期區間無效");
  const db = getDb();
  const demand = await buildDemand(from, to);
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
  const demand = await buildDemand(from, to);
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
