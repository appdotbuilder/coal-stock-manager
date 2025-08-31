import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  loginInputSchema,
  createUserInputSchema,
  createJettyInputSchema,
  updateJettyInputSchema,
  createContractorInputSchema,
  updateContractorInputSchema,
  createProductionRecordInputSchema,
  createBargingRecordInputSchema,
  createStockAdjustmentInputSchema,
  createFuelPurchaseInputSchema,
  createFuelUsageInputSchema,
  stockFilterSchema,
  auditLogFilterSchema
} from './schema';

// Import handlers
import { login, verifyToken, refreshToken } from './handlers/auth';
import { createUser, getUsers, getUserById, updateUser, deactivateUser, getUsersByRole } from './handlers/users';
import { createJetty, getJetties, getActiveJetties, getJettyById, updateJetty } from './handlers/jetties';
import { 
  createContractor, 
  getContractors, 
  getContractorById, 
  updateContractor, 
  deleteContractor 
} from './handlers/contractors';
import {
  createProductionRecord,
  getProductionRecords,
  getProductionRecordById,
  getDailyProductionSummary
} from './handlers/production';
import {
  createBargingRecord,
  getBargingRecords,
  getBargingRecordById,
  validateStockForBarging,
  getDailyBargingSummary
} from './handlers/barging';
import {
  getStock,
  getStockByContractor,
  getStockByJetty,
  getTotalStock,
  createStockAdjustment,
  getStockAdjustments,
  approveStockAdjustment
} from './handlers/stock';
import {
  createFuelPurchase,
  createFuelUsage,
  getFuelPurchases,
  getFuelUsage,
  getFuelPurchaseById,
  getFuelUsageById,
  getFuelSummary
} from './handlers/fuel';
import {
  getDashboardStats,
  getRecentActivity,
  getKPIMetrics,
  getStockTrends,
  getContractorPerformance
} from './handlers/dashboard';
import {
  getAuditLogs,
  getAuditLogById,
  getAuditLogsByRecord,
  getAuditSummary,
  exportAuditLogs
} from './handlers/audit';
import {
  generateStockReport,
  generateProductionReport,
  generateBargingReport,
  generateFuelReport,
  generateContractorReport,
  generateMovementReport,
  generateExecutiveSummary
} from './handlers/reports';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication
  auth: router({
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => login(input)),
    verifyToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(({ input }) => verifyToken(input.token)),
    refreshToken: publicProcedure
      .input(z.object({ refreshToken: z.string() }))
      .mutation(({ input }) => refreshToken(input.refreshToken)),
  }),

  // User management
  users: router({
    create: publicProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => createUser(input)),
    getAll: publicProcedure
      .query(() => getUsers()),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getUserById(input.id)),
    update: publicProcedure
      .input(z.object({ 
        id: z.number(), 
        updates: z.object({
          email: z.string().email().optional(),
          username: z.string().optional(),
          full_name: z.string().optional(),
          role: z.enum(['admin', 'operator_produksi', 'operator_barging', 'auditor', 'viewer']).optional(),
          is_active: z.boolean().optional()
        }) 
      }))
      .mutation(({ input }) => updateUser(input.id, input.updates)),
    deactivate: publicProcedure
      .input(z.object({ id: z.number(), deactivatedBy: z.number() }))
      .mutation(({ input }) => deactivateUser(input.id, input.deactivatedBy)),
    getByRole: publicProcedure
      .input(z.object({ role: z.enum(['admin', 'operator_produksi', 'operator_barging', 'auditor', 'viewer']) }))
      .query(({ input }) => getUsersByRole(input.role)),
  }),

  // Jetty management
  jetties: router({
    create: publicProcedure
      .input(createJettyInputSchema)
      .mutation(({ input }) => createJetty(input)),
    getAll: publicProcedure
      .query(() => getJetties()),
    getActive: publicProcedure
      .query(() => getActiveJetties()),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getJettyById(input.id)),
    update: publicProcedure
      .input(updateJettyInputSchema)
      .mutation(({ input }) => updateJetty(input)),
  }),

  // Contractor management
  contractors: router({
    create: publicProcedure
      .input(createContractorInputSchema)
      .mutation(({ input }) => createContractor(input)),
    getAll: publicProcedure
      .query(() => getContractors()),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getContractorById(input.id)),
    update: publicProcedure
      .input(updateContractorInputSchema)
      .mutation(({ input }) => updateContractor(input)),
    delete: publicProcedure
      .input(z.object({ id: z.number(), deletedBy: z.number() }))
      .mutation(({ input }) => deleteContractor(input.id, input.deletedBy)),
  }),

  // Production records
  production: router({
    create: publicProcedure
      .input(createProductionRecordInputSchema)
      .mutation(({ input }) => createProductionRecord(input)),
    getAll: publicProcedure
      .input(z.object({ 
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        contractorId: z.number().optional(),
        jettyId: z.number().optional()
      }))
      .query(({ input }) => getProductionRecords(input.dateFrom, input.dateTo, input.contractorId, input.jettyId)),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProductionRecordById(input.id)),
    getDailySummary: publicProcedure
      .input(z.object({ date: z.coerce.date() }))
      .query(({ input }) => getDailyProductionSummary(input.date)),
  }),

  // Barging records
  barging: router({
    create: publicProcedure
      .input(createBargingRecordInputSchema)
      .mutation(({ input }) => createBargingRecord(input)),
    getAll: publicProcedure
      .input(z.object({ 
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        contractorId: z.number().optional(),
        jettyId: z.number().optional()
      }))
      .query(({ input }) => getBargingRecords(input.dateFrom, input.dateTo, input.contractorId, input.jettyId)),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getBargingRecordById(input.id)),
    validateStock: publicProcedure
      .input(z.object({ 
        contractorId: z.number(),
        jettyId: z.number(),
        tonnage: z.number().positive()
      }))
      .query(({ input }) => validateStockForBarging(input.contractorId, input.jettyId, input.tonnage)),
    getDailySummary: publicProcedure
      .input(z.object({ date: z.coerce.date() }))
      .query(({ input }) => getDailyBargingSummary(input.date)),
  }),

  // Stock management
  stock: router({
    getAll: publicProcedure
      .input(stockFilterSchema.optional())
      .query(({ input }) => getStock(input)),
    getByContractor: publicProcedure
      .query(() => getStockByContractor()),
    getByJetty: publicProcedure
      .query(() => getStockByJetty()),
    getTotalStock: publicProcedure
      .query(() => getTotalStock()),
    createAdjustment: publicProcedure
      .input(createStockAdjustmentInputSchema)
      .mutation(({ input }) => createStockAdjustment(input)),
    getAdjustments: publicProcedure
      .input(z.object({
        stockId: z.number().optional(),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional()
      }))
      .query(({ input }) => getStockAdjustments(input.stockId, input.dateFrom, input.dateTo)),
    approveAdjustment: publicProcedure
      .input(z.object({ 
        adjustmentId: z.number(),
        approvedBy: z.number()
      }))
      .mutation(({ input }) => approveStockAdjustment(input.adjustmentId, input.approvedBy)),
  }),

  // Fuel management
  fuel: router({
    createPurchase: publicProcedure
      .input(createFuelPurchaseInputSchema)
      .mutation(({ input }) => createFuelPurchase(input)),
    createUsage: publicProcedure
      .input(createFuelUsageInputSchema)
      .mutation(({ input }) => createFuelUsage(input)),
    getPurchases: publicProcedure
      .input(z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        jettyId: z.number().optional(),
        supplier: z.string().optional()
      }))
      .query(({ input }) => getFuelPurchases(input.dateFrom, input.dateTo, input.jettyId, input.supplier)),
    getUsage: publicProcedure
      .input(z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        machineEquipment: z.string().optional(),
        operator: z.string().optional()
      }))
      .query(({ input }) => getFuelUsage(input.dateFrom, input.dateTo, input.machineEquipment, input.operator)),
    getPurchaseById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getFuelPurchaseById(input.id)),
    getUsageById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getFuelUsageById(input.id)),
    getSummary: publicProcedure
      .input(z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional()
      }))
      .query(({ input }) => getFuelSummary(input.dateFrom, input.dateTo)),
  }),

  // Dashboard
  dashboard: router({
    getStats: publicProcedure
      .query(() => getDashboardStats()),
    getRecentActivity: publicProcedure
      .input(z.object({ limit: z.number().default(10) }))
      .query(({ input }) => getRecentActivity(input.limit)),
    getKPIMetrics: publicProcedure
      .input(z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional()
      }))
      .query(({ input }) => getKPIMetrics(input.dateFrom, input.dateTo)),
    getStockTrends: publicProcedure
      .input(z.object({ days: z.number().default(30) }))
      .query(({ input }) => getStockTrends(input.days)),
    getContractorPerformance: publicProcedure
      .input(z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional()
      }))
      .query(({ input }) => getContractorPerformance(input.dateFrom, input.dateTo)),
  }),

  // Audit logs
  audit: router({
    getLogs: publicProcedure
      .input(auditLogFilterSchema.optional())
      .query(({ input }) => getAuditLogs(input)),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getAuditLogById(input.id)),
    getByRecord: publicProcedure
      .input(z.object({ 
        tableName: z.string(),
        recordId: z.number()
      }))
      .query(({ input }) => getAuditLogsByRecord(input.tableName, input.recordId)),
    getSummary: publicProcedure
      .input(z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional()
      }))
      .query(({ input }) => getAuditSummary(input.dateFrom, input.dateTo)),
    export: publicProcedure
      .input(z.object({ 
        filter: auditLogFilterSchema.optional(),
        format: z.enum(['csv', 'pdf']).default('csv')
      }))
      .query(({ input }) => exportAuditLogs(input.filter, input.format)),
  }),

  // Reports
  reports: router({
    stock: publicProcedure
      .input(z.object({
        filter: stockFilterSchema.optional(),
        format: z.enum(['csv', 'pdf']).default('csv')
      }))
      .query(({ input }) => generateStockReport(input.filter, input.format)),
    production: publicProcedure
      .input(z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        contractorId: z.number().optional(),
        jettyId: z.number().optional(),
        format: z.enum(['csv', 'pdf']).default('csv')
      }))
      .query(({ input }) => generateProductionReport(
        input.dateFrom, 
        input.dateTo, 
        input.contractorId, 
        input.jettyId, 
        input.format
      )),
    barging: publicProcedure
      .input(z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        contractorId: z.number().optional(),
        jettyId: z.number().optional(),
        format: z.enum(['csv', 'pdf']).default('csv')
      }))
      .query(({ input }) => generateBargingReport(
        input.dateFrom, 
        input.dateTo, 
        input.contractorId, 
        input.jettyId, 
        input.format
      )),
    fuel: publicProcedure
      .input(z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        jettyId: z.number().optional(),
        format: z.enum(['csv', 'pdf']).default('csv')
      }))
      .query(({ input }) => generateFuelReport(
        input.dateFrom, 
        input.dateTo, 
        input.jettyId, 
        input.format
      )),
    contractors: publicProcedure
      .input(z.object({ format: z.enum(['csv', 'pdf']).default('csv') }))
      .query(({ input }) => generateContractorReport(input.format)),
    movement: publicProcedure
      .input(z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        contractorId: z.number().optional(),
        jettyId: z.number().optional(),
        format: z.enum(['csv', 'pdf']).default('csv')
      }))
      .query(({ input }) => generateMovementReport(
        input.dateFrom, 
        input.dateTo, 
        input.contractorId, 
        input.jettyId, 
        input.format
      )),
    executiveSummary: publicProcedure
      .input(z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        format: z.literal('pdf').default('pdf')
      }))
      .query(({ input }) => generateExecutiveSummary(
        input.dateFrom, 
        input.dateTo, 
        input.format
      )),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`Coal Mining Stock Management TRPC server listening at port: ${port}`);
}

start();