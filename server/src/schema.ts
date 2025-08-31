import { z } from 'zod';

// User roles enum
export const userRoleSchema = z.enum(['admin', 'operator_produksi', 'operator_barging', 'auditor', 'viewer']);
export type UserRole = z.infer<typeof userRoleSchema>;

// Coal grades enum
export const coalGradeSchema = z.enum(['high', 'medium', 'low']);
export type CoalGrade = z.infer<typeof coalGradeSchema>;

// Stock adjustment reasons enum
export const adjustmentReasonSchema = z.enum(['manual_correction', 'waste', 'spillage', 'measurement_error', 'other']);
export type AdjustmentReason = z.infer<typeof adjustmentReasonSchema>;

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  username: z.string(),
  password_hash: z.string(),
  full_name: z.string(),
  role: userRoleSchema,
  is_active: z.boolean(),
  last_login: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Jetty schema
export const jettySchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  capacity: z.number(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Jetty = z.infer<typeof jettySchema>;

// Contractor schema
export const contractorSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  contact_person: z.string(),
  contract_number: z.string().nullable(),
  default_grade: coalGradeSchema,
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  deleted_at: z.coerce.date().nullable()
});

export type Contractor = z.infer<typeof contractorSchema>;

// Production record schema
export const productionRecordSchema = z.object({
  id: z.number(),
  date_time: z.coerce.date(),
  contractor_id: z.number(),
  truck_number: z.string(),
  tonnage: z.number(),
  coal_grade: coalGradeSchema,
  jetty_id: z.number(),
  document_photo: z.string().nullable(),
  operator_id: z.number(),
  notes: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type ProductionRecord = z.infer<typeof productionRecordSchema>;

// Barging record schema
export const bargingRecordSchema = z.object({
  id: z.number(),
  date_time: z.coerce.date(),
  contractor_id: z.number(),
  ship_batch_number: z.string(),
  tonnage: z.number(),
  jetty_id: z.number(),
  buyer: z.string().nullable(),
  loading_document: z.string().nullable(),
  operator_id: z.number(),
  notes: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type BargingRecord = z.infer<typeof bargingRecordSchema>;

// Stock schema
export const stockSchema = z.object({
  id: z.number(),
  contractor_id: z.number(),
  jetty_id: z.number(),
  tonnage: z.number(),
  last_updated: z.coerce.date(),
  version: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Stock = z.infer<typeof stockSchema>;

// Stock adjustment schema
export const stockAdjustmentSchema = z.object({
  id: z.number(),
  stock_id: z.number(),
  adjusted_by: z.number(),
  previous_tonnage: z.number(),
  new_tonnage: z.number(),
  adjustment_amount: z.number(),
  reason: adjustmentReasonSchema,
  reason_description: z.string(),
  reference_document: z.string().nullable(),
  attachment: z.string().nullable(),
  approved_by: z.number().nullable(),
  approved_at: z.coerce.date().nullable(),
  created_at: z.coerce.date()
});

export type StockAdjustment = z.infer<typeof stockAdjustmentSchema>;

// Fuel purchase schema
export const fuelPurchaseSchema = z.object({
  id: z.number(),
  date: z.coerce.date(),
  supplier: z.string(),
  volume_liters: z.number(),
  cost: z.number(),
  invoice_number: z.string(),
  jetty_id: z.number(),
  machine_destination: z.string().nullable(),
  created_by: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type FuelPurchase = z.infer<typeof fuelPurchaseSchema>;

// Fuel usage schema
export const fuelUsageSchema = z.object({
  id: z.number(),
  date: z.coerce.date(),
  machine_equipment: z.string(),
  operator: z.string(),
  volume_liters: z.number(),
  production_tonnage: z.number(),
  production_record_id: z.number().nullable(),
  created_by: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type FuelUsage = z.infer<typeof fuelUsageSchema>;

// Audit log schema
export const auditLogSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  action: z.string(),
  table_name: z.string(),
  record_id: z.number().nullable(),
  old_values: z.string().nullable(), // JSON string
  new_values: z.string().nullable(), // JSON string
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  created_at: z.coerce.date()
});

export type AuditLog = z.infer<typeof auditLogSchema>;

// Input schemas for creating records
export const createUserInputSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3),
  password: z.string().min(6),
  full_name: z.string(),
  role: userRoleSchema
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const createJettyInputSchema = z.object({
  name: z.string(),
  code: z.string(),
  capacity: z.number().positive()
});

export type CreateJettyInput = z.infer<typeof createJettyInputSchema>;

export const createContractorInputSchema = z.object({
  name: z.string(),
  code: z.string(),
  contact_person: z.string(),
  contract_number: z.string().nullable(),
  default_grade: coalGradeSchema
});

export type CreateContractorInput = z.infer<typeof createContractorInputSchema>;

export const createProductionRecordInputSchema = z.object({
  date_time: z.coerce.date(),
  contractor_id: z.number(),
  truck_number: z.string(),
  tonnage: z.number().positive(),
  coal_grade: coalGradeSchema,
  jetty_id: z.number(),
  document_photo: z.string().nullable(),
  operator_id: z.number(),
  notes: z.string().nullable()
});

export type CreateProductionRecordInput = z.infer<typeof createProductionRecordInputSchema>;

export const createBargingRecordInputSchema = z.object({
  date_time: z.coerce.date(),
  contractor_id: z.number(),
  ship_batch_number: z.string(),
  tonnage: z.number().positive(),
  jetty_id: z.number(),
  buyer: z.string().nullable(),
  loading_document: z.string().nullable(),
  operator_id: z.number(),
  notes: z.string().nullable()
});

export type CreateBargingRecordInput = z.infer<typeof createBargingRecordInputSchema>;

export const createStockAdjustmentInputSchema = z.object({
  stock_id: z.number(),
  adjustment_amount: z.number(),
  reason: adjustmentReasonSchema,
  reason_description: z.string(),
  reference_document: z.string().nullable(),
  attachment: z.string().nullable(),
  adjusted_by: z.number()
});

export type CreateStockAdjustmentInput = z.infer<typeof createStockAdjustmentInputSchema>;

export const createFuelPurchaseInputSchema = z.object({
  date: z.coerce.date(),
  supplier: z.string(),
  volume_liters: z.number().positive(),
  cost: z.number().positive(),
  invoice_number: z.string(),
  jetty_id: z.number(),
  machine_destination: z.string().nullable(),
  created_by: z.number()
});

export type CreateFuelPurchaseInput = z.infer<typeof createFuelPurchaseInputSchema>;

export const createFuelUsageInputSchema = z.object({
  date: z.coerce.date(),
  machine_equipment: z.string(),
  operator: z.string(),
  volume_liters: z.number().positive(),
  production_tonnage: z.number().positive(),
  production_record_id: z.number().nullable(),
  created_by: z.number()
});

export type CreateFuelUsageInput = z.infer<typeof createFuelUsageInputSchema>;

// Update schemas
export const updateContractorInputSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  code: z.string().optional(),
  contact_person: z.string().optional(),
  contract_number: z.string().nullable().optional(),
  default_grade: coalGradeSchema.optional(),
  is_active: z.boolean().optional()
});

export type UpdateContractorInput = z.infer<typeof updateContractorInputSchema>;

export const updateJettyInputSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  code: z.string().optional(),
  capacity: z.number().positive().optional(),
  is_active: z.boolean().optional()
});

export type UpdateJettyInput = z.infer<typeof updateJettyInputSchema>;

// Login schema
export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// Filter schemas
export const stockFilterSchema = z.object({
  contractor_id: z.number().optional(),
  jetty_id: z.number().optional(),
  date_from: z.coerce.date().optional(),
  date_to: z.coerce.date().optional()
});

export type StockFilter = z.infer<typeof stockFilterSchema>;

export const auditLogFilterSchema = z.object({
  user_id: z.number().optional(),
  action: z.string().optional(),
  table_name: z.string().optional(),
  date_from: z.coerce.date().optional(),
  date_to: z.coerce.date().optional()
});

export type AuditLogFilter = z.infer<typeof auditLogFilterSchema>;

// Dashboard data schemas
export const dashboardStatsSchema = z.object({
  total_stock: z.number(),
  daily_production: z.number(),
  daily_barging: z.number(),
  active_contractors: z.number(),
  stock_by_jetty: z.array(z.object({
    jetty_id: z.number(),
    jetty_name: z.string(),
    total_tonnage: z.number()
  })),
  stock_by_contractor: z.array(z.object({
    contractor_id: z.number(),
    contractor_name: z.string(),
    total_tonnage: z.number()
  }))
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

export const recentActivitySchema = z.object({
  id: z.number(),
  type: z.enum(['production', 'barging', 'stock_adjustment', 'fuel_purchase']),
  description: z.string(),
  tonnage: z.number().nullable(),
  operator_name: z.string(),
  created_at: z.coerce.date()
});

export type RecentActivity = z.infer<typeof recentActivitySchema>;