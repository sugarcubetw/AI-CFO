export type ImportedOrder = {
  orderId: string;
  messageId: string;
  eventType: "created" | "modified" | "cancelled";
  occurredAt: string;
  sourceChannel: string;
  otaExternalId?: string;
  guestName: string;
  guestContactMasked?: string;
  arrivalDate: string;
  departureDate: string;
  roomTypeName: string;
  roomTypeNames?: string[];
  adults: number;
  children?: number;
  infants?: number;
  guestCountProvided?: boolean;
  totalAmount: number;
  receivedAmount: number;
  balanceAmount: number;
  paymentMethod?: string;
  paymentStatus?: string;
  specialRequests?: string;
  parseWarnings?: string[];
};

export function canonicalImportEvent(input: ImportedOrder) {
  return JSON.stringify({
    orderId: input.orderId,
    messageId: input.messageId,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    status: input.eventType === "cancelled" ? "cancelled" : "pending",
  });
}

export async function eventHash(input: ImportedOrder) {
  const bytes = new TextEncoder().encode(canonicalImportEvent(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function redactImport(input: ImportedOrder) {
  return JSON.stringify({
    orderId: input.orderId,
    sourceChannel: input.sourceChannel,
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    roomTypeName: input.roomTypeName,
    adults: input.adults,
    guestCountProvided: input.guestCountProvided,
    eventType: input.eventType,
    amounts: { total: input.totalAmount, received: input.receivedAmount, balance: input.balanceAmount },
  });
}
