import { and, gte, lte, ne, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { expenses, reservations } from "../../../../db/schema";
import { cleanText, isIsoDate, jsonError } from "../../../../lib/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = cleanText(url.searchParams.get("from"));
  const to = cleanText(url.searchParams.get("to"));
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return jsonError("日期區間無效");
  const db = getDb();
  const [orderRows, expenseRows] = await Promise.all([
    db.select({ total: reservations.totalAmount, received: reservations.receivedAmount, balance: reservations.balanceAmount })
      .from(reservations).where(and(gte(reservations.arrivalDate, from), lte(reservations.arrivalDate, to), ne(reservations.status, "cancelled"))),
    db.select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)` }).from(expenses).where(and(gte(expenses.expenseDate, from), lte(expenses.expenseDate, to))),
  ]);
  return Response.json({
    from, to,
    revenue: {
      expected: orderRows.reduce((sum, row) => sum + (row.total ?? 0), 0),
      received: orderRows.reduce((sum, row) => sum + (row.received ?? 0), 0),
      pending: orderRows.reduce((sum, row) => sum + (row.balance ?? 0), 0),
      orderCount: orderRows.length,
    },
    expenses: Number(expenseRows[0]?.total ?? 0),
  });
}
