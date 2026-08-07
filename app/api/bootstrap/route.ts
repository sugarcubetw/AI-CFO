import { getDb } from "../../../db";
import { meals, mealVersions, rooms, roomTypes } from "../../../db/schema";
import { mealSeed, roomTypeSeed } from "../../../lib/base-data";

export async function POST() {
  const db = getDb();
  for (const [id, sourceName, room, isBookable] of roomTypeSeed) {
    await db.insert(roomTypes).values({ id, sourceName, displayName: sourceName, defaultRoomNumber: room, isBookable }).onConflictDoUpdate({ target: roomTypes.id, set: { sourceName, displayName: sourceName, defaultRoomNumber: room, isBookable } });
    await db.insert(rooms).values({ number: room, roomTypeId: id, isActive: true }).onConflictDoUpdate({ target: rooms.number, set: { roomTypeId: id } });
  }
  for (const [id, name, isDefault] of mealSeed) {
    await db.insert(meals).values({ id, name, isDefault, isActive: true }).onConflictDoUpdate({ target: meals.id, set: { name, isDefault, isActive: true } });
    await db.insert(mealVersions).values({ mealId: id, version: 1, name, createdBy: "system-bootstrap" }).onConflictDoNothing();
  }
  return Response.json({ ok: true, roomTypes: roomTypeSeed.length, meals: mealSeed.length });
}
