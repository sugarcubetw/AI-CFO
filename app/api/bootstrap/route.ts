import { getDb } from "../../../db";
import { automationJobs, meals, mealVersions, rooms, roomTypes, settingOptions } from "../../../db/schema";
import { automationJobSeed, mealSeed, roomTypeSeed, settingOptionSeed } from "../../../lib/base-data";

export async function POST() {
  const db = getDb();
  for (const [id, sourceName, room, isBookable] of roomTypeSeed) {
    await db.insert(roomTypes).values({ id, sourceName, displayName: sourceName, defaultRoomNumber: room, isBookable }).onConflictDoNothing();
    await db.insert(rooms).values({ number: room, roomTypeId: id, isActive: true }).onConflictDoNothing();
  }
  for (const [id, name, isDefault] of mealSeed) {
    await db.insert(meals).values({ id, name, isDefault, isActive: true }).onConflictDoNothing();
    await db.insert(mealVersions).values({ mealId: id, version: 1, name, createdBy: "system-bootstrap" }).onConflictDoNothing();
  }
  for (const [id, category, label, scope, sortOrder] of settingOptionSeed) {
    await db.insert(settingOptions).values({ id, category, label, scope, sortOrder }).onConflictDoNothing();
  }
  for (const [id, name, description, scheduleType, intervalMinutes, timeOfDay, isEnabled] of automationJobSeed) {
    await db.insert(automationJobs).values({ id, name, description, scheduleType, intervalMinutes, timeOfDay, isEnabled }).onConflictDoNothing();
  }
  return Response.json({ ok: true, roomTypes: roomTypeSeed.length, meals: mealSeed.length, options: settingOptionSeed.length, automationJobs: automationJobSeed.length });
}
