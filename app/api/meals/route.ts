import { asc, eq, max } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, meals, mealVersions } from "../../../db/schema";
import { actorId, cleanText, intValue, jsonError } from "../../../lib/server";

export async function GET() {
  return Response.json(await getDb().select().from(meals).orderBy(asc(meals.sortOrder), asc(meals.name)));
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const name = cleanText(body.name);
  if (!name) return jsonError("餐點名稱為必填");
  const id = cleanText(body.id) || `meal-${crypto.randomUUID()}`;
  const user = await actorId();
  const db = getDb();
  await db.insert(meals).values({ id, name, description: cleanText(body.description) || null, sortOrder: intValue(body.sortOrder), isDefault: Boolean(body.isDefault), isActive: true });
  await db.insert(mealVersions).values({ mealId: id, version: 1, name, description: cleanText(body.description) || null, createdBy: user });
  await db.insert(auditLog).values({ actorId: user, action: "meal.created", objectType: "meal", objectId: id });
  return Response.json({ ok: true, id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const id = cleanText(body.id);
  if (!id) return jsonError("餐點 id 為必填");
  const db = getDb();
  const [current] = await db.select().from(meals).where(eq(meals.id, id)).limit(1);
  if (!current) return jsonError("找不到餐點", 404);
  const name = cleanText(body.name, current.name);
  const description = body.description === undefined ? current.description : cleanText(body.description) || null;
  const isActive = body.isActive === undefined ? current.isActive : Boolean(body.isActive);
  const user = await actorId();
  const [latest] = await db.select({ value: max(mealVersions.version) }).from(mealVersions).where(eq(mealVersions.mealId, id));
  await db.update(meals).set({ name, description, isActive, sortOrder: body.sortOrder === undefined ? current.sortOrder : intValue(body.sortOrder), updatedAt: new Date().toISOString() }).where(eq(meals.id, id));
  await db.insert(mealVersions).values({ mealId: id, version: (latest?.value ?? 0) + 1, name, description, createdBy: user });
  await db.insert(auditLog).values({ actorId: user, action: isActive ? "meal.updated" : "meal.deactivated", objectType: "meal", objectId: id });
  return Response.json({ ok: true, id, version: (latest?.value ?? 0) + 1 });
}
