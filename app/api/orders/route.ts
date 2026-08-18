import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, mealRequirements, reservationEvents, reservationRooms, reservations } from "../../../db/schema";
import { actorId, cleanText, intValue, isIsoDate, jsonError } from "../../../lib/server";
import { invalidateHomePageCache } from "../../../lib/home-page-cache";
import { getCalendarOrders } from "../../../lib/calendar-cache";

/**
 * A room can only have one active reservation for an overlapping stay.
 * Keep this check on the server so manual entry, imports, and future clients
 * all receive the same protection (the UI check is only a convenience).
 */
async function findRoomConflict(
  db: ReturnType<typeof getDb>,
  roomNumber: string | null,
  arrivalDate: string,
  departureDate: string,
  excludeId?: string,
) {
  if (!roomNumber) return null;
  const candidates = await db.select({
    id: reservations.id,
    status: reservations.status,
    arrivalDate: reservations.arrivalDate,
    departureDate: reservations.departureDate,
    guestName: reservations.guestName,
  }).from(reservations).where(eq(reservations.roomNumber, roomNumber));
  const allocatedCandidates = await db.select({ reservationId: reservationRooms.reservationId }).from(reservationRooms).where(eq(reservationRooms.roomNumber, roomNumber));
  const allocatedIds = new Set(allocatedCandidates.map((candidate) => candidate.reservationId));
  const multiRoomCandidates = allocatedIds.size
    ? await db.select({
      id: reservations.id,
      status: reservations.status,
      arrivalDate: reservations.arrivalDate,
      departureDate: reservations.departureDate,
      guestName: reservations.guestName,
    }).from(reservations).where(inArray(reservations.id, Array.from(allocatedIds)))
    : [];
  const allCandidates = [...candidates, ...multiRoomCandidates.filter((candidate) => !candidates.some((item) => item.id === candidate.id))];
  return allCandidates.find((candidate) =>
    candidate.id !== excludeId &&
    candidate.status !== "cancelled" &&
    candidate.arrivalDate < departureDate &&
    candidate.departureDate > arrivalDate,
  ) ?? null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "1900-01-01";
  const to = url.searchParams.get("to") ?? "2999-12-31";
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return jsonError("日期區間無效");
  return Response.json(await getCalendarOrders(from, to));
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
  const roomNumber = cleanText(body.roomNumber) || null;
  const roomConflict = await findRoomConflict(db, roomNumber, arrivalDate, departureDate);
  if (roomConflict) {
    return jsonError(`房號 ${roomNumber} 在 ${roomConflict.arrivalDate}～${roomConflict.departureDate} 已有訂單（${roomConflict.guestName}），請改選房號或日期`, 409);
  }
  await db.insert(reservations).values({
    id, sourceSystem: "manual", sourceChannel, status: "pending", guestName,
    arrivalDate, departureDate, roomTypeId: cleanText(body.roomTypeId) || null,
    roomNumber, adults: Math.max(1, intValue(body.adults, 1)),
    totalAmount, receivedAmount, balanceAmount: Math.max(0, totalAmount - receivedAmount),
    paymentStatus: receivedAmount >= totalAmount && totalAmount > 0 ? "paid" : receivedAmount > 0 ? "deposit_paid" : "pending",
    specialRequests: cleanText(body.specialRequests) || null, importState: "confirmed",
  });
  await db.insert(auditLog).values({ actorId: await actorId(), action: "reservation.created", objectType: "reservation", objectId: id });
  invalidateHomePageCache();
  return Response.json({ ok: true, id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const id = cleanText(body.id);
  const action = cleanText(body.action);
  const reason = cleanText(body.reason);
  const db = getDb();
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  if (!reservation) return jsonError("找不到訂單", 404);

  if (action === "update") {
    if (reservation.status !== "pending") return jsonError("只有待入住訂單可由訂單頁修改", 409);
    const adults = intValue(body.adults, -1);
    const children = intValue(body.children, -1);
    if (adults < 1 || children < 0) return jsonError("成人至少 1 位，兒童不可小於 0");
    const specialRequests = cleanText(body.specialRequests) || null;
    const requestedRoomTypeId = cleanText(body.roomTypeId);
    const requestedRoomNumber = cleanText(body.roomNumber);
    const roomTypeId = requestedRoomTypeId || reservation.roomTypeId;
    const roomNumber = requestedRoomNumber || reservation.roomNumber;
    const roomConflict = await findRoomConflict(db, roomNumber, reservation.arrivalDate, reservation.departureDate, id);
    if (roomConflict) {
      return jsonError(`房號 ${roomNumber} 在 ${roomConflict.arrivalDate}～${roomConflict.departureDate} 已有訂單（${roomConflict.guestName}），請改選房號`, 409);
    }
    const user = await actorId();
    await db.update(reservations).set({ adults, children, roomTypeId, roomNumber, specialRequests, importState: "confirmed", updatedAt: new Date().toISOString() }).where(eq(reservations.id, id));
    await db.insert(auditLog).values({
      actorId: user, action: "reservation.updated_manually", objectType: "reservation", objectId: id,
      detailRedacted: JSON.stringify({ before: { adults: reservation.adults, children: reservation.children, roomTypeId: reservation.roomTypeId, roomNumber: reservation.roomNumber }, after: { adults, children, roomTypeId, roomNumber }, notesUpdated: specialRequests !== reservation.specialRequests }),
    });
    invalidateHomePageCache();
    return Response.json({ ok: true, id, status: "updated", adults, children });
  }

  if (action !== "cancel") return jsonError("不支援的訂單操作");
  if (!id || !reason) return jsonError("訂單編號與取消原因為必填");
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
  invalidateHomePageCache();
  return Response.json({ ok: true, id, status: "cancelled" });
}
