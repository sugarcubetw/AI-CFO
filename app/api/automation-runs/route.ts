import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, automationJobs } from "../../../db/schema";
import { actorId, cleanText, jsonError } from "../../../lib/server";

export async function POST(request: Request) {
  const body = await request.json() as { jobId?: unknown; status?: unknown; summary?: unknown };
  const jobId = cleanText(body.jobId);
  const status = cleanText(body.status);
  if (!jobId || !["success", "failed"].includes(status)) return jsonError("排程執行結果無效");
  const db = getDb();
  const [job] = await db.select().from(automationJobs).where(eq(automationJobs.id, jobId)).limit(1);
  if (!job) return jsonError("找不到排程服務", 404);
  const summary = body.summary && typeof body.summary === "object" ? body.summary : {};
  const safeSummary = JSON.stringify(summary).slice(0, 1200);
  const now = new Date().toISOString();
  await db.update(automationJobs).set({ lastRunAt: now, lastStatus: status, updatedAt: now }).where(eq(automationJobs.id, jobId));
  await db.insert(auditLog).values({
    actorId: await actorId(), action: `automation.run.${status}`, objectType: "automation_job", objectId: jobId,
    detailRedacted: safeSummary,
  });
  return Response.json({ ok: true, jobId, status, lastRunAt: now });
}
