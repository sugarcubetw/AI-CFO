import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const roomTypes = sqliteTable("room_types", {
  id: text("id").primaryKey(),
  sourceName: text("source_name").notNull().unique(),
  displayName: text("display_name").notNull(),
  defaultRoomNumber: text("default_room_number").notNull(),
  isBookable: integer("is_bookable", { mode: "boolean" }).notNull().default(true),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const rooms = sqliteTable("rooms", {
  number: text("number").primaryKey(),
  roomTypeId: text("room_type_id").notNull().references(() => roomTypes.id),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const reservations = sqliteTable("reservations", {
  id: text("id").primaryKey(),
  sourceSystem: text("source_system").notNull().default("manual"),
  sourceChannel: text("source_channel").notNull(),
  otaExternalId: text("ota_external_id"),
  eventType: text("event_type").notNull().default("created"),
  status: text("status").notNull().default("pending"),
  guestName: text("guest_name").notNull(),
  guestContactMasked: text("guest_contact_masked"),
  arrivalDate: text("arrival_date").notNull(),
  departureDate: text("departure_date").notNull(),
  roomTypeId: text("room_type_id").references(() => roomTypes.id),
  roomNumber: text("room_number").references(() => rooms.number),
  adults: integer("adults").notNull().default(1),
  children: integer("children").notNull().default(0),
  infants: integer("infants").notNull().default(0),
  totalAmount: integer("total_amount").notNull().default(0),
  receivedAmount: integer("received_amount").notNull().default(0),
  balanceAmount: integer("balance_amount").notNull().default(0),
  paymentMethod: text("payment_method"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  specialRequests: text("special_requests"),
  importState: text("import_state").notNull().default("confirmed"),
  sourceMessageId: text("source_message_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_reservations_dates").on(table.arrivalDate, table.departureDate),
  index("idx_reservations_status").on(table.status),
  uniqueIndex("idx_reservations_source_message").on(table.sourceSystem, table.sourceMessageId),
]);

export const reservationEvents = sqliteTable("reservation_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  eventType: text("event_type").notNull(),
  eventHash: text("event_hash").notNull().unique(),
  sourceMessageId: text("source_message_id"),
  occurredAt: text("occurred_at").notNull(),
  payloadRedacted: text("payload_redacted").notNull(),
});

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  stage: text("stage").notNull(),
  amount: integer("amount").notNull(),
  method: text("method"),
  status: text("status").notNull(),
  confirmedBy: text("confirmed_by"),
  confirmedAt: text("confirmed_at"),
});

export const meals = sqliteTable("meals", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mealVersions = sqliteTable("meal_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mealId: text("meal_id").notNull().references(() => meals.id),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_meal_versions_meal_version").on(table.mealId, table.version),
]);

export const mealPrepItems = sqliteTable("meal_prep_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mealId: text("meal_id").notNull().references(() => meals.id),
  itemName: text("item_name").notNull(),
  quantityPerServing: integer("quantity_per_serving").notNull(),
  unit: text("unit").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const receptionChecklists = sqliteTable("reception_checklists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reservationId: text("reservation_id").notNull().unique().references(() => reservations.id),
  actualGuests: integer("actual_guests").notNull(),
  identityHash: text("identity_hash"),
  identityLast4: text("identity_last4"),
  identityVerified: integer("identity_verified", { mode: "boolean" }).notNull().default(false),
  breakfastTime: text("breakfast_time").notNull(),
  breakfastCount: integer("breakfast_count").notNull(),
  mealId: text("meal_id").references(() => meals.id),
  notes: text("notes"),
  completedBy: text("completed_by").notNull(),
  completedAt: text("completed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mealRequirements = sqliteTable("meal_requirements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  mealDate: text("meal_date").notNull(),
  mealTime: text("meal_time").notNull(),
  guestCount: integer("guest_count").notNull(),
  mealId: text("meal_id").references(() => meals.id),
  status: text("status").notNull().default("confirmed"),
  notes: text("notes"),
}, (table) => [
  uniqueIndex("idx_meal_requirement_reservation_date").on(table.reservationId, table.mealDate),
]);

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  objectType: text("object_type").notNull(),
  objectId: text("object_id").notNull(),
  detailRedacted: text("detail_redacted"),
  occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const prepReports = sqliteTable("prep_reports", {
  id: text("id").primaryKey(),
  periodFrom: text("period_from").notNull(),
  periodTo: text("period_to").notNull(),
  reportType: text("report_type").notNull(),
  revision: integer("revision").notNull().default(1),
  basedOnReportId: text("based_on_report_id"),
  generatedBy: text("generated_by").notNull(),
  generatedAt: text("generated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_prep_reports_period_revision").on(table.periodFrom, table.periodTo, table.revision),
  index("idx_prep_reports_period").on(table.periodFrom, table.periodTo),
]);

export const prepReportLines = sqliteTable("prep_report_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportId: text("report_id").notNull().references(() => prepReports.id),
  mealDate: text("meal_date").notNull(),
  demandState: text("demand_state").notNull(),
  mealId: text("meal_id").references(() => meals.id),
  mealName: text("meal_name"),
  guestCount: integer("guest_count").notNull(),
}, (table) => [
  index("idx_prep_report_lines_report").on(table.reportId),
]);
