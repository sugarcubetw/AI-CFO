import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { reservations } from "../../../db/schema";
import { queryOrders } from "../../../lib/order-query";
import { actorId, cleanText, jsonError } from "../../../lib/server";
import { invalidateHomePageCache } from "../../../lib/home-page-cache";

function sinceDate() { const date = new Date(); date.setDate(date.getDate() - 7); return date.toISOString(); }

export async function GET() {
  const db = getDb();
  const since = sinceDate();
  const rows = await db.select({ id: reservations.id, readAt: reservations.readAt, createdAt: reservations.createdAt })
    .from(reservations).where(gte(reservations.createdAt, since)).orderBy(asc(reservations.createdAt));
  const orders = await queryOrders("1900-01-01", "2999-12-31");
  const byId = new Map(orders.map((order) => [order.id, order]));
  const visible = rows.map((row) => ({ ...byId.get(row.id), createdAt: row.createdAt, readAt: row.readAt })).filter((order) => order.id && order.status !== "checked_in" && order.status !== "cancelled");
  return Response.json({ orders: visible, unreadCount: visible.filter((order) => !order.readAt).length });
}

export async function PATCH(request: Request) {
  const body = await request.json() as { id?: unknown; action?: unknown };
  const db = getDb();
  const now = new Date().toISOString();
  const user = await actorId();
  if (cleanText(body.action) === "mark_all_read") {
    await db.update(reservations).set({ readAt: now, updatedAt: now }).where(and(gte(reservations.createdAt, sinceDate()), isNull(reservations.readAt)));
    invalidateHomePageCache();
    return Response.json({ ok: true, action: "mark_all_read" });
  }
  const id = cleanText(body.id);
  if (!id) return jsonError("訂單編號為必填");
  await db.update(reservations).set({ readAt: now, updatedAt: now }).where(and(eq(reservations.id, id), gte(reservations.createdAt, sinceDate())));
  void user;
  invalidateHomePageCache();
  return Response.json({ ok: true, id, readAt: now });
}
