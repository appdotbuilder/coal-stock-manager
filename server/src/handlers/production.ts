import { db } from '../db';
import { 
  productionRecordsTable, 
  contractorsTable, 
  jettiesTable, 
  usersTable, 
  stockTable 
} from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { 
  type CreateProductionRecordInput, 
  type ProductionRecord 
} from '../schema';

export async function createProductionRecord(input: CreateProductionRecordInput): Promise<ProductionRecord> {
  try {
    // 1. Validate contractor exists and is active
    const contractor = await db.select()
      .from(contractorsTable)
      .where(and(
        eq(contractorsTable.id, input.contractor_id),
        eq(contractorsTable.is_active, true)
      ))
      .limit(1)
      .execute();

    if (contractor.length === 0) {
      throw new Error('Contractor not found or inactive');
    }

    // 2. Validate jetty exists and is active
    const jetty = await db.select()
      .from(jettiesTable)
      .where(and(
        eq(jettiesTable.id, input.jetty_id),
        eq(jettiesTable.is_active, true)
      ))
      .limit(1)
      .execute();

    if (jetty.length === 0) {
      throw new Error('Jetty not found or inactive');
    }

    // 3. Validate operator exists and is active
    const operator = await db.select()
      .from(usersTable)
      .where(and(
        eq(usersTable.id, input.operator_id),
        eq(usersTable.is_active, true)
      ))
      .limit(1)
      .execute();

    if (operator.length === 0) {
      throw new Error('Operator not found or inactive');
    }

    // 4. Insert production record
    const productionResult = await db.insert(productionRecordsTable)
      .values({
        date_time: input.date_time,
        contractor_id: input.contractor_id,
        truck_number: input.truck_number,
        tonnage: input.tonnage.toString(), // Convert to string for numeric column
        coal_grade: input.coal_grade,
        jetty_id: input.jetty_id,
        document_photo: input.document_photo,
        operator_id: input.operator_id,
        notes: input.notes
      })
      .returning()
      .execute();

    const createdRecord = productionResult[0];

    // 5. Update or create stock record for contractor-jetty combination
    const existingStock = await db.select()
      .from(stockTable)
      .where(and(
        eq(stockTable.contractor_id, input.contractor_id),
        eq(stockTable.jetty_id, input.jetty_id)
      ))
      .limit(1)
      .execute();

    if (existingStock.length > 0) {
      // Update existing stock
      const currentStock = existingStock[0];
      const newTonnage = parseFloat(currentStock.tonnage) + input.tonnage;
      
      await db.update(stockTable)
        .set({
          tonnage: newTonnage.toString(),
          last_updated: new Date(),
          version: currentStock.version + 1, // Optimistic locking
          updated_at: new Date()
        })
        .where(and(
          eq(stockTable.id, currentStock.id),
          eq(stockTable.version, currentStock.version) // Ensure version matches
        ))
        .execute();
    } else {
      // Create new stock record
      await db.insert(stockTable)
        .values({
          contractor_id: input.contractor_id,
          jetty_id: input.jetty_id,
          tonnage: input.tonnage.toString(),
          last_updated: new Date(),
          version: 1
        })
        .execute();
    }

    // Return production record with numeric conversion
    return {
      ...createdRecord,
      tonnage: parseFloat(createdRecord.tonnage) // Convert string back to number
    };
  } catch (error) {
    console.error('Production record creation failed:', error);
    throw error;
  }
}

export async function getProductionRecords(
  dateFrom?: Date, 
  dateTo?: Date, 
  contractorId?: number,
  jettyId?: number
): Promise<ProductionRecord[]> {
  // This is a placeholder declaration! Real code should be implemented here.
  // The goal of this handler is to fetch production records with filtering.
  // It should:
  // 1. Query production records with optional filters
  // 2. Join with contractor, jetty, and operator data
  // 3. Order by date_time descending
  // 4. Apply pagination if needed
  // 5. Return production records with related data
  
  return Promise.resolve([]);
}

export async function getProductionRecordById(id: number): Promise<ProductionRecord | null> {
  // This is a placeholder declaration! Real code should be implemented here.
  // The goal of this handler is to fetch a specific production record.
  // It should:
  // 1. Query production record by ID
  // 2. Include related contractor, jetty, and operator information
  // 3. Return production record with relations or null
  
  return Promise.resolve(null);
}

export async function getDailyProductionSummary(date: Date): Promise<{
  total_tonnage: number;
  records_count: number;
  by_contractor: Array<{ contractor_id: number; contractor_name: string; tonnage: number }>;
  by_jetty: Array<{ jetty_id: number; jetty_name: string; tonnage: number }>;
  by_grade: Array<{ grade: string; tonnage: number }>;
}> {
  // This is a placeholder declaration! Real code should be implemented here.
  // The goal of this handler is to provide daily production analytics.
  // It should:
  // 1. Query production records for specific date
  // 2. Aggregate tonnage by contractor, jetty, and grade
  // 3. Calculate total tonnage and record count
  // 4. Return structured summary data for dashboard
  
  return Promise.resolve({
    total_tonnage: 0,
    records_count: 0,
    by_contractor: [],
    by_jetty: [],
    by_grade: []
  });
}