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
  readAt: text("read_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_reservations_dates").on(table.arrivalDate, table.departureDate),
  index("idx_reservations_status").on(table.status),
  uniqueIndex("idx_reservations_source_message").on(table.sourceSystem, table.sourceMessageId),
  index("idx_reservations_created_read").on(table.createdAt, table.readAt),
]);

// A reservation may contain more than one room.  `reservations.room_number`
// remains as the legacy/primary room for existing screens, while this table is
// the authoritative room allocation list used for conflict checks and room
// level revenue analysis.
export const reservationRooms = sqliteTable("reservation_rooms", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
  roomNumber: text("room_number").notNull().references(() => rooms.number),
  roomTypeId: text("room_type_id").references(() => roomTypes.id),
  allocatedAmount: integer("allocated_amount").notNull().default(0),
  allocationMethod: text("allocation_method").notNull().default("equal"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_reservation_rooms_reservation_room").on(table.reservationId, table.roomNumber),
  index("idx_reservation_rooms_room").on(table.roomNumber),
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
}, (table) => [
  index("idx_audit_log_occurred_at").on(table.occurredAt),
  index("idx_audit_log_object").on(table.objectType, table.objectId),
]);

export const settingOptions = sqliteTable("setting_options", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  label: text("label").notNull(),
  scope: text("scope").notNull().default("*"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_setting_options_category_label_scope").on(table.category, table.label, table.scope),
  index("idx_setting_options_category_active_sort").on(table.category, table.isActive, table.sortOrder),
]);

export const automationJobs = sqliteTable("automation_jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  scheduleType: text("schedule_type").notNull().default("interval"),
  intervalMinutes: integer("interval_minutes"),
  timeOfDay: text("time_of_day"),
  timezone: text("timezone").notNull().default("Asia/Taipei"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: text("last_run_at"),
  lastStatus: text("last_status"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_automation_jobs_enabled_type").on(table.isEnabled, table.scheduleType),
]);

export const orderReconciliationRuns = sqliteTable("order_reconciliation_runs", {
  id: text("id").primaryKey(),
  sourceSystem: text("source_system").notNull().default("owlnest_export"),
  periodFrom: text("period_from").notNull(),
  periodTo: text("period_to").notNull(),
  sourceExportedAt: text("source_exported_at"),
  status: text("status").notNull().default("completed"),
  receivedCount: integer("received_count").notNull().default(0),
  matchedCount: integer("matched_count").notNull().default(0),
  insertedCount: integer("inserted_count").notNull().default(0),
  changedCount: integer("changed_count").notNull().default(0),
  missingCount: integer("missing_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  payloadHash: text("payload_hash"),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
  createdBy: text("created_by").notNull(),
  notes: text("notes"),
}, (table) => [
  index("idx_reconciliation_runs_period").on(table.periodFrom, table.periodTo),
  index("idx_reconciliation_runs_started").on(table.startedAt),
]);

export const orderReconciliationItems = sqliteTable("order_reconciliation_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull().references(() => orderReconciliationRuns.id),
  orderId: text("order_id").notNull(),
  action: text("action").notNull(),
  differenceJson: text("difference_json"),
  sourceRowJson: text("source_row_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_reconciliation_items_run").on(table.runId),
  index("idx_reconciliation_items_order").on(table.orderId),
]);

export const financialTransactions = sqliteTable("financial_transactions", {
  id: text("id").primaryKey(),
  transactionDate: text("transaction_date").notNull(),
  direction: text("direction").notNull().default("expense"),
  category: text("category").notNull(),
  item: text("item").notNull(),
  amount: integer("amount").notNull(),
  paymentMethod: text("payment_method"),
  vendor: text("vendor"),
  note: text("note"),
  receiptFileName: text("receipt_file_name"),
  source: text("source").notNull().default("mobile"),
  syncClientId: text("sync_client_id").notNull().unique(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_financial_transactions_date").on(table.transactionDate),
  index("idx_financial_transactions_category").on(table.category),
]);

// Finance module's durable expense ledger.  Orders remain the revenue source
// of truth; this table only stores expenditures entered by finance users.
export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  expenseDate: text("expense_date").notNull(),
  amount: integer("amount").notNull(),
  category: text("category").notNull(),
  subCategory: text("sub_category"),
  vendor: text("vendor"),
  paymentMethod: text("payment_method").notNull().default("other"),
  receiptUrl: text("receipt_url"),
  note: text("note"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_expenses_date").on(table.expenseDate),
  index("idx_expenses_category").on(table.category),
]);

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
