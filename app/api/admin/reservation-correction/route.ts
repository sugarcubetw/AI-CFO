import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditLog, reservations } from "../../../../db/schema";
import { actorId, cleanText, intValue, jsonError } from "../../../../lib/server";
import { invalidateHomePageCache } from "../../../../lib/home-page-cache";

const CONFIRMATION = "CORRECT_RESERVATION_GUESTS";

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const reservationId = cleanText(body.reservationId);
  const expectedAdults = intValue(body.expectedAdults, -1);
  const expectedChildren = intValue(body.expectedChildren, -1);
  const adults = intValue(body.adults, -1);
  const children = intValue(body.children, -1);
  const infants = intValue(body.infants, 0);
  const reason = cleanText(body.reason);
  const specialRequests = cleanText(body.specialRequests);

  if (cleanText(body.confirmation) !== CONFIRMATION) return jsonError("缺少訂單人數更正確認碼");
  if (!reservationId || expectedAdults < 0 || expectedChildren < 0 || adults < 0 || children < 0 || infants < 0 || adults + children < 1 || !reason) {
    return jsonError("訂單、預期原人數、更正後人數及更正原因皆為必填");
  }

  const db = getDb();
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  if (!reservation) return jsonError("找不到訂單", 404);
  if (reservation.adults !== expectedAdults || reservation.children !== expectedChildren) {
    return jsonError(`訂單人數已變更（目前 ${reservation.adults} 成人、${reservation.children} 兒童），未執行更正`, 409);
  }

  await db.update(reservations).set({ adults, children, infants, specialRequests: specialRequests || reservation.specialRequests, updatedAt: new Date().toISOString() })
    .where(and(eq(reservations.id, reservationId), eq(reservations.adults, expectedAdults), eq(reservations.children, expectedChildren)));
  await db.insert(auditLog).values({
    actorId: await actorId(), action: "reservation.guest_count_corrected", objectType: "reservation", objectId: reservationId,
    detailRedacted: JSON.stringify({ reason, before: { adults: reservation.adults, children: reservation.children, infants: reservation.infants }, after: { adults, children, infants } }),
  });
  invalidateHomePageCache();
  return Response.json({ ok: true, reservationId, adults, children, infants, breakfastEstimate: adults + children });
}
