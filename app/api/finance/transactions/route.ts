import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditLog, financialTransactions } from "../../../../db/schema";
import { actorId, cleanText, intValue, isIsoDate, jsonError } from "../../../../lib/server";

const categories = new Set(["人事", "房務", "食材", "公共營運", "行銷平台", "訂閱服務", "貸款", "其他"]);

export async function GET() {
  const rows = await getDb().select().from(financialTransactions).orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.createdAt)).limit(100);
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const transactionDate = cleanText(body.transactionDate);
  const category = cleanText(body.category);
  const item = cleanText(body.item);
  const amount = intValue(body.amount);
  const syncClientId = cleanText(body.syncClientId);
  if (!isIsoDate(transactionDate) || !categories.has(category) || !item || amount <= 0 || !syncClientId) return jsonError("費用日期、分類、細項、正數金額與同步識別碼為必填");
  const db = getDb();
  const existing = await db.select({ id: financialTransactions.id }).from(financialTransactions).where(eq(financialTransactions.syncClientId, syncClientId)).limit(1);
  if (existing.length) return Response.json({ ok: true, duplicate: true, id: existing[0].id });
  const id = `FIN-${crypto.randomUUID()}`;
  const user = await actorId();
  await db.insert(financialTransactions).values({
    id, transactionDate, direction: cleanText(body.direction) || "expense", category, item, amount,
    paymentMethod: cleanText(body.paymentMethod) || null, vendor: cleanText(body.vendor) || null,
    note: cleanText(body.note) || null, receiptFileName: cleanText(body.receiptFileName) || null,
    source: cleanText(body.source) || "mobile", syncClientId, createdBy: user,
  });
  await db.insert(auditLog).values({ actorId: user, action: "financial_transaction.created", objectType: "financial_transaction", objectId: id, detailRedacted: JSON.stringify({ category, amount, source: cleanText(body.source) || "mobile" }) });
  return Response.json({ ok: true, id }, { status: 201 });
}
