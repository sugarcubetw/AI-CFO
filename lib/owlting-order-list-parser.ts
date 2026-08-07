export type OwlNestOrderListRow = {
  orderId: string;
  orderedAt: string | null;
  arrivalDate: string;
  departureDate: string;
  guestName: string;
  roomTypeName: string;
  roomNumber: string | null;
  totalAmount: number;
  receivedAmount: number;
  balanceAmount: number;
  sourceChannel: string;
  otaExternalId: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  raw: Record<string, string>;
};

export type OwlNestOrderListParseResult = {
  rows: OwlNestOrderListRow[];
  errors: { row: number; reason: string }[];
  warnings: string[];
};

const roomTypes = [
  ["湖水綠意雙人房", "202"], ["湖光晴空露台雙人房", "301"], ["晨光綠語雙人房", "303"],
  ["光嶼雅築四人房", "204"], ["湖畔拾影雙人房", "201"], ["未開放1", "203"], ["未開放2", "302"],
] as const;

function splitDelimited(line: string, delimiter: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      cells.push(value.trim()); value = "";
    } else value += character;
  }
  cells.push(value.trim());
  return cells;
}

function detectDelimiter(header: string) {
  const candidates = ["\t", ",", ";"];
  return candidates.sort((left, right) => splitDelimited(header, right).length - splitDelimited(header, left).length)[0];
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/\s+/g, "").replace(/[：:]/g, "").trim();
}

function text(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value) return value.trim();
  }
  return "";
}

function amount(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function date(value: string) {
  const normalized = value.trim().replace(/[/.]/g, "-");
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)
    ? normalized.split("-").map((part, index) => index === 0 ? part : part.padStart(2, "0")).join("-")
    : "";
}

function source(value: string) {
  if (/booking/i.test(value)) return "Booking";
  if (/agoda/i.test(value)) return "Agoda";
  if (/airbnb/i.test(value)) return "Airbnb";
  if (/官網|網站|website/i.test(value)) return "官網";
  if (/電話/i.test(value)) return "電話訂房";
  if (/公務/i.test(value)) return "公務住宿";
  return value.trim() || "其他";
}

function room(value: string) {
  const known = roomTypes.find(([name]) => value.includes(name));
  return { roomTypeName: known?.[0] ?? value.trim(), roomNumber: known?.[1] ?? null };
}

function otaId(value: string, sourceValue: string) {
  return value.match(/\d{8,}/)?.[0] ?? sourceValue.match(/(?:Booking\.com|Agoda|Airbnb)\s*(\d{8,})/i)?.[1] ?? null;
}

export function parseOwlNestOrderList(input: string): OwlNestOrderListParseResult {
  const lines = input.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], errors: [{ row: 1, reason: "找不到表頭與資料列" }], warnings: [] };
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitDelimited(lines[0], delimiter).map(normalizeHeader);
  const warnings: string[] = [];
  const required = ["訂單編號", "入住日期", "退房日期", "姓名"];
  for (const header of required) if (!headers.some((item) => item === header || item.includes(header))) warnings.push(`缺少欄位：${header}`);
  const rows: OwlNestOrderListRow[] = [];
  const errors: { row: number; reason: string }[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const values = splitDelimited(lines[index], delimiter);
    const raw = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    const orderId = text(raw, ["訂單編號", "訂單號碼", "Order ID"]);
    const arrivalDate = date(text(raw, ["入住日期", "入住日", "Check-in"]));
    const departureDate = date(text(raw, ["退房日期", "退房日", "Check-out"]));
    const guestName = text(raw, ["姓名", "訂購人", "旅客姓名"]);
    if (!orderId || !arrivalDate || !departureDate || !guestName) {
      errors.push({ row: index + 1, reason: "訂單編號、入住/退房日期、姓名為必要欄位" });
      continue;
    }
    const sourceValue = text(raw, ["訂單來源", "來源", "Source"]);
    const totalAmount = amount(text(raw, ["總金額", "總額", "自訂應收總額"]));
    const receivedAmount = amount(text(raw, ["已收", "已收金額"]));
    const listedBalance = text(raw, ["未收", "未收金額", "剩餘尾款"]);
    const balanceAmount = listedBalance ? amount(listedBalance) : Math.max(0, totalAmount - receivedAmount);
    const roomValue = text(raw, ["客房類別", "房型", "客房"]);
    const roomInfo = room(roomValue);
    rows.push({
      orderId, orderedAt: date(text(raw, ["訂購時間", "訂單時間", "建立時間"])) || text(raw, ["訂購時間", "訂單時間", "建立時間"]) || null,
      arrivalDate, departureDate, guestName, ...roomInfo, totalAmount, receivedAmount, balanceAmount,
      sourceChannel: source(sourceValue), otaExternalId: otaId(text(raw, ["OTA訂單編號", "OTA編號"]), sourceValue),
      paymentMethod: text(raw, ["付款方式", "官網金流", "支付方式"]) || null,
      paymentStatus: text(raw, ["付款狀態", "付款狀態說明"]) || null, raw,
    });
  }
  return { rows, errors, warnings };
}

