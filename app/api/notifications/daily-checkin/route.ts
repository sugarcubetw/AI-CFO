import { actorId, jsonError } from "../../../../lib/server";
import { notifyDailyCheckinComplete, taipeiToday } from "../../../../lib/line-daily-checkin";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { date?: string; force?: boolean };
  const date = body.date ?? taipeiToday();
  const result = await notifyDailyCheckinComplete(date, { force: Boolean(body.force), actorId: await actorId() });
  if (result.status === "not_ready") return jsonError("今日尚有未完成接待的入住訂單", 409);
  if (result.status === "not_today") return jsonError("只允許發送今天的入住完成通知", 400);
  if (result.status === "not_configured") return jsonError("LINE 通知尚未完成部署設定", 503);
  if (result.status === "failed") return jsonError("LINE 通知發送失敗，請查看執行記錄", 502);
  return Response.json({ ok: true, status: result.status });
}
