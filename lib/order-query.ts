import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../db";
import { meals, receptionChecklists, reservationRooms, reservations, roomTypes } from "../db/schema";
import { estimatedGuestCount, hasVerifiedGuestCount } from "./guest-count";

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
  const roomRows = rows.length
    ? await db.select().from(reservationRooms).where(inArray(reservationRooms.reservationId, rows.map(({ reservation }) => reservation.id)))
    : [];
  const roomsByReservation = new Map<string, typeof roomRows>();
  for (const roomRow of roomRows) roomsByReservation.set(roomRow.reservationId, [...(roomsByReservation.get(roomRow.reservationId) ?? []), roomRow]);
  return rows.map(({ reservation, ...checkin }) => {
    const allocations = roomsByReservation.get(reservation.id) ?? [];
    const roomNumbers = allocations.length ? allocations.map((room) => room.roomNumber) : reservation.roomNumber ? [reservation.roomNumber] : [];
    const guestCountKnown = checkin.actualGuests !== null || hasVerifiedGuestCount(reservation.sourceSystem, reservation.importState);
    return {
      ...reservation,
      ...checkin,
      roomNumbers,
      roomLabel: roomNumbers.join("／") || "未分房",
      roomAllocations: allocations.map((room) => ({ roomNumber: room.roomNumber, allocatedAmount: room.allocatedAmount, allocationMethod: room.allocationMethod })),
      guestCountKnown,
      displayGuestCount: checkin.actualGuests ?? (guestCountKnown
        ? reservation.adults + reservation.children
        : estimatedGuestCount(reservation.roomNumber, reservation.specialRequests)),
    };
  });
}
