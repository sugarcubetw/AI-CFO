import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { mealPrepItems, mealRequirements, meals, reservations } from "../../../db/schema";
import { isIsoDate, jsonError } from "../../../lib/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? from;
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return jsonError("日期區間無效");
  const db = getDb();
  const requirements = await db.select({
    id: mealRequirements.id, reservationId: mealRequirements.reservationId, mealDate: mealRequirements.mealDate,
    mealTime: mealRequirements.mealTime, guestCount: mealRequirements.guestCount, mealId: mealRequirements.mealId,
    mealName: meals.name, roomNumber: reservations.roomNumber,
  }).from(mealRequirements)
    .leftJoin(meals, eq(mealRequirements.mealId, meals.id))
    .leftJoin(reservations, eq(mealRequirements.reservationId, reservations.id))
    .where(and(gte(mealRequirements.mealDate, from), lte(mealRequirements.mealDate, to)))
    .orderBy(asc(mealRequirements.mealDate), asc(mealRequirements.mealTime));
  const mappings = await db.select().from(mealPrepItems).where(eq(mealPrepItems.isActive, true));
  const items = new Map<string, { itemName: string; unit: string; quantity: number }>();
  for (const requirement of requirements) {
    for (const mapping of mappings.filter((entry) => entry.mealId === requirement.mealId)) {
      const key = `${mapping.itemName}|${mapping.unit}`;
      const current = items.get(key) ?? { itemName: mapping.itemName, unit: mapping.unit, quantity: 0 };
      current.quantity += mapping.quantityPerServing * requirement.guestCount;
      items.set(key, current);
    }
  }
  const mappedMeals = new Set(mappings.map((entry) => entry.mealId));
  const missingMappings = [...new Set(requirements.filter((entry) => entry.mealId && !mappedMeals.has(entry.mealId)).map((entry) => entry.mealName ?? entry.mealId!))];
  return Response.json({ from, to, requirements, shoppingItems: [...items.values()], missingMappings });
}
