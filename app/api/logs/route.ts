import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog } from "../../../db/schema";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") ?? 100)));
  const rows = await getDb().select().from(auditLog).orderBy(desc(auditLog.occurredAt), desc(auditLog.id)).limit(limit);
  return Response.json(rows);
}
