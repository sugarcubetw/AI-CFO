import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditLog, expenses } from "../../../../db/schema";
import { actorId, cleanText, intValue, isIsoDate, jsonError } from "../../../../lib/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const month = cleanText(url.searchParams.get("month"));
  const filters = [];
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    filters.push(gte(expenses.expenseDate, `${month}-01`));
    filters.push(lte(expenses.expenseDate, `${month}-31`));
  }
  const rows = await getDb().select().from(expenses)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt)).limit(1000);
  return Response.json(rows.map((row) => ({ ...row, transactionDate: row.expenseDate, item: row.subCategory ?? "未分類", receiptFileName: row.receiptUrl, syncClientId: row.id })));
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const expenseDate = cleanText(body.expenseDate) || cleanText(body.transactionDate);
  const amount = intValue(body.amount);
  const category = cleanText(body.category);
  if (!isIsoDate(expenseDate) || amount <= 0 || !category) return jsonError("支出日期、類別與正數金額為必填");
  const id = cleanText(body.id) || `EXP-${crypto.randomUUID()}`;
  const db = getDb();
  const existing = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.id, id)).limit(1);
  if (existing.length) return Response.json({ ok: true, duplicate: true, id });
  const user = await actorId();
  await db.insert(expenses).values({
    id, expenseDate, amount, category,
    subCategory: cleanText(body.subCategory) || cleanText(body.item) || null,
    vendor: cleanText(body.vendor) || null,
    paymentMethod: cleanText(body.paymentMethod) || "other",
    receiptUrl: cleanText(body.receiptUrl) || null,
    note: cleanText(body.note) || null,
    updatedAt: new Date().toISOString(),
  });
  await db.insert(auditLog).values({ actorId: user, action: "expense.created", objectType: "expense", objectId: id, detailRedacted: JSON.stringify({ category, amount }) });
  return Response.json({ ok: true, id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const id = cleanText(body.id);
  if (!id) return jsonError("支出編號為必填");
  const db = getDb();
  const [existing] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!existing) return jsonError("找不到支出", 404);
  if (cleanText(body.action) === "delete") {
    await db.delete(expenses).where(eq(expenses.id, id));
    await db.insert(auditLog).values({ actorId: await actorId(), action: "expense.deleted", objectType: "expense", objectId: id, detailRedacted: JSON.stringify({ amount: existing.amount, category: existing.category }) });
    return Response.json({ ok: true, id, deleted: true });
  }
  const expenseDate = cleanText(body.expenseDate) || existing.expenseDate;
  const amount = intValue(body.amount, existing.amount);
  const category = cleanText(body.category) || existing.category;
  if (!isIsoDate(expenseDate) || amount <= 0) return jsonError("支出日期或金額無效");
  await db.update(expenses).set({ expenseDate, amount, category, subCategory: cleanText(body.subCategory) || null, vendor: cleanText(body.vendor) || null, paymentMethod: cleanText(body.paymentMethod) || "other", receiptUrl: cleanText(body.receiptUrl) || null, note: cleanText(body.note) || null, updatedAt: new Date().toISOString() }).where(eq(expenses.id, id));
  await db.insert(auditLog).values({ actorId: await actorId(), action: "expense.updated", objectType: "expense", objectId: id, detailRedacted: JSON.stringify({ amount, category }) });
  return Response.json({ ok: true, id });
}
