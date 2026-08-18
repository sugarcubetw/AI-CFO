import { and, eq, gte, lte, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { expenses, reservationRooms, reservations, roomTypes } from "../../../../db/schema";
import { cleanText, isIsoDate, jsonError } from "../../../../lib/server";

type StayDetail = {
  date: string;
  id: string;
  guestName: string;
  roomNumber: string | null;
  roomType: string;
  arrivalDate: string;
  departureDate: string;
  amount: number;
  realized: boolean;
};
type DayBucket = { date: string; realized: number; unrealized: number; total: number; rooms: number; stays: StayDetail[] };
type RoomBucket = { roomNumber: string; roomType: string; nights: number; realized: number; unrealized: number; total: number; stays: StayDetail[] };
type RoomAllocation = { roomNumber: string; roomType: string; allocatedAmount: number };

function utcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(value: Date) { return value.toISOString().slice(0, 10); }

function nightsBetween(from: string, to: string) {
  return Math.max(1, Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86_400_000));
}

function todayTaipei() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = cleanText(url.searchParams.get("from"));
  const to = cleanText(url.searchParams.get("to"));
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return jsonError("日期區間無效");

  const db = getDb();
  const [orderRows, expenseRows, allocationRows] = await Promise.all([
    db.select({
      id: reservations.id,
      sourceChannel: reservations.sourceChannel,
      guestName: reservations.guestName,
      arrivalDate: reservations.arrivalDate,
      departureDate: reservations.departureDate,
      roomNumber: reservations.roomNumber,
      roomType: roomTypes.displayName,
      status: reservations.status,
      createdAt: reservations.createdAt,
      totalAmount: reservations.totalAmount,
      receivedAmount: reservations.receivedAmount,
      balanceAmount: reservations.balanceAmount,
    }).from(reservations)
      .leftJoin(roomTypes, eq(reservations.roomTypeId, roomTypes.id))
      .where(and(lte(reservations.arrivalDate, to), gte(reservations.departureDate, from), ne(reservations.status, "cancelled"))),
    db.select({ amount: expenses.amount }).from(expenses).where(and(gte(expenses.expenseDate, from), lte(expenses.expenseDate, to))),
    db.select({
      reservationId: reservationRooms.reservationId,
      roomNumber: reservationRooms.roomNumber,
      allocatedAmount: reservationRooms.allocatedAmount,
      roomType: roomTypes.displayName,
    }).from(reservationRooms).leftJoin(roomTypes, eq(reservationRooms.roomTypeId, roomTypes.id)),
  ]);

  const today = todayTaipei();
  const daily = new Map<string, DayBucket>();
  const rooms = new Map<string, RoomBucket>();
  const allocationsByReservation = new Map<string, RoomAllocation[]>();
  for (const row of allocationRows) {
    const current = allocationsByReservation.get(row.reservationId) ?? [];
    current.push({ roomNumber: row.roomNumber, roomType: row.roomType ?? "待設定房型", allocatedAmount: row.allocatedAmount ?? 0 });
    allocationsByReservation.set(row.reservationId, current);
  }
  const orders = orderRows.map((row) => {
    const nights = nightsBetween(row.arrivalDate, row.departureDate);
    const roomAllocations = allocationsByReservation.get(row.id)?.length
      ? allocationsByReservation.get(row.id)!
      : [{ roomNumber: row.roomNumber ?? "未分房", roomType: row.roomType ?? "待設定房型", allocatedAmount: row.totalAmount ?? 0 }];
    const roomNumbers = roomAllocations.map((allocation) => allocation.roomNumber);
    let allocation = 0;
    let realized = 0;
    let unrealized = 0;
    for (const roomAllocation of roomAllocations) {
      const nightly = roomAllocation.allocatedAmount / nights;
      for (let cursor = utcDate(row.arrivalDate); cursor < utcDate(row.departureDate); cursor = new Date(cursor.getTime() + 86_400_000)) {
        const date = isoDate(cursor);
        if (date < from || date > to) continue;
        const amount = Math.round(nightly);
        allocation += amount;
        const isRealized = date <= today;
        if (isRealized) realized += amount;
        else unrealized += amount;
        const detail: StayDetail = {
          date,
          id: row.id,
          guestName: row.guestName,
          roomNumber: roomAllocation.roomNumber === "未分房" ? null : roomAllocation.roomNumber,
          roomType: roomAllocation.roomType,
          arrivalDate: row.arrivalDate,
          departureDate: row.departureDate,
          amount,
          realized: isRealized,
        };
        const bucket = daily.get(date) ?? { date, realized: 0, unrealized: 0, total: 0, rooms: 0, stays: [] };
        bucket[isRealized ? "realized" : "unrealized"] += amount;
        bucket.total += amount;
        bucket.rooms += 1;
        bucket.stays.push(detail);
        daily.set(date, bucket);
        const room = rooms.get(roomAllocation.roomNumber) ?? { roomNumber: roomAllocation.roomNumber, roomType: roomAllocation.roomType, nights: 0, realized: 0, unrealized: 0, total: 0, stays: [] };
        room.nights += 1;
        room[isRealized ? "realized" : "unrealized"] += amount;
        room.total += amount;
        room.stays.push(detail);
        rooms.set(roomAllocation.roomNumber, room);
      }
    }
    return {
      ...row,
      allocation,
      realized,
      unrealized,
      nights,
      roomType: row.roomType ?? roomAllocations[0]?.roomType ?? "待設定房型",
      roomNumbers,
      roomLabel: roomNumbers.join("／"),
      roomAllocations: roomAllocations.map(({ roomNumber, roomType, allocatedAmount }) => ({ roomNumber, roomType, allocatedAmount })),
    };
  }).filter((row) => row.allocation > 0).sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate) || a.createdAt.localeCompare(b.createdAt));

  const expected = orders.reduce((sum, row) => sum + row.allocation, 0);
  const realized = orders.reduce((sum, row) => sum + row.realized, 0);
  const unrealized = orders.reduce((sum, row) => sum + row.unrealized, 0);
  const expensesTotal = expenseRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  return Response.json({
    from,
    to,
    revenue: {
      expected,
      realized,
      unrealized,
      received: orderRows.reduce((sum, row) => sum + (row.receivedAmount ?? 0), 0),
      pending: orderRows.reduce((sum, row) => sum + (row.balanceAmount ?? 0), 0),
      orderCount: orders.length,
    },
    expenses: expensesTotal,
    daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
    rooms: Array.from(rooms.values()).sort((a, b) => b.total - a.total),
    orders,
  });
}
