import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { meals, roomTypes } from "../../../db/schema";
import { breakfastTimes, sourceChannels } from "../../../lib/base-data";

export async function GET() {
  const db = getDb();
  return Response.json({
    roomTypes: await db.select().from(roomTypes).orderBy(asc(roomTypes.defaultRoomNumber)),
    meals: await db.select().from(meals).orderBy(asc(meals.name)),
    breakfastTimes,
    sourceChannels,
  });
}
