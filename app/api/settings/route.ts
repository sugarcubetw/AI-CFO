import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, automationJobs, roomTypes, rooms, settingOptions } from "../../../db/schema";
import { actorId, cleanText, intValue, jsonError } from "../../../lib/server";
import { invalidateHomePageCache } from "../../../lib/home-page-cache";

const allowedCategories = new Set(["breakfast_time", "payment_method", "source_channel"]);

export async function GET() {
  const db = getDb();
  return Response.json({
    roomTypes: await db.select().from(roomTypes).orderBy(asc(roomTypes.defaultRoomNumber)),
    options: await db.select().from(settingOptions).orderBy(asc(settingOptions.category), asc(settingOptions.sortOrder), asc(settingOptions.label)),
    automationJobs: await db.select().from(automationJobs).orderBy(asc(automationJobs.name)),
  });
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const category = cleanText(body.category);
  const label = cleanText(body.label);
  const scope = cleanText(body.scope) || "*";
  if (!allowedCategories.has(category) || !label) return jsonError("設定分類或名稱無效");
  const id = `${category}-${crypto.randomUUID()}`;
  const db = getDb();
  const user = await actorId();
  await db.insert(settingOptions).values({ id, category, label, scope, sortOrder: intValue(body.sortOrder), isActive: true });
  await db.insert(auditLog).values({ actorId: user, action: "setting.created", objectType: category, objectId: id, detailRedacted: JSON.stringify({ label, scope }) });
  invalidateHomePageCache();
  return Response.json({ ok: true, id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const entity = cleanText(body.entity, "option");
  const id = cleanText(body.id);
  if (!id) return jsonError("設定 id 為必填");
  const db = getDb();
  const user = await actorId();
  if (entity === "automationJob") {
    const [current] = await db.select().from(automationJobs).where(eq(automationJobs.id, id)).limit(1);
    if (!current) return jsonError("找不到排程服務", 404);
    const scheduleType = cleanText(body.scheduleType, current.scheduleType);
    if (!["interval", "daily", "event"].includes(scheduleType)) return jsonError("執行方式無效");
    const intervalMinutes = scheduleType === "interval" ? intValue(body.intervalMinutes, current.intervalMinutes ?? 15) : null;
    const timeOfDay = scheduleType === "daily" ? cleanText(body.timeOfDay, current.timeOfDay ?? "06:00") : null;
    if (scheduleType === "interval" && (intervalMinutes < 5 || intervalMinutes > 1440)) return jsonError("檢查週期需介於 5–1440 分鐘");
    if (scheduleType === "daily" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeOfDay ?? "")) return jsonError("每日執行時間無效");
    const isEnabled = body.isEnabled === undefined ? current.isEnabled : Boolean(body.isEnabled);
    await db.update(automationJobs).set({ scheduleType, intervalMinutes, timeOfDay, isEnabled, updatedAt: new Date().toISOString() }).where(eq(automationJobs.id, id));
    await db.insert(auditLog).values({ actorId: user, action: isEnabled ? "automation.updated" : "automation.disabled", objectType: "automation_job", objectId: id, detailRedacted: JSON.stringify({ scheduleType, intervalMinutes, timeOfDay, timezone: current.timezone }) });
    return Response.json({ ok: true, id });
  }
  if (entity === "roomType") {
    const [current] = await db.select().from(roomTypes).where(eq(roomTypes.id, id)).limit(1);
    if (!current) return jsonError("找不到房型", 404);
    const displayName = cleanText(body.displayName, current.displayName);
    const roomNumber = cleanText(body.defaultRoomNumber, current.defaultRoomNumber);
    if (!displayName || !roomNumber) return jsonError("房型名稱與房號為必填");
    await db.update(roomTypes).set({ displayName, defaultRoomNumber: roomNumber, isBookable: body.isBookable === undefined ? current.isBookable : Boolean(body.isBookable), isActive: body.isActive === undefined ? current.isActive : Boolean(body.isActive), updatedAt: new Date().toISOString() }).where(eq(roomTypes.id, id));
    const roomActive = body.isActive === undefined ? current.isActive : Boolean(body.isActive);
    await db.insert(rooms).values({ number: roomNumber, roomTypeId: id, isActive: roomActive }).onConflictDoUpdate({ target: rooms.number, set: { roomTypeId: id, isActive: roomActive } });
    if (roomNumber !== current.defaultRoomNumber) await db.update(rooms).set({ isActive: false }).where(eq(rooms.number, current.defaultRoomNumber));
    await db.insert(auditLog).values({ actorId: user, action: "room_type.updated", objectType: "room_type", objectId: id, detailRedacted: JSON.stringify({ displayName, roomNumber }) });
    invalidateHomePageCache();
    return Response.json({ ok: true, id });
  }
  const [current] = await db.select().from(settingOptions).where(eq(settingOptions.id, id)).limit(1);
  if (!current) return jsonError("找不到設定", 404);
  const label = cleanText(body.label, current.label);
  const scope = cleanText(body.scope, current.scope) || "*";
  const isActive = body.isActive === undefined ? current.isActive : Boolean(body.isActive);
  await db.update(settingOptions).set({ label, scope, isActive, sortOrder: body.sortOrder === undefined ? current.sortOrder : intValue(body.sortOrder), updatedAt: new Date().toISOString() }).where(eq(settingOptions.id, id));
  await db.insert(auditLog).values({ actorId: user, action: isActive ? "setting.updated" : "setting.deactivated", objectType: current.category, objectId: id, detailRedacted: JSON.stringify({ label, scope }) });
  invalidateHomePageCache();
  return Response.json({ ok: true, id });
}
