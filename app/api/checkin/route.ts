import { and, eq, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, mealRequirements, payments, receptionChecklists, reservations, settingOptions } from "../../../db/schema";
import { breakfastTimes, paymentMethodsFor } from "../../../lib/base-data";
import { actorId, cleanText, intValue, isIsoDate, jsonError } from "../../../lib/server";
import { notifyDailyCheckinComplete } from "../../../lib/line-daily-checkin";
import { invalidateHomePageCache } from "../../../lib/home-page-cache";

async function identityFingerprint(value: string) {
  if (!value) return { hash: null, last4: null };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.toUpperCase()));
  const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { hash, last4: value.slice(-4) };
}

function datesBetween(start: string, end: string) {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  for (cursor.setUTCDate(cursor.getUTCDate() + 1); cursor <= stop; cursor.setUTCDate(cursor.getUTCDate() + 1)) result.push(cursor.toISOString().slice(0, 10));
  return result;
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const reservationId = cleanText(body.reservationId);
  const db = getDb();
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  if (!reservation) return jsonError("找不到訂單", 404);
  if (reservation.status === "cancelled") return jsonError("取消訂單不可辦理入住");
  const breakfastTime = cleanText(body.breakfastTime);
  const configuredBreakfast = await db.select().from(settingOptions).where(and(eq(settingOptions.category, "breakfast_time"), eq(settingOptions.isActive, true)));
  const allowedBreakfast = configuredBreakfast.length ? configuredBreakfast.map((item) => item.label) : [...breakfastTimes];
  if (!allowedBreakfast.includes(breakfastTime)) return jsonError("早餐時間無效");
  const breakfastCount = breakfastTime === "不用餐" ? 0 : Math.max(0, intValue(body.breakfastCount));
  const actualGuests = Math.max(1, intValue(body.actualGuests, reservation.adults + reservation.children));
  const method = cleanText(body.paymentMethod);
  const configuredPayments = await db.select().from(settingOptions).where(and(eq(settingOptions.category, "payment_method"), eq(settingOptions.isActive, true), or(eq(settingOptions.scope, "*"), eq(settingOptions.scope, reservation.sourceChannel))));
  const allowedPayments = configuredPayments.length ? configuredPayments.map((item) => item.label) : paymentMethodsFor(reservation.sourceChannel);
  if (method && !allowedPayments.includes(method)) return jsonError("此訂單來源不支援該付款方式");
  const balancePaid = Math.max(0, intValue(body.balancePaid));
  if (balancePaid > reservation.balanceAmount) {
    return jsonError(`本次實收尾款不可超過目前未收金額（${reservation.balanceAmount} 元）；若只是修改入住資料，請將尾款填 0`);
  }
  const identity = cleanText(body.identity);
  const fingerprint = await identityFingerprint(identity);
  const user = await actorId();
  const [existingChecklist] = await db.select().from(receptionChecklists).where(eq(receptionChecklists.reservationId, reservationId)).limit(1);
  const identityHash = fingerprint.hash ?? existingChecklist?.identityHash ?? null;
  const identityLast4 = fingerprint.last4 ?? existingChecklist?.identityLast4 ?? null;

  await db.insert(receptionChecklists).values({
    reservationId, actualGuests, identityHash, identityLast4,
    identityVerified: Boolean(body.identityVerified), breakfastTime, breakfastCount,
    mealId: cleanText(body.mealId) || null, notes: cleanText(body.notes) || null, completedBy: user,
  }).onConflictDoUpdate({ target: receptionChecklists.reservationId, set: {
    actualGuests, identityHash, identityLast4,
    identityVerified: Boolean(body.identityVerified), breakfastTime, breakfastCount,
    mealId: cleanText(body.mealId) || null, notes: cleanText(body.notes) || null, completedBy: user,
    completedAt: new Date().toISOString(),
  }});
  if (balancePaid > 0) await db.insert(payments).values({ reservationId, stage: "balance", amount: balancePaid, method, status: "confirmed", confirmedBy: user, confirmedAt: new Date().toISOString() });
  if (breakfastCount > 0) {
    for (const mealDate of datesBetween(reservation.arrivalDate, reservation.departureDate)) {
      if (!isIsoDate(mealDate)) continue;
      await db.insert(mealRequirements).values({ reservationId, mealDate, mealTime: breakfastTime, guestCount: breakfastCount, mealId: cleanText(body.mealId) || null, notes: cleanText(body.notes) || null })
        .onConflictDoUpdate({ target: [mealRequirements.reservationId, mealRequirements.mealDate], set: { mealTime: breakfastTime, guestCount: breakfastCount, mealId: cleanText(body.mealId) || null, notes: cleanText(body.notes) || null } });
    }
  } else await db.delete(mealRequirements).where(eq(mealRequirements.reservationId, reservationId));
  await db.update(reservations).set({ status: "checked_in", receivedAmount: reservation.receivedAmount + balancePaid, balanceAmount: Math.max(0, reservation.balanceAmount - balancePaid), paymentMethod: method || reservation.paymentMethod, paymentStatus: balancePaid >= reservation.balanceAmount ? "paid" : reservation.paymentStatus, updatedAt: new Date().toISOString() }).where(eq(reservations.id, reservationId));
  await db.insert(auditLog).values({ actorId: user, action: "reservation.checked_in", objectType: "reservation", objectId: reservationId, detailRedacted: JSON.stringify({ actualGuests, breakfastTime, breakfastCount, identityStored: Boolean(identityHash), identityUpdated: Boolean(fingerprint.hash), balancePaid }) });
  invalidateHomePageCache();
  const notification = await notifyDailyCheckinComplete(reservation.arrivalDate, { actorId: user });
  return Response.json({ ok: true, reservationId, mealDates: breakfastCount > 0 ? datesBetween(reservation.arrivalDate, reservation.departureDate) : [], notification: notification.status });
}
