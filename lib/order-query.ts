import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import { meals, receptionChecklists, reservations, roomTypes } from "../db/schema";

export async function queryOrders(from: string, to: string) {
  const db = getDb();
  const rows = await db.select({
    reservation: reservations,
    roomTypeName: roomTypes.displayName,
    actualGuests: receptionChecklists.actualGuests,
    identityVerified: receptionChecklists.identityVerified,
    breakfastTime: receptionChecklists.breakfastTime,
    breakfastCount: receptionChecklists.breakfastCount,
    mealId: receptionChecklists.mealId,
    mealName: meals.name,
    checkinNotes: receptionChecklists.notes,
    checkedInAt: receptionChecklists.completedAt,
  })
    .from(reservations).leftJoin(roomTypes, eq(reservations.roomTypeId, roomTypes.id))
    .leftJoin(receptionChecklists, eq(reservations.id, receptionChecklists.reservationId))
    .leftJoin(meals, eq(receptionChecklists.mealId, meals.id))
    .where(and(lte(reservations.arrivalDate, to), gte(reservations.departureDate, from)))
    .orderBy(asc(reservations.arrivalDate));
  return rows.map(({ reservation, ...checkin }) => ({ ...reservation, ...checkin }));
}
