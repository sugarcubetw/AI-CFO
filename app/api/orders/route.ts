import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, mealRequirements, meals, receptionChecklists, reservationEvents, reservations, roomTypes } from "../../../db/schema";
import { actorId, cleanText, intValue, isIsoDate, jsonError } from "../../../lib/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "1900-01-01";
  const to = url.searchParams.get("to") ?? "2999-12-31";
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return jsonError("日期區間無效");
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
  return Response.json(rows.map(({ reservation, ...checkin }) => ({ ...reservation, ...checkin })));
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const arrivalDate = cleanText(body.arrivalDate);
  const departureDate = cleanText(body.departureDate);
  if (!isIsoDate(arrivalDate) || !isIsoDate(departureDate) || arrivalDate >= departureDate) return jsonError("住宿日期無效");
  const id = cleanText(body.id) || `MAN-${crypto.randomUUID()}`;
  const guestName = cleanText(body.guestName);
  const sourceChannel = cleanText(body.sourceChannel);
  if (!guestName || !sourceChannel) return jsonError("旅客姓名與來源為必填");
  const totalAmount = intValue(body.totalAmount);
  const receivedAmount = intValue(body.receivedAmount);
  const db = getDb();
  await db.insert(reservations).values({
    id, sourceSystem: "manual", sourceChannel, status: "pending", guestName,
    arrivalDate, departureDate, roomTypeId: cleanText(body.roomTypeId) || null,
    roomNumber: cleanText(body.roomNumber) || null, adults: Math.max(1, intValue(body.adults, 1)),
    totalAmount, receivedAmount, balanceAmount: Math.max(0, totalAmount - receivedAmount),
    paymentStatus: receivedAmount >= totalAmount && totalAmount > 0 ? "paid" : receivedAmount > 0 ? "deposit_paid" : "pending",
    specialRequests: cleanText(body.specialRequests) || null, importState: "confirmed",
  });
  await db.insert(auditLog).values({ actorId: await actorId(), action: "reservation.created", objectType: "reservation", objectId: id });
  return Response.json({ ok: true, id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const id = cleanText(body.id);
  const action = cleanText(body.action);
  const reason = cleanText(body.reason);
  if (action !== "cancel") return jsonError("不支援的訂單操作");
  if (!id || !reason) return jsonError("訂單編號與取消原因為必填");

  const db = getDb();
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  if (!reservation) return jsonError("找不到訂單", 404);
  if (reservation.status === "checked_in") return jsonError("已入住訂單不可直接取消，請由管理者進行資料修正", 409);
  if (reservation.status === "cancelled") return Response.json({ ok: true, id, status: "already_cancelled" });

  const occurredAt = new Date().toISOString();
  const user = await actorId();
  await db.update(reservations).set({ status: "cancelled", eventType: "cancelled", importState: "confirmed", updatedAt: occurredAt }).where(eq(reservations.id, id));
  await db.delete(mealRequirements).where(eq(mealRequirements.reservationId, id));
  await db.insert(reservationEvents).values({
    reservationId: id,
    eventType: "cancelled",
    eventHash: `manual-cancel-${crypto.randomUUID()}`,
    occurredAt,
    payloadRedacted: JSON.stringify({ source: "manual", reason }),
  });
  await db.insert(auditLog).values({
    actorId: user,
    action: "reservation.cancelled_manually",
    objectType: "reservation",
    objectId: id,
    detailRedacted: JSON.stringify({ reason, priorStatus: reservation.status }),
  });
  return Response.json({ ok: true, id, status: "cancelled" });
}
