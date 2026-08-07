import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, reservations, roomTypes } from "../../../db/schema";
import { actorId, cleanText, intValue, isIsoDate, jsonError } from "../../../lib/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "1900-01-01";
  const to = url.searchParams.get("to") ?? "2999-12-31";
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return jsonError("日期區間無效");
  const db = getDb();
  const rows = await db.select({ reservation: reservations, roomTypeName: roomTypes.displayName })
    .from(reservations).leftJoin(roomTypes, eq(reservations.roomTypeId, roomTypes.id))
    .where(and(lte(reservations.arrivalDate, to), gte(reservations.departureDate, from)))
    .orderBy(asc(reservations.arrivalDate));
  return Response.json(rows.map(({ reservation, roomTypeName }) => ({ ...reservation, roomTypeName })));
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
