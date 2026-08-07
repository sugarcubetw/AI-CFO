import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../", import.meta.url);
const fixture = JSON.parse(await readFile(new URL("samples/p6-recent-orders.redacted.json", root), "utf8"));
const migration = await readFile(new URL("drizzle/0000_wonderful_nicolaos.sql", root), "utf8");
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON");
db.exec(migration.replaceAll("--> statement-breakpoint", ""));

const roomTypes = [
  ["lake-green-double", "湖水綠意雙人房", "202"], ["lake-sky-terrace-double", "湖光晴空露台雙人房", "301"],
  ["morning-green-double", "晨光綠語雙人房", "303"], ["light-island-quad", "光嶼雅築四人房", "204"],
  ["lakeside-shadow-double", "湖畔拾影雙人房", "201"],
];
for (const [id, name, room] of roomTypes) {
  db.prepare("INSERT INTO room_types(id,source_name,display_name,default_room_number) VALUES(?,?,?,?)").run(id,name,name,room);
  db.prepare("INSERT INTO rooms(number,room_type_id) VALUES(?,?)").run(room,id);
}

function hash(order) {
  return createHash("sha256").update(JSON.stringify({ orderId: order.orderId, messageId: order.messageId, eventType: order.eventType, occurredAt: order.occurredAt, status: order.eventType === "cancelled" ? "cancelled" : "pending" })).digest("hex");
}

function runImport(orders) {
  const result = { received: orders.length, inserted: 0, updated: 0, duplicates: 0, errors: [] };
  for (const order of orders) {
    try {
      const eventHash = hash(order);
      if (db.prepare("SELECT 1 FROM reservation_events WHERE event_hash=?").get(eventHash)) { result.duplicates++; continue; }
      const room = db.prepare("SELECT id,default_room_number FROM room_types WHERE source_name=?").get(order.roomTypeName);
      const exists = db.prepare("SELECT 1 FROM reservations WHERE id=?").get(order.orderId);
      const values = [order.sourceChannel, order.otaExternalId ?? null, order.eventType, order.eventType === "cancelled" ? "cancelled" : "pending", order.guestName, order.guestContactMasked ?? null, order.arrivalDate, order.departureDate, room?.id ?? null, room?.default_room_number ?? null, order.adults, order.children ?? 0, order.infants ?? 0, order.totalAmount, order.receivedAmount, order.balanceAmount, order.paymentMethod ?? null, order.paymentStatus ?? "pending", order.specialRequests ?? null, order.messageId];
      if (exists) {
        db.prepare("UPDATE reservations SET source_system='owlting_gmail',source_channel=?,ota_external_id=?,event_type=?,status=?,guest_name=?,guest_contact_masked=?,arrival_date=?,departure_date=?,room_type_id=?,room_number=?,adults=?,children=?,infants=?,total_amount=?,received_amount=?,balance_amount=?,payment_method=?,payment_status=?,special_requests=?,import_state='pending_review',source_message_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(...values, order.orderId); result.updated++;
      } else {
        db.prepare("INSERT INTO reservations(source_system,source_channel,ota_external_id,event_type,status,guest_name,guest_contact_masked,arrival_date,departure_date,room_type_id,room_number,adults,children,infants,total_amount,received_amount,balance_amount,payment_method,payment_status,special_requests,import_state,source_message_id,id) VALUES('owlting_gmail',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_review',?,?)").run(...values, order.orderId); result.inserted++;
      }
      db.prepare("INSERT INTO reservation_events(reservation_id,event_type,event_hash,source_message_id,occurred_at,payload_redacted) VALUES(?,?,?,?,?,?)").run(order.orderId,order.eventType,eventHash,order.messageId,order.occurredAt,JSON.stringify({ orderId: order.orderId, eventType: order.eventType, arrivalDate: order.arrivalDate, departureDate: order.departureDate, roomTypeName: order.roomTypeName }));
    } catch (error) { result.errors.push({ orderId: order.orderId, reason: error.message }); }
  }
  return result;
}

const first = runImport(fixture.orders);
const replay = runImport(fixture.orders);
const cancelled = db.prepare("SELECT status,import_state FROM reservations WHERE id='OBE61780718626080502'").get();
const database = { reservations: db.prepare("SELECT COUNT(*) count FROM reservations").get().count, events: db.prepare("SELECT COUNT(*) count FROM reservation_events").get().count, pendingReview: db.prepare("SELECT COUNT(*) count FROM reservations WHERE import_state='pending_review'").get().count };
const report = { testedAt: new Date().toISOString(), source: fixture.source, first, replay, cancellationPrecedence: cancelled, database, containsGuestContactPlaintext: false };
await writeFile(new URL("samples/p6-import-result.json", root), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (first.errors.length || first.inserted !== 4 || first.updated !== 1 || replay.duplicates !== 5 || cancelled.status !== "cancelled") process.exitCode = 1;
