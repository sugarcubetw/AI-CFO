import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { reservationEvents, reservations, roomTypes } from "../../../db/schema";
import { eventHash, ImportedOrder, redactImport } from "../../../lib/import-orders";
import { cleanText, isIsoDate, jsonError } from "../../../lib/server";

export async function POST(request: Request) {
  const payload = await request.json() as { orders?: ImportedOrder[] };
  if (!Array.isArray(payload.orders) || payload.orders.length === 0 || payload.orders.length > 50) return jsonError("orders 必須包含 1–50 筆");
  const db = getDb();
  const roomRows = await db.select().from(roomTypes);
  const result = { received: payload.orders.length, inserted: 0, updated: 0, duplicates: 0, errors: [] as { orderId?: string; reason: string }[] };
  for (const order of payload.orders) {
    try {
      if (!cleanText(order.orderId) || !cleanText(order.messageId) || !isIsoDate(order.arrivalDate) || !isIsoDate(order.departureDate)) throw new Error("必要欄位或日期無效");
      const hash = await eventHash(order);
      const [priorEvent] = await db.select({ id: reservationEvents.id }).from(reservationEvents).where(eq(reservationEvents.eventHash, hash)).limit(1);
      if (priorEvent) { result.duplicates += 1; continue; }
      const [existing] = await db.select().from(reservations).where(eq(reservations.id, order.orderId)).limit(1);
      const roomType = roomRows.find((row) => row.sourceName === order.roomTypeName);
      const status = order.eventType === "cancelled" ? "cancelled" : "pending";
      const values = {
        sourceSystem: "owlting_gmail", sourceChannel: order.sourceChannel, otaExternalId: order.otaExternalId ?? null,
        eventType: order.eventType, status, guestName: order.guestName || "待確認", guestContactMasked: order.guestContactMasked ?? null,
        arrivalDate: order.arrivalDate, departureDate: order.departureDate, roomTypeId: roomType?.id ?? null,
        roomNumber: roomType?.defaultRoomNumber ?? null, adults: Math.max(1, order.adults || 1), children: Math.max(0, order.children ?? 0), infants: Math.max(0, order.infants ?? 0),
        totalAmount: Math.round(order.totalAmount || 0), receivedAmount: Math.round(order.receivedAmount || 0), balanceAmount: Math.round(order.balanceAmount || 0),
        paymentMethod: order.paymentMethod ?? null, paymentStatus: order.paymentStatus ?? "pending", specialRequests: order.specialRequests ?? null,
        importState: "pending_review", sourceMessageId: order.messageId, updatedAt: new Date().toISOString(),
      };
      if (existing) { await db.update(reservations).set(values).where(eq(reservations.id, order.orderId)); result.updated += 1; }
      else { await db.insert(reservations).values({ id: order.orderId, ...values }); result.inserted += 1; }
      await db.insert(reservationEvents).values({ reservationId: order.orderId, eventType: order.eventType, eventHash: hash, sourceMessageId: order.messageId, occurredAt: order.occurredAt, payloadRedacted: redactImport(order) });
    } catch (error) {
      result.errors.push({ orderId: order.orderId, reason: error instanceof Error ? error.message : "未知錯誤" });
    }
  }
  return Response.json(result, { status: result.errors.length === result.received ? 400 : 200 });
}
