import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  numeric, 
  integer, 
  boolean, 
  pgEnum,
  varchar,
  jsonb
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'operator_produksi', 'operator_barging', 'auditor', 'viewer']);
export const coalGradeEnum = pgEnum('coal_grade', ['high', 'medium', 'low']);
export const adjustmentReasonEnum = pgEnum('adjustment_reason', ['manual_correction', 'waste', 'spillage', 'measurement_error', 'other']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  password_hash: text('password_hash').notNull(),
  full_name: text('full_name').notNull(),
  role: userRoleEnum('role').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  last_login: timestamp('last_login'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Jetties table
export const jettiesTable = pgTable('jetties', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  capacity: numeric('capacity', { precision: 12, scale: 2 }).notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Contractors table
export const contractorsTable = pgTable('contractors', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  contact_person: text('contact_person').notNull(),
  contract_number: varchar('contract_number', { length: 100 }),
  default_grade: coalGradeEnum('default_grade').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  deleted_at: timestamp('deleted_at')
});

// Production records table
export const productionRecordsTable = pgTable('production_records', {
  id: serial('id').primaryKey(),
  date_time: timestamp('date_time').notNull(),
  contractor_id: integer('contractor_id').notNull(),
  truck_number: varchar('truck_number', { length: 100 }).notNull(),
  tonnage: numeric('tonnage', { precision: 12, scale: 2 }).notNull(),
  coal_grade: coalGradeEnum('coal_grade').notNull(),
  jetty_id: integer('jetty_id').notNull(),
  document_photo: text('document_photo'),
  operator_id: integer('operator_id').notNull(),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Barging records table
export const bargingRecordsTable = pgTable('barging_records', {
  id: serial('id').primaryKey(),
  date_time: timestamp('date_time').notNull(),
  contractor_id: integer('contractor_id').notNull(),
  ship_batch_number: varchar('ship_batch_number', { length: 100 }).notNull(),
  tonnage: numeric('tonnage', { precision: 12, scale: 2 }).notNull(),
  jetty_id: integer('jetty_id').notNull(),
  buyer: text('buyer'),
  loading_document: text('loading_document'),
  operator_id: integer('operator_id').notNull(),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Stock table
export const stockTable = pgTable('stock', {
  id: serial('id').primaryKey(),
  contractor_id: integer('contractor_id').notNull(),
  jetty_id: integer('jetty_id').notNull(),
  tonnage: numeric('tonnage', { precision: 12, scale: 2 }).notNull().default('0'),
  last_updated: timestamp('last_updated').defaultNow().notNull(),
  version: integer('version').notNull().default(1), // For optimistic locking
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Stock adjustments table
export const stockAdjustmentsTable = pgTable('stock_adjustments', {
  id: serial('id').primaryKey(),
  stock_id: integer('stock_id').notNull(),
  adjusted_by: integer('adjusted_by').notNull(),
  previous_tonnage: numeric('previous_tonnage', { precision: 12, scale: 2 }).notNull(),
  new_tonnage: numeric('new_tonnage', { precision: 12, scale: 2 }).notNull(),
  adjustment_amount: numeric('adjustment_amount', { precision: 12, scale: 2 }).notNull(),
  reason: adjustmentReasonEnum('reason').notNull(),
  reason_description: text('reason_description').notNull(),
  reference_document: text('reference_document'),
  attachment: text('attachment'),
  approved_by: integer('approved_by'),
  approved_at: timestamp('approved_at'),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Fuel purchases table
export const fuelPurchasesTable = pgTable('fuel_purchases', {
  id: serial('id').primaryKey(),
  date: timestamp('date').notNull(),
  supplier: text('supplier').notNull(),
  volume_liters: numeric('volume_liters', { precision: 12, scale: 2 }).notNull(),
  cost: numeric('cost', { precision: 12, scale: 2 }).notNull(),
  invoice_number: varchar('invoice_number', { length: 100 }).notNull(),
  jetty_id: integer('jetty_id').notNull(),
  machine_destination: text('machine_destination'),
  created_by: integer('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Fuel usage table
export const fuelUsageTable = pgTable('fuel_usage', {
  id: serial('id').primaryKey(),
  date: timestamp('date').notNull(),
  machine_equipment: text('machine_equipment').notNull(),
  operator: text('operator').notNull(),
  volume_liters: numeric('volume_liters', { precision: 12, scale: 2 }).notNull(),
  production_tonnage: numeric('production_tonnage', { precision: 12, scale: 2 }).notNull(),
  production_record_id: integer('production_record_id'),
  created_by: integer('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Audit log table (immutable)
export const auditLogTable = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull(),
  action: text('action').notNull(),
  table_name: text('table_name').notNull(),
  record_id: integer('record_id'),
  old_values: jsonb('old_values'),
  new_values: jsonb('new_values'),
  ip_address: varchar('ip_address', { length: 45 }),
  user_agent: text('user_agent'),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  productionRecords: many(productionRecordsTable),
  bargingRecords: many(bargingRecordsTable),
  stockAdjustments: many(stockAdjustmentsTable),
  fuelPurchases: many(fuelPurchasesTable),
  fuelUsage: many(fuelUsageTable),
  auditLogs: many(auditLogTable)
}));

export const jettiesRelations = relations(jettiesTable, ({ many }) => ({
  productionRecords: many(productionRecordsTable),
  bargingRecords: many(bargingRecordsTable),
  stock: many(stockTable),
  fuelPurchases: many(fuelPurchasesTable)
}));

export const contractorsRelations = relations(contractorsTable, ({ many }) => ({
  productionRecords: many(productionRecordsTable),
  bargingRecords: many(bargingRecordsTable),
  stock: many(stockTable)
}));

export const productionRecordsRelations = relations(productionRecordsTable, ({ one, many }) => ({
  contractor: one(contractorsTable, {
    fields: [productionRecordsTable.contractor_id],
    references: [contractorsTable.id]
  }),
  jetty: one(jettiesTable, {
    fields: [productionRecordsTable.jetty_id],
    references: [jettiesTable.id]
  }),
  operator: one(usersTable, {
    fields: [productionRecordsTable.operator_id],
    references: [usersTable.id]
  }),
  fuelUsage: many(fuelUsageTable)
}));

export const bargingRecordsRelations = relations(bargingRecordsTable, ({ one }) => ({
  contractor: one(contractorsTable, {
    fields: [bargingRecordsTable.contractor_id],
    references: [contractorsTable.id]
  }),
  jetty: one(jettiesTable, {
    fields: [bargingRecordsTable.jetty_id],
    references: [jettiesTable.id]
  }),
  operator: one(usersTable, {
    fields: [bargingRecordsTable.operator_id],
    references: [usersTable.id]
  })
}));

export const stockRelations = relations(stockTable, ({ one, many }) => ({
  contractor: one(contractorsTable, {
    fields: [stockTable.contractor_id],
    references: [contractorsTable.id]
  }),
  jetty: one(jettiesTable, {
    fields: [stockTable.jetty_id],
    references: [jettiesTable.id]
  }),
  adjustments: many(stockAdjustmentsTable)
}));

export const stockAdjustmentsRelations = relations(stockAdjustmentsTable, ({ one }) => ({
  stock: one(stockTable, {
    fields: [stockAdjustmentsTable.stock_id],
    references: [stockTable.id]
  }),
  adjustedBy: one(usersTable, {
    fields: [stockAdjustmentsTable.adjusted_by],
    references: [usersTable.id]
  }),
  approvedBy: one(usersTable, {
    fields: [stockAdjustmentsTable.approved_by],
    references: [usersTable.id]
  })
}));

export const fuelPurchasesRelations = relations(fuelPurchasesTable, ({ one }) => ({
  jetty: one(jettiesTable, {
    fields: [fuelPurchasesTable.jetty_id],
    references: [jettiesTable.id]
  }),
  createdBy: one(usersTable, {
    fields: [fuelPurchasesTable.created_by],
    references: [usersTable.id]
  })
}));

export const fuelUsageRelations = relations(fuelUsageTable, ({ one }) => ({
  productionRecord: one(productionRecordsTable, {
    fields: [fuelUsageTable.production_record_id],
    references: [productionRecordsTable.id]
  }),
  createdBy: one(usersTable, {
    fields: [fuelUsageTable.created_by],
    references: [usersTable.id]
  })
}));

export const auditLogRelations = relations(auditLogTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [auditLogTable.user_id],
    references: [usersTable.id]
  })
}));

// Export all tables for use in handlers
export const tables = {
  users: usersTable,
  jetties: jettiesTable,
  contractors: contractorsTable,
  productionRecords: productionRecordsTable,
  bargingRecords: bargingRecordsTable,
  stock: stockTable,
  stockAdjustments: stockAdjustmentsTable,
  fuelPurchases: fuelPurchasesTable,
  fuelUsage: fuelUsageTable,
  auditLog: auditLogTable
};

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type Jetty = typeof jettiesTable.$inferSelect;
export type NewJetty = typeof jettiesTable.$inferInsert;

export type Contractor = typeof contractorsTable.$inferSelect;
export type NewContractor = typeof contractorsTable.$inferInsert;

export type ProductionRecord = typeof productionRecordsTable.$inferSelect;
export type NewProductionRecord = typeof productionRecordsTable.$inferInsert;

export type BargingRecord = typeof bargingRecordsTable.$inferSelect;
export type NewBargingRecord = typeof bargingRecordsTable.$inferInsert;

export type Stock = typeof stockTable.$inferSelect;
export type NewStock = typeof stockTable.$inferInsert;

export type StockAdjustment = typeof stockAdjustmentsTable.$inferSelect;
export type NewStockAdjustment = typeof stockAdjustmentsTable.$inferInsert;

export type FuelPurchase = typeof fuelPurchasesTable.$inferSelect;
export type NewFuelPurchase = typeof fuelPurchasesTable.$inferInsert;

export type FuelUsage = typeof fuelUsageTable.$inferSelect;
export type NewFuelUsage = typeof fuelUsageTable.$inferInsert;

export type AuditLog = typeof auditLogTable.$inferSelect;
export type NewAuditLog = typeof auditLogTable.$inferInsert;