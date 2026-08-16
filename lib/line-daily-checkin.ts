import { env } from "cloudflare:workers";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../db";
import { auditLog, meals, receptionChecklists, reservations } from "../db/schema";

type RuntimeEnv = {
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_RECIPIENT_ID?: string;
};

export type DailyCheckinNotificationResult = {
  status: "sent" | "already_sent" | "not_ready" | "not_today" | "not_configured" | "failed";
  message?: string;
};

export function taipeiToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${year}/${month}/${day}`;
}

export async function notifyDailyCheckinComplete(
  businessDate: string,
  options: { force?: boolean; actorId?: string } = {},
): Promise<DailyCheckinNotificationResult> {
  if (businessDate !== taipeiToday()) return { status: "not_today" };

  const db = getDb();
  const rows = await db.select({
    reservationId: reservations.id,
    roomNumber: reservations.roomNumber,
    status: reservations.status,
    actualGuests: receptionChecklists.actualGuests,
    breakfastTime: receptionChecklists.breakfastTime,
    breakfastCount: receptionChecklists.breakfastCount,
    mealName: meals.name,
  }).from(reservations)
    .leftJoin(receptionChecklists, eq(reservations.id, receptionChecklists.reservationId))
    .leftJoin(meals, eq(receptionChecklists.mealId, meals.id))
    .where(and(eq(reservations.arrivalDate, businessDate), ne(reservations.status, "cancelled")));

  if (rows.length === 0 || rows.some((row) => row.status !== "checked_in" || row.actualGuests === null)) {
    return { status: "not_ready" };
  }

  if (!options.force) {
    const [sent] = await db.select({ id: auditLog.id }).from(auditLog)
      .where(and(
        eq(auditLog.action, "line.daily_checkin.sent"),
        eq(auditLog.objectType, "business_date"),
        eq(auditLog.objectId, businessDate),
      )).limit(1);
    if (sent) return { status: "already_sent" };
  }

  const sorted = [...rows].sort((a, b) => (a.roomNumber ?? "").localeCompare(b.roomNumber ?? ""));
  const lines = sorted.map((row) => {
    const meal = row.breakfastTime === "不用餐"
      ? "不用餐"
      : `${row.breakfastTime ?? "待確認"}・${row.breakfastCount ?? 0} 位${row.mealName ? `・${row.mealName}` : ""}`;
    return `・${row.roomNumber ?? "未分房"} 房｜入住 ${row.actualGuests} 位｜早餐 ${meal}`;
  });
  const breakfastTotal = sorted.reduce((sum, row) => sum + (row.breakfastCount ?? 0), 0);
  const message = [
    "【方糖民宿｜今日入住完成】",
    `日期：${formatDate(businessDate)}`,
    "",
    "今日入住接待已全部完成：",
    ...lines,
    "",
    `今日早餐合計：${breakfastTotal} 位`,
    "如有用餐時間、人數或飲食禁忌調整，請在工作台更新。",
  ].join("\n");

  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.LINE_CHANNEL_ACCESS_TOKEN || !runtime.LINE_RECIPIENT_ID) {
    return { status: "not_configured", message };
  }

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        authorization: `Bearer ${runtime.LINE_CHANNEL_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ to: runtime.LINE_RECIPIENT_ID, messages: [{ type: "text", text: message }] }),
    });
    if (!response.ok) throw new Error(`LINE API ${response.status}`);
    await db.insert(auditLog).values({
      actorId: options.actorId ?? "system",
      action: "line.daily_checkin.sent",
      objectType: "business_date",
      objectId: businessDate,
      detailRedacted: JSON.stringify({ rooms: sorted.map((row) => row.roomNumber), breakfastTotal, forced: Boolean(options.force) }),
    });
    return { status: "sent" };
  } catch (error) {
    await db.insert(auditLog).values({
      actorId: options.actorId ?? "system",
      action: "line.daily_checkin.failed",
      objectType: "business_date",
      objectId: businessDate,
      detailRedacted: JSON.stringify({ error: error instanceof Error ? error.message : "unknown" }),
    });
    return { status: "failed" };
  }
}
