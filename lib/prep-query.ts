import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { getDb } from "../db";
import { mealRequirements, meals, reservations } from "../db/schema";

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

export async function queryPrepDemand(from: string, to: string) {
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

  const demands: Demand[] = confirmedRows.map((row) => ({ ...row, demandState: row.mealId ? "confirmed" : "unselected" }));
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
