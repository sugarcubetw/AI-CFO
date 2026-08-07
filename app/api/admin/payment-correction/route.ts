import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditLog, payments, reservations } from "../../../../db/schema";
import { actorId, cleanText, intValue, jsonError } from "../../../../lib/server";

const CONFIRMATION = "VOID_DUPLICATE_BALANCE_PAYMENT";

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const reservationId = cleanText(body.reservationId);
  const expectedReceivedAmount = intValue(body.expectedReceivedAmount, -1);
  const correctedReceivedAmount = intValue(body.correctedReceivedAmount, -1);
  const reason = cleanText(body.reason);

  if (cleanText(body.confirmation) !== CONFIRMATION) return jsonError("缺少付款更正確認碼");
  if (!reservationId || expectedReceivedAmount < 0 || correctedReceivedAmount < 0 || !reason) {
    return jsonError("訂單、原實收金額、更正後實收金額及原因皆為必填");
  }

  const db = getDb();
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  if (!reservation) return jsonError("找不到訂單", 404);
  if (reservation.receivedAmount !== expectedReceivedAmount) {
    return jsonError(`訂單實收金額已變更（目前 ${reservation.receivedAmount} 元），未執行更正`, 409);
  }
  if (correctedReceivedAmount > reservation.totalAmount || correctedReceivedAmount >= reservation.receivedAmount) {
    return jsonError("更正後實收金額必須低於目前實收，且不可超過訂單總額");
  }

  const correctionAmount = reservation.receivedAmount - correctedReceivedAmount;
  const [duplicatePayment] = await db.select().from(payments)
    .where(and(eq(payments.reservationId, reservationId), eq(payments.stage, "balance"), eq(payments.status, "confirmed")))
    .orderBy(desc(payments.id)).limit(1);
  if (!duplicatePayment || duplicatePayment.amount !== correctionAmount) {
    return jsonError("找不到與更正差額相符的已確認尾款，未執行更正", 409);
  }

  const user = await actorId();
  const correctedBalance = Math.max(0, reservation.totalAmount - correctedReceivedAmount);
  const correctedStatus = correctedBalance === 0 ? "paid" : correctedReceivedAmount > 0 ? "partial" : "pending";
  const now = new Date().toISOString();

  await db.update(payments).set({ status: "voided" }).where(eq(payments.id, duplicatePayment.id));
  await db.update(reservations).set({
    receivedAmount: correctedReceivedAmount,
    balanceAmount: correctedBalance,
    paymentStatus: correctedStatus,
    updatedAt: now,
  }).where(and(eq(reservations.id, reservationId), eq(reservations.receivedAmount, expectedReceivedAmount)));
  await db.insert(auditLog).values({
    actorId: user,
    action: "payment.duplicate_voided",
    objectType: "reservation",
    objectId: reservationId,
    detailRedacted: JSON.stringify({
      reason,
      paymentId: duplicatePayment.id,
      voidedAmount: duplicatePayment.amount,
      receivedAmountBefore: reservation.receivedAmount,
      receivedAmountAfter: correctedReceivedAmount,
    }),
  });

  return Response.json({
    ok: true,
    reservationId,
    voidedPaymentId: duplicatePayment.id,
    voidedAmount: duplicatePayment.amount,
    receivedAmount: correctedReceivedAmount,
    balanceAmount: correctedBalance,
    paymentStatus: correctedStatus,
  });
}
