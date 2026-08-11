import type { ImportedOrder } from "./import-orders";

export type GmailOrderMessage = {
  id: string;
  from: string;
  subject: string;
  body: string;
  emailTs: string;
};

export type ParseResult =
  | { state: "parsed"; order: ImportedOrder }
  | { state: "ignored"; messageId: string; reason: string }
  | { state: "error"; messageId: string; reason: string };

const knownRoomTypes = [
  "湖水綠意雙人房", "湖光晴空露台雙人房", "晨光綠語雙人房",
  "光嶼雅築四人房", "湖畔拾影雙人房", "未開放1", "未開放2",
];

function labelValue(body: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.match(new RegExp(`${escaped}\\s*\\n+(?:TWD\\s*)?([^\\n]+)`, "i"))?.[1]?.trim() ?? "";
}

function amount(body: string, label: string) {
  const value = labelValue(body, label).replace(/[^0-9.-]/g, "");
  return value ? Math.round(Number(value)) : 0;
}

function count(body: string, label: string) {
  return Number(body.match(new RegExp(`${label}\\s*(\\d+)\\s*人`))?.[1] ?? 0);
}

function section(body: string, start: string, endings: string[]) {
  const startIndex = body.indexOf(start);
  if (startIndex < 0) return "";
  const contentStart = startIndex + start.length;
  const endIndexes = endings.map((ending) => body.indexOf(ending, contentStart)).filter((index) => index >= 0);
  const endIndex = endIndexes.length ? Math.min(...endIndexes) : body.length;
  return body.slice(contentStart, endIndex).trim();
}

function roomTypesIn(body: string) {
  const known = knownRoomTypes.filter((name) => body.includes(name));
  if (known.length) return { names: known, known: true };
  // OwlNest order emails render the order table as sequential lines. For an
  // old or newly renamed room type, the first value after the "數量" header is
  // the room name, followed by the rate-plan name and quantity.
  const orderLines = section(body, "房型名稱", ["人數"])
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const fallback = orderLines.find((line) => !/^\d+$/.test(line) && !/^(專案名稱|數量)$|Booking\.com|優惠價/i.test(line));
  return { names: fallback ? [fallback] : [], known: false };
}

export function parseOwltingEmail(message: GmailOrderMessage): ParseResult {
  if (!/owlnest@owlting\.com/i.test(message.from)) return { state: "ignored", messageId: message.id, reason: "sender_not_owlting" };
  const eventType = /取消通知|訂單已取消/.test(message.subject) ? "cancelled"
    : /修改|異動/.test(message.subject) ? "modified"
      : /成立通知|新預定通知/.test(message.subject) ? "created" : null;
  if (!eventType) return { state: "ignored", messageId: message.id, reason: "not_order_event" };
  try {
    const orderId = message.subject.match(/OBE\d+/)?.[0] ?? message.body.match(/訂單編號[：:]\s*(OBE\d+)/)?.[1] ?? "";
    const dates = [...message.body.matchAll(/20\d{2}-\d{2}-\d{2}/g)].map((match) => match[0]);
    const roomTypes = roomTypesIn(message.body);
    const roomTypeNames = roomTypes.names;
    if (!orderId || dates.length < 2 || roomTypeNames.length === 0) throw new Error("missing_required_order_fields");
    const sourceChannel = /Booking\.com|來自 Booking/.test(message.body) ? "Booking" : "官網";
    const guestName = labelValue(message.body, "旅客姓名") || "待確認";
    const contact = message.body.match(/[A-Za-z0-9+._*-]+@[A-Za-z0-9.*_-]+/)?.[0]
      ?? message.body.match(/\+?\d[\d* +()-]{6,}/)?.[0]?.trim();
    const totalAmount = amount(message.body, "訂單款項");
    const receivedAmount = amount(message.body, "已收金額");
    const balanceAmount = amount(message.body, "剩餘尾款");
    const warnings: string[] = [];
    if (roomTypeNames.length > 1) warnings.push("multiple_room_types_require_review");
    if (!roomTypes.known) warnings.push("unknown_room_type_requires_review");
    if (eventType === "cancelled" && totalAmount === 0 && balanceAmount > 0) warnings.push("cancelled_amounts_not_financial_truth");
    const specialRequests = section(message.body, "特殊需求", ["取消規定", "旅館資訊", "若對訂單", "本系統服務"]);
    const guestCountProvided = /大人\s*\d+\s*人/.test(message.body);
    return {
      state: "parsed",
      order: {
        orderId, messageId: message.id, eventType, occurredAt: message.emailTs,
        sourceChannel, otaExternalId: message.body.match(/OTA訂單編號為[：:]\s*(\d+)/)?.[1],
        guestName, guestContactMasked: contact, arrivalDate: dates[0], departureDate: dates[1],
        roomTypeName: roomTypeNames[0], roomTypeNames,
        adults: Math.max(1, count(message.body, "大人")), children: count(message.body, "小孩"), infants: count(message.body, "嬰兒"),
        guestCountProvided,
        totalAmount, receivedAmount, balanceAmount,
        paymentMethod: labelValue(message.body, "支付方式") || undefined,
        paymentStatus: eventType === "cancelled" ? "cancelled" : receivedAmount > 0 ? "deposit_paid" : "pending",
        specialRequests: specialRequests || undefined, parseWarnings: warnings,
      },
    };
  } catch (error) {
    return { state: "error", messageId: message.id, reason: error instanceof Error ? error.message : "parse_failed" };
  }
}

export function parseOwltingBatch(messages: GmailOrderMessage[]) {
  const results = messages.map(parseOwltingEmail);
  return {
    // Gmail search results are normally newest-first. Apply events oldest-first so
    // a later modification or cancellation is the final reservation state.
    orders: results
      .flatMap((result) => result.state === "parsed" ? [result.order] : [])
      .sort((left, right) => {
        const occurred = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
        return occurred || left.messageId.localeCompare(right.messageId);
      }),
    ignored: results.filter((result) => result.state === "ignored"),
    errors: results.filter((result) => result.state === "error"),
  };
}
