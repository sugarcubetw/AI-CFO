import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { reservationEvents, reservations, roomTypes } from "../../../db/schema";
import { eventHash, ImportedOrder, redactImport } from "../../../lib/import-orders";
import { cleanText, isIsoDate, jsonError } from "../../../lib/server";
import { invalidateHomePageCache } from "../../../lib/home-page-cache";

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
      const preserveManual = existing?.importState === "confirmed";
      const guestValues = !preserveManual && (!existing || order.guestCountProvided !== false) ? {
        adults: Math.max(1, order.adults || 1), children: Math.max(0, order.children ?? 0), infants: Math.max(0, order.infants ?? 0),
      } : {};
      const values = {
        sourceSystem: existing && order.guestCountProvided === false ? existing.sourceSystem : "owlting_gmail", sourceChannel: order.sourceChannel, otaExternalId: order.otaExternalId ?? null,
        eventType: order.eventType, status, guestName: order.guestName || "待確認", guestContactMasked: order.guestContactMasked ?? null,
        arrivalDate: order.arrivalDate, departureDate: order.departureDate, roomTypeId: roomType?.id ?? null,
        roomNumber: roomType?.defaultRoomNumber ?? null, ...guestValues,
        totalAmount: Math.round(order.totalAmount || 0), receivedAmount: Math.round(order.receivedAmount || 0), balanceAmount: Math.round(order.balanceAmount || 0),
        paymentMethod: order.paymentMethod ?? null, paymentStatus: order.paymentStatus ?? "pending",
        specialRequests: preserveManual ? existing.specialRequests : [order.specialRequests, order.parseWarnings?.length ? `系統警示：${order.parseWarnings.join(",")}` : null].filter(Boolean).join("\n") || null,
        importState: preserveManual ? "confirmed" : "pending_review", sourceMessageId: order.messageId, updatedAt: new Date().toISOString(),
      };
      if (existing) { await db.update(reservations).set(values).where(eq(reservations.id, order.orderId)); result.updated += 1; }
      else { await db.insert(reservations).values({ id: order.orderId, ...values }); result.inserted += 1; }
      await db.insert(reservationEvents).values({ reservationId: order.orderId, eventType: order.eventType, eventHash: hash, sourceMessageId: order.messageId, occurredAt: order.occurredAt, payloadRedacted: redactImport(order) });
    } catch (error) {
      result.errors.push({ orderId: order.orderId, reason: error instanceof Error ? error.message : "未知錯誤" });
    }
  }
  if (result.inserted > 0 || result.updated > 0) invalidateHomePageCache();
  return Response.json(result, { status: result.errors.length === result.received ? 400 : 200 });
}
