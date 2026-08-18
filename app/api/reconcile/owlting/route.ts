import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditLog, orderReconciliationItems, orderReconciliationRuns, reservationRooms, reservations, roomTypes } from "../../../../db/schema";
import { parseOwlNestOrderList, OwlNestOrderListRow } from "../../../../lib/owlting-order-list-parser";
import { actorId, cleanText, isIsoDate, jsonError } from "../../../../lib/server";
import { invalidateHomePageCache } from "../../../../lib/home-page-cache";
import { estimatedGuestCount } from "../../../../lib/guest-count";

type ReconcilePayload = {
  content?: string;
  rows?: OwlNestOrderListRow[];
  periodFrom?: string;
  periodTo?: string;
  sourceExportedAt?: string;
  notes?: string;
};

const comparable = ["arrivalDate", "departureDate", "guestName", "roomTypeName", "totalAmount", "receivedAmount", "balanceAmount", "sourceChannel", "otaExternalId", "paymentMethod", "paymentStatus"] as const;

function difference(existing: typeof reservations.$inferSelect, incoming: OwlNestOrderListRow, roomTypeName: string | null) {
  const values: Record<string, { before: unknown; after: unknown }> = {};
  const current = { ...existing, roomTypeName };
  for (const field of comparable) {
    const before = current[field];
    const after = field === "roomTypeName" ? incoming.roomTypeName : incoming[field];
    if (String(before ?? "") !== String(after ?? "")) values[field] = { before, after };
  }
  return values;
}

function splitAmount(amount: number, count: number) {
  if (count <= 0) return [];
  const base = Math.floor(amount / count);
  const remainder = amount - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

async function hashContent(content: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? 5)));
  const db = getDb();
  const runs = await db.select().from(orderReconciliationRuns).orderBy(asc(orderReconciliationRuns.startedAt)).limit(limit);
  const latest = runs.at(-1) ?? null;
  const items = latest ? await db.select().from(orderReconciliationItems).where(eq(orderReconciliationItems.runId, latest.id)) : [];
  return Response.json({ latest, runs: runs.reverse(), items });
}

export async function POST(request: Request) {
  const body = await request.json() as ReconcilePayload;
  const periodFrom = cleanText(body.periodFrom);
  const periodTo = cleanText(body.periodTo);
  if (!isIsoDate(periodFrom) || !isIsoDate(periodTo) || periodFrom > periodTo) return jsonError("入住區間無效");
  const parsed = Array.isArray(body.rows) ? { rows: body.rows, errors: [], warnings: [] } : parseOwlNestOrderList(cleanText(body.content));
  // Older clients may send only the legacy primary room; normalize that shape
  // before conflict checks and multi-room allocation writes.
  for (const row of parsed.rows) row.roomNumbers = row.roomNumbers?.length ? row.roomNumbers : row.roomNumber ? [row.roomNumber] : [];
  if (!parsed.rows.length) return Response.json({ error: "找不到可匯入的 OwlNest 訂單列", errors: parsed.errors, warnings: parsed.warnings }, { status: 400 });
  if (parsed.rows.length > 2000) return jsonError("單次最多匯入 2,000 筆");
  const invalid = parsed.rows.filter((row) => !isIsoDate(row.arrivalDate) || !isIsoDate(row.departureDate) || row.arrivalDate >= row.departureDate);
  if (invalid.length) return Response.json({ error: "訂單日期格式無效", invalid: invalid.slice(0, 20).map((row) => row.orderId) }, { status: 400 });
  const db = getDb();
  const startedAt = new Date().toISOString();
  const runId = `reconcile-${startedAt.replace(/[^0-9]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
  const contentHash = await hashContent(body.content ?? JSON.stringify(body.rows));
  const roomRows = await db.select().from(roomTypes);
  const existingRows = await db.select().from(reservations).where(and(lte(reservations.arrivalDate, periodTo), gte(reservations.departureDate, periodFrom)));
  const existingRoomRows = existingRows.length
    ? await db.select().from(reservationRooms).where(inArray(reservationRooms.reservationId, existingRows.map((row) => row.id)))
    : [];
  const roomsByReservation = new Map<string, string[]>();
  for (const row of existingRows) {
    const allocated = existingRoomRows.filter((room) => room.reservationId === row.id).map((room) => room.roomNumber);
    roomsByReservation.set(row.id, allocated.length ? allocated : row.roomNumber ? [row.roomNumber] : []);
  }
  const conflicts: Array<{ orderId: string; incomingRooms: string[]; existingOrderId: string; existingRooms: string[]; arrivalDate: string; departureDate: string }> = [];
  for (const incoming of parsed.rows) {
    const incomingRooms = incoming.roomNumbers;
    for (const existing of existingRows) {
      if (existing.id === incoming.orderId || existing.status === "cancelled") continue;
      if (!(existing.arrivalDate < incoming.departureDate && existing.departureDate > incoming.arrivalDate)) continue;
      const existingRooms = roomsByReservation.get(existing.id) ?? [];
      if (incomingRooms.some((room) => existingRooms.includes(room))) {
        conflicts.push({ orderId: incoming.orderId, incomingRooms, existingOrderId: existing.id, existingRooms, arrivalDate: existing.arrivalDate, departureDate: existing.departureDate });
      }
    }
  }
  // Also reject two different rows in the same export claiming the same room
  // for overlapping dates. This prevents a single batch from creating an
  // internal double booking even when the database had no prior conflict.
  for (let index = 0; index < parsed.rows.length; index += 1) {
    const incoming = parsed.rows[index];
    for (let priorIndex = 0; priorIndex < index; priorIndex += 1) {
      const prior = parsed.rows[priorIndex];
      if (!(prior.arrivalDate < incoming.departureDate && prior.departureDate > incoming.arrivalDate)) continue;
      if (!incoming.roomNumbers.some((room) => prior.roomNumbers.includes(room))) continue;
      conflicts.push({
        orderId: incoming.orderId,
        incomingRooms: incoming.roomNumbers,
        existingOrderId: prior.orderId,
        existingRooms: prior.roomNumbers,
        arrivalDate: prior.arrivalDate,
        departureDate: prior.departureDate,
      });
    }
  }
  if (conflicts.length) {
    return Response.json({ error: "房號在入住期間已有重疊訂單，未匯入任何資料", conflicts: conflicts.slice(0, 20) }, { status: 409 });
  }
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const itemValues: Array<typeof orderReconciliationItems.$inferInsert> = [];
  let matchedCount = 0;
  let insertedCount = 0;
  let changedCount = 0;
  let duplicateCount = 0;
  for (const row of parsed.rows) {
    if (seen.has(row.orderId)) { duplicateCount += 1; itemValues.push({ runId, orderId: row.orderId, action: "duplicate_in_export", differenceJson: null, sourceRowJson: JSON.stringify(row.raw) }); continue; }
    seen.add(row.orderId);
    const roomType = roomRows.find((candidate) => candidate.sourceName === row.roomTypeName || candidate.displayName === row.roomTypeName);
    const existing = existingById.get(row.orderId);
    if (!existing) {
      const roomNumbers = row.roomNumbers;
      const primaryRoom = roomNumbers[0] ?? roomType?.defaultRoomNumber ?? row.roomNumber ?? null;
      const actualAdults = row.adults ?? (row.roomNumbers.length > 1
        ? row.roomNumbers.reduce((total, number) => total + estimatedGuestCount(number), 0)
        : estimatedGuestCount(primaryRoom));
      const actualChildren = row.children ?? 0;
      const actualInfants = row.infants ?? 0;
      const roomAmounts = splitAmount(row.totalAmount, roomNumbers.length);
      await db.insert(reservations).values({
        id: row.orderId, sourceSystem: "owlnest_export", sourceChannel: row.sourceChannel, otaExternalId: row.otaExternalId,
        eventType: "reconciled", status: "pending", guestName: row.guestName, arrivalDate: row.arrivalDate, departureDate: row.departureDate,
        roomTypeId: roomType?.id ?? null, roomNumber: primaryRoom,
        adults: actualAdults, children: actualChildren, infants: actualInfants,
        totalAmount: row.totalAmount, receivedAmount: row.receivedAmount, balanceAmount: row.balanceAmount,
        paymentMethod: row.paymentMethod, paymentStatus: row.paymentStatus ?? (row.receivedAmount > 0 ? "deposit_paid" : "pending"),
        importState: row.adults != null ? "confirmed" : "pending_review",
        specialRequests: roomNumbers.length > 1
          ? `多房訂單：${roomNumbers.join("、")}；房價未拆分，系統以房間數平均分攤${row.adults == null ? "；OwlNest 訂單列表未提供入住人數，請人工核對" : ""}`
          : "OwlNest 訂單列表核對匯入；訂單列表未提供入住人數，請人工核對",
        updatedAt: new Date().toISOString(),
      });
      for (const [index, roomNumber] of roomNumbers.entries()) {
        const roomTypeForAllocation = roomRows.find((candidate) => candidate.defaultRoomNumber === roomNumber);
        await db.insert(reservationRooms).values({
          id: `${row.orderId}:${roomNumber}`,
          reservationId: row.orderId,
          roomNumber,
          roomTypeId: roomTypeForAllocation?.id ?? null,
          allocatedAmount: roomAmounts[index] ?? 0,
          allocationMethod: "equal",
        });
      }
      insertedCount += 1;
      itemValues.push({ runId, orderId: row.orderId, action: "inserted", differenceJson: null, sourceRowJson: JSON.stringify(row.raw) });
      continue;
    }
    matchedCount += 1;
    const diff = difference(existing, row, roomType?.displayName ?? null);
    const fields = Object.keys(diff);
    if (fields.length) {
      changedCount += 1;
      itemValues.push({ runId, orderId: row.orderId, action: "changed", differenceJson: JSON.stringify(diff), sourceRowJson: JSON.stringify(row.raw) });
    } else itemValues.push({ runId, orderId: row.orderId, action: "matched", differenceJson: null, sourceRowJson: JSON.stringify(row.raw) });
  }
  const missingRows = existingRows.filter((row) => row.status !== "cancelled" && !seen.has(row.id));
  for (const row of missingRows) itemValues.push({ runId, orderId: row.id, action: "missing_from_export", differenceJson: JSON.stringify({ reason: "本次 OwlNest 匯出未出現；不可直接視為取消" }), sourceRowJson: null });
  const user = await actorId();
  await db.insert(orderReconciliationRuns).values({
    id: runId, periodFrom, periodTo, sourceExportedAt: cleanText(body.sourceExportedAt) || null, status: "completed",
    receivedCount: parsed.rows.length, matchedCount, insertedCount, changedCount, missingCount: missingRows.length,
    errorCount: parsed.errors.length, payloadHash: contentHash, startedAt, completedAt: new Date().toISOString(), createdBy: user, notes: cleanText(body.notes) || null,
  });
  for (const item of itemValues) await db.insert(orderReconciliationItems).values(item);
  await db.insert(auditLog).values({ actorId: user, action: parsed.errors.length ? "owlnest.reconcile_with_errors" : "owlnest.reconciled", objectType: "reconciliation_run", objectId: runId, detailRedacted: JSON.stringify({ periodFrom, periodTo, received: parsed.rows.length, inserted: insertedCount, changed: changedCount, missing: missingRows.length, errors: parsed.errors.length }) });
  if (insertedCount > 0) invalidateHomePageCache();
  return Response.json({ ok: true, runId, received: parsed.rows.length, matched: matchedCount, inserted: insertedCount, changed: changedCount, duplicateInExport: duplicateCount, missingFromExport: missingRows.length, errors: parsed.errors, warnings: parsed.warnings }, { status: 201 });
}
