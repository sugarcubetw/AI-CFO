import { parseOwltingBatch, type GmailOrderMessage } from "../../../../lib/owlting-email-parser";
import { POST as importParsedOrders } from "../route";
import { jsonError } from "../../../../lib/server";

export async function POST(request: Request) {
  const payload = await request.json() as { messages?: GmailOrderMessage[] };
  if (!Array.isArray(payload.messages) || payload.messages.length === 0 || payload.messages.length > 100) return jsonError("messages 必須包含 1–100 封郵件");
  const parsed = parseOwltingBatch(payload.messages);
  if (parsed.orders.length === 0) return Response.json({ received: payload.messages.length, parsed: 0, ignored: parsed.ignored, parseErrors: parsed.errors, import: null }, { status: parsed.errors.length ? 422 : 200 });
  const importResponse = await importParsedOrders(new Request(new URL("/api/import", request.url), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orders: parsed.orders }),
  }));
  const imported = await importResponse.json();
  return Response.json({ received: payload.messages.length, parsed: parsed.orders.length, ignored: parsed.ignored, parseErrors: parsed.errors, import: imported }, { status: importResponse.status });
}
