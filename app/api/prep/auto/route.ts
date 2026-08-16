import { POST as generatePrepReport } from "../route";

function taipeiDate(offsetDays: number) {
  const now = new Date();
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  taipei.setUTCDate(taipei.getUTCDate() + offsetDays);
  return taipei.toISOString().slice(0, 10);
}

/**
 * Private automation entry point. The always-on agent calls this at 18:00
 * Asia/Taipei. Repeated calls create a traceable revision instead of replacing
 * the previous formal headcount report.
 */
export async function POST(request: Request) {
  const date = taipeiDate(1);
  return generatePrepReport(new Request(new URL("/api/prep", request.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: date, to: date, reportType: "formal" }),
  }));
}
