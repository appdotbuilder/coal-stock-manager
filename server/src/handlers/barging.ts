import { db } from '../db';
import { 
  bargingRecordsTable,
  contractorsTable,
  jettiesTable,
  usersTable,
  stockTable
} from '../db/schema';
import { 
  type CreateBargingRecordInput, 
  type BargingRecord 
} from '../schema';
import { eq, and, sql } from 'drizzle-orm';

export async function createBargingRecord(input: CreateBargingRecordInput): Promise<BargingRecord> {
  try {
    return await db.transaction(async (tx) => {
      // 1. Validate contractor exists and is active
      const contractor = await tx.select()
        .from(contractorsTable)
        .where(eq(contractorsTable.id, input.contractor_id))
        .execute();

      if (contractor.length === 0) {
        throw new Error(`Contractor with ID ${input.contractor_id} not found`);
      }

      if (!contractor[0].is_active) {
        throw new Error(`Contractor with ID ${input.contractor_id} is inactive`);
      }

      // 2. Validate jetty exists and is active
      const jetty = await tx.select()
        .from(jettiesTable)
        .where(eq(jettiesTable.id, input.jetty_id))
        .execute();

      if (jetty.length === 0) {
        throw new Error(`Jetty with ID ${input.jetty_id} not found`);
      }

      if (!jetty[0].is_active) {
        throw new Error(`Jetty with ID ${input.jetty_id} is inactive`);
      }

      // 3. Validate operator exists and is active
      const operator = await tx.select()
        .from(usersTable)
        .where(eq(usersTable.id, input.operator_id))
        .execute();

      if (operator.length === 0) {
        throw new Error(`Operator with ID ${input.operator_id} not found`);
      }

      if (!operator[0].is_active) {
        throw new Error(`Operator with ID ${input.operator_id} is inactive`);
      }

      // 4. Find and validate stock availability with optimistic locking
      const stockRecord = await tx.select()
        .from(stockTable)
        .where(
          and(
            eq(stockTable.contractor_id, input.contractor_id),
            eq(stockTable.jetty_id, input.jetty_id)
          )
        )
        .execute();

      if (stockRecord.length === 0) {
        throw new Error(`No stock found for contractor ${input.contractor_id} at jetty ${input.jetty_id}`);
      }

      const currentStock = parseFloat(stockRecord[0].tonnage);
      const bargingTonnage = input.tonnage;

      if (bargingTonnage <= 0) {
        throw new Error('Barging tonnage must be positive');
      }

      if (currentStock < bargingTonnage) {
        throw new Error(`Insufficient stock. Available: ${currentStock} tons, Requested: ${bargingTonnage} tons`);
      }

      // 5. Insert barging record
      const bargingResult = await tx.insert(bargingRecordsTable)
        .values({
          date_time: input.date_time,
          contractor_id: input.contractor_id,
          ship_batch_number: input.ship_batch_number,
          tonnage: input.tonnage.toString(), // Convert number to string for numeric column
          jetty_id: input.jetty_id,
          buyer: input.buyer,
          loading_document: input.loading_document,
          operator_id: input.operator_id,
          notes: input.notes
        })
        .returning()
        .execute();

      const createdRecord = bargingResult[0];

      // 6. Update stock with optimistic locking
      const newTonnage = currentStock - bargingTonnage;
      const updatedStock = await tx.update(stockTable)
        .set({
          tonnage: newTonnage.toString(),
          last_updated: new Date(),
          version: sql`${stockTable.version} + 1`,
          updated_at: new Date()
        })
        .where(
          and(
            eq(stockTable.id, stockRecord[0].id),
            eq(stockTable.version, stockRecord[0].version) // Optimistic locking
          )
        )
        .returning()
        .execute();

      if (updatedStock.length === 0) {
        throw new Error('Stock was modified by another operation. Please try again.');
      }

      // Convert numeric fields back to numbers before returning
      return {
        ...createdRecord,
        tonnage: parseFloat(createdRecord.tonnage)
      };
    });
  } catch (error) {
    console.error('Barging record creation failed:', error);
    throw error;
  }
}

export async function getBargingRecords(
  dateFrom?: Date, 
  dateTo?: Date, 
  contractorId?: number,
  jettyId?: number
): Promise<BargingRecord[]> {
  // This is a placeholder declaration! Real code should be implemented here.
  // The goal of this handler is to fetch barging records with filtering.
  // It should:
  // 1. Query barging records with optional filters
  // 2. Join with contractor, jetty, and operator data
  // 3. Order by date_time descending
  // 4. Apply pagination if needed
  // 5. Return barging records with related data
  
  return Promise.resolve([]);
}

export async function getBargingRecordById(id: number): Promise<BargingRecord | null> {
  // This is a placeholder declaration! Real code should be implemented here.
  // The goal of this handler is to fetch a specific barging record.
  // It should:
  // 1. Query barging record by ID
  // 2. Include related contractor, jetty, and operator information
  // 3. Return barging record with relations or null
  
  return Promise.resolve(null);
}

export async function validateStockForBarging(
  contractorId: number, 
  jettyId: number, 
  tonnage: number
): Promise<{ valid: boolean; availableStock: number; message?: string }> {
  // This is a placeholder declaration! Real code should be implemented here.
  // The goal of this handler is to validate stock availability before barging.
  // It should:
  // 1. Query current stock for contractor-jetty combination
  // 2. Check if requested tonnage is available
  // 3. Return validation result with available stock info
  // 4. Include helpful error messages for insufficient stock
  
  return Promise.resolve({
    valid: true,
    availableStock: 1000
  });
}

export async function getDailyBargingSummary(date: Date): Promise<{
  total_tonnage: number;
  records_count: number;
  by_contractor: Array<{ contractor_id: number; contractor_name: string; tonnage: number }>;
  by_jetty: Array<{ jetty_id: number; jetty_name: string; tonnage: number }>;
  by_buyer: Array<{ buyer: string; tonnage: number }>;
}> {
  // This is a placeholder declaration! Real code should be implemented here.
  // The goal of this handler is to provide daily barging analytics.
  // It should:
  // 1. Query barging records for specific date
  // 2. Aggregate tonnage by contractor, jetty, and buyer
  // 3. Calculate total tonnage and record count
  // 4. Return structured summary data for dashboard
  
  return Promise.resolve({
    total_tonnage: 0,
    records_count: 0,
    by_contractor: [],
    by_jetty: [],
    by_buyer: []
  });
}