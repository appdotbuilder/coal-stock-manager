import { db } from '../db';
import { 
  stockTable, 
  contractorsTable, 
  jettiesTable, 
  stockAdjustmentsTable,
  usersTable,
  auditLogTable
} from '../db/schema';
import { 
  type Stock, 
  type StockFilter,
  type CreateStockAdjustmentInput,
  type StockAdjustment 
} from '../schema';
import { eq, and, gte, lte, desc, asc, sum, count, max, SQL, isNull } from 'drizzle-orm';

export async function getStock(filter?: StockFilter): Promise<Array<Stock & {
  contractor_name: string;
  contractor_code: string;
  jetty_name: string;
  jetty_code: string;
}>> {
  try {
    let query = db.select({
      id: stockTable.id,
      contractor_id: stockTable.contractor_id,
      jetty_id: stockTable.jetty_id,
      tonnage: stockTable.tonnage,
      last_updated: stockTable.last_updated,
      version: stockTable.version,
      created_at: stockTable.created_at,
      updated_at: stockTable.updated_at,
      contractor_name: contractorsTable.name,
      contractor_code: contractorsTable.code,
      jetty_name: jettiesTable.name,
      jetty_code: jettiesTable.code
    })
    .from(stockTable)
    .innerJoin(contractorsTable, eq(stockTable.contractor_id, contractorsTable.id))
    .innerJoin(jettiesTable, eq(stockTable.jetty_id, jettiesTable.id));

    const conditions: SQL<unknown>[] = [
      eq(contractorsTable.is_active, true),
      eq(jettiesTable.is_active, true),
      isNull(contractorsTable.deleted_at)
    ];

    if (filter?.contractor_id !== undefined) {
      conditions.push(eq(stockTable.contractor_id, filter.contractor_id));
    }

    if (filter?.jetty_id !== undefined) {
      conditions.push(eq(stockTable.jetty_id, filter.jetty_id));
    }

    if (filter?.date_from !== undefined) {
      conditions.push(gte(stockTable.last_updated, filter.date_from));
    }

    if (filter?.date_to !== undefined) {
      conditions.push(lte(stockTable.last_updated, filter.date_to));
    }

    const finalQuery = conditions.length > 0 
      ? query.where(and(...conditions)).orderBy(asc(contractorsTable.name), asc(jettiesTable.name))
      : query.orderBy(asc(contractorsTable.name), asc(jettiesTable.name));

    const results = await finalQuery.execute();

    return results.map(result => ({
      ...result,
      tonnage: parseFloat(result.tonnage)
    }));
  } catch (error) {
    console.error('Get stock failed:', error);
    throw error;
  }
}

export async function getStockByContractor(): Promise<Array<{
  contractor_id: number;
  contractor_name: string;
  contractor_code: string;
  total_tonnage: number;
  jetties: Array<{
    jetty_id: number;
    jetty_name: string;
    tonnage: number;
    last_updated: Date;
  }>;
}>> {
  try {
    const results = await db.select({
      contractor_id: stockTable.contractor_id,
      contractor_name: contractorsTable.name,
      contractor_code: contractorsTable.code,
      jetty_id: stockTable.jetty_id,
      jetty_name: jettiesTable.name,
      tonnage: stockTable.tonnage,
      last_updated: stockTable.last_updated
    })
    .from(stockTable)
    .innerJoin(contractorsTable, eq(stockTable.contractor_id, contractorsTable.id))
    .innerJoin(jettiesTable, eq(stockTable.jetty_id, jettiesTable.id))
    .where(and(
      eq(contractorsTable.is_active, true),
      eq(jettiesTable.is_active, true),
      isNull(contractorsTable.deleted_at)
    ))
    .orderBy(asc(contractorsTable.name), asc(jettiesTable.name))
    .execute();

    // Group by contractor
    const grouped = new Map<number, {
      contractor_id: number;
      contractor_name: string;
      contractor_code: string;
      total_tonnage: number;
      jetties: Array<{
        jetty_id: number;
        jetty_name: string;
        tonnage: number;
        last_updated: Date;
      }>;
    }>();

    for (const result of results) {
      const contractorId = result.contractor_id;
      const tonnage = parseFloat(result.tonnage);

      if (!grouped.has(contractorId)) {
        grouped.set(contractorId, {
          contractor_id: contractorId,
          contractor_name: result.contractor_name,
          contractor_code: result.contractor_code,
          total_tonnage: 0,
          jetties: []
        });
      }

      const contractor = grouped.get(contractorId)!;
      contractor.total_tonnage += tonnage;
      contractor.jetties.push({
        jetty_id: result.jetty_id,
        jetty_name: result.jetty_name,
        tonnage: tonnage,
        last_updated: result.last_updated
      });
    }

    return Array.from(grouped.values());
  } catch (error) {
    console.error('Get stock by contractor failed:', error);
    throw error;
  }
}

export async function getStockByJetty(): Promise<Array<{
  jetty_id: number;
  jetty_name: string;
  jetty_code: string;
  total_tonnage: number;
  contractors: Array<{
    contractor_id: number;
    contractor_name: string;
    tonnage: number;
    last_updated: Date;
  }>;
}>> {
  try {
    const results = await db.select({
      jetty_id: stockTable.jetty_id,
      jetty_name: jettiesTable.name,
      jetty_code: jettiesTable.code,
      contractor_id: stockTable.contractor_id,
      contractor_name: contractorsTable.name,
      tonnage: stockTable.tonnage,
      last_updated: stockTable.last_updated
    })
    .from(stockTable)
    .innerJoin(contractorsTable, eq(stockTable.contractor_id, contractorsTable.id))
    .innerJoin(jettiesTable, eq(stockTable.jetty_id, jettiesTable.id))
    .where(and(
      eq(contractorsTable.is_active, true),
      eq(jettiesTable.is_active, true),
      isNull(contractorsTable.deleted_at)
    ))
    .orderBy(asc(jettiesTable.name), asc(contractorsTable.name))
    .execute();

    // Group by jetty
    const grouped = new Map<number, {
      jetty_id: number;
      jetty_name: string;
      jetty_code: string;
      total_tonnage: number;
      contractors: Array<{
        contractor_id: number;
        contractor_name: string;
        tonnage: number;
        last_updated: Date;
      }>;
    }>();

    for (const result of results) {
      const jettyId = result.jetty_id;
      const tonnage = parseFloat(result.tonnage);

      if (!grouped.has(jettyId)) {
        grouped.set(jettyId, {
          jetty_id: jettyId,
          jetty_name: result.jetty_name,
          jetty_code: result.jetty_code,
          total_tonnage: 0,
          contractors: []
        });
      }

      const jetty = grouped.get(jettyId)!;
      jetty.total_tonnage += tonnage;
      jetty.contractors.push({
        contractor_id: result.contractor_id,
        contractor_name: result.contractor_name,
        tonnage: tonnage,
        last_updated: result.last_updated
      });
    }

    return Array.from(grouped.values());
  } catch (error) {
    console.error('Get stock by jetty failed:', error);
    throw error;
  }
}

export async function getTotalStock(): Promise<{
  total_tonnage: number;
  total_contractors: number;
  total_jetties: number;
  last_updated: Date;
}> {
  try {
    const [stockResults, lastUpdatedResult] = await Promise.all([
      db.select({
        total_tonnage: sum(stockTable.tonnage),
        total_contractors: count(stockTable.contractor_id),
        total_jetties: count(stockTable.jetty_id)
      })
      .from(stockTable)
      .innerJoin(contractorsTable, eq(stockTable.contractor_id, contractorsTable.id))
      .innerJoin(jettiesTable, eq(stockTable.jetty_id, jettiesTable.id))
      .where(and(
        eq(contractorsTable.is_active, true),
        eq(jettiesTable.is_active, true),
        isNull(contractorsTable.deleted_at)
      ))
      .execute(),

      db.select({
        last_updated: max(stockTable.last_updated)
      })
      .from(stockTable)
      .execute()
    ]);

    const result = stockResults[0];
    const lastUpdated = lastUpdatedResult[0]?.last_updated || new Date();

    return {
      total_tonnage: result?.total_tonnage ? parseFloat(result.total_tonnage) : 0,
      total_contractors: result?.total_contractors || 0,
      total_jetties: result?.total_jetties || 0,
      last_updated: lastUpdated
    };
  } catch (error) {
    console.error('Get total stock failed:', error);
    throw error;
  }
}

export async function createStockAdjustment(input: CreateStockAdjustmentInput): Promise<StockAdjustment> {
  try {
    // Read stock record OUTSIDE of the transaction to capture the initial version
    const stockRecords = await db.select()
      .from(stockTable)
      .where(eq(stockTable.id, input.stock_id))
      .execute();

    if (stockRecords.length === 0) {
      throw new Error('Stock record not found');
    }

    const originalStock = stockRecords[0];
    const previousTonnage = parseFloat(originalStock.tonnage);
    const newTonnage = previousTonnage + input.adjustment_amount;

    if (newTonnage < 0) {
      throw new Error('Stock cannot be negative');
    }

    return await db.transaction(async (tx) => {
      // Check if the stock record still has the expected version
      const currentStockCheck = await tx.select()
        .from(stockTable)
        .where(and(
          eq(stockTable.id, input.stock_id),
          eq(stockTable.version, originalStock.version)
        ))
        .execute();

      if (currentStockCheck.length === 0) {
        throw new Error('Stock record was modified by another user. Please try again.');
      }

      // Update stock record
      const updatedStocks = await tx.update(stockTable)
        .set({
          tonnage: newTonnage.toString(),
          last_updated: new Date(),
          version: originalStock.version + 1,
          updated_at: new Date()
        })
        .where(eq(stockTable.id, input.stock_id))
        .returning()
        .execute();

      // Create stock adjustment record
      const adjustmentResults = await tx.insert(stockAdjustmentsTable)
        .values({
          stock_id: input.stock_id,
          adjusted_by: input.adjusted_by,
          previous_tonnage: previousTonnage.toString(),
          new_tonnage: newTonnage.toString(),
          adjustment_amount: input.adjustment_amount.toString(),
          reason: input.reason,
          reason_description: input.reason_description,
          reference_document: input.reference_document,
          attachment: input.attachment
        })
        .returning()
        .execute();

      // Log to audit trail
      await tx.insert(auditLogTable)
        .values({
          user_id: input.adjusted_by,
          action: 'stock_adjustment_create',
          table_name: 'stock_adjustments',
          record_id: adjustmentResults[0].id,
          new_values: JSON.stringify(adjustmentResults[0])
        })
        .execute();

      const adjustment = adjustmentResults[0];
      return {
        ...adjustment,
        previous_tonnage: parseFloat(adjustment.previous_tonnage),
        new_tonnage: parseFloat(adjustment.new_tonnage),
        adjustment_amount: parseFloat(adjustment.adjustment_amount)
      };
    });
  } catch (error) {
    console.error('Create stock adjustment failed:', error);
    throw error;
  }
}

export async function getStockAdjustments(
  stockId?: number,
  dateFrom?: Date,
  dateTo?: Date
): Promise<Array<StockAdjustment & {
  adjusted_by_name: string;
  approved_by_name?: string;
  contractor_name: string;
  jetty_name: string;
}>> {
  try {
    // First get the basic adjustment data with stock, contractor, and jetty info
    let baseQuery = db.select({
      id: stockAdjustmentsTable.id,
      stock_id: stockAdjustmentsTable.stock_id,
      adjusted_by: stockAdjustmentsTable.adjusted_by,
      previous_tonnage: stockAdjustmentsTable.previous_tonnage,
      new_tonnage: stockAdjustmentsTable.new_tonnage,
      adjustment_amount: stockAdjustmentsTable.adjustment_amount,
      reason: stockAdjustmentsTable.reason,
      reason_description: stockAdjustmentsTable.reason_description,
      reference_document: stockAdjustmentsTable.reference_document,
      attachment: stockAdjustmentsTable.attachment,
      approved_by: stockAdjustmentsTable.approved_by,
      approved_at: stockAdjustmentsTable.approved_at,
      created_at: stockAdjustmentsTable.created_at,
      contractor_name: contractorsTable.name,
      jetty_name: jettiesTable.name
    })
    .from(stockAdjustmentsTable)
    .innerJoin(stockTable, eq(stockAdjustmentsTable.stock_id, stockTable.id))
    .innerJoin(contractorsTable, eq(stockTable.contractor_id, contractorsTable.id))
    .innerJoin(jettiesTable, eq(stockTable.jetty_id, jettiesTable.id));

    const conditions: SQL<unknown>[] = [];

    if (stockId !== undefined) {
      conditions.push(eq(stockAdjustmentsTable.stock_id, stockId));
    }

    if (dateFrom !== undefined) {
      conditions.push(gte(stockAdjustmentsTable.created_at, dateFrom));
    }

    if (dateTo !== undefined) {
      conditions.push(lte(stockAdjustmentsTable.created_at, dateTo));
    }

    const orderedQuery = conditions.length > 0 
      ? baseQuery.where(and(...conditions)).orderBy(desc(stockAdjustmentsTable.created_at))
      : baseQuery.orderBy(desc(stockAdjustmentsTable.created_at));
    const baseResults = await orderedQuery.execute();

    // Get user names separately to avoid join conflicts
    const adjustedByIds = [...new Set(baseResults.map(r => r.adjusted_by))];
    const approvedByIds = [...new Set(baseResults.map(r => r.approved_by).filter(id => id !== null))];
    const allUserIds = [...new Set([...adjustedByIds, ...approvedByIds])];

    const users = await db.select({
      id: usersTable.id,
      full_name: usersTable.full_name
    })
    .from(usersTable)
    .where(eq(usersTable.id, allUserIds[0])) // This is a workaround for the in() operator
    .execute();

    // Get all users by making individual queries (simple approach)
    const userMap = new Map<number, string>();
    for (const userId of allUserIds) {
      const userResult = await db.select({
        id: usersTable.id,
        full_name: usersTable.full_name
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();
      
      if (userResult.length > 0) {
        userMap.set(userId, userResult[0].full_name);
      }
    }

    return baseResults.map(result => ({
      ...result,
      previous_tonnage: parseFloat(result.previous_tonnage),
      new_tonnage: parseFloat(result.new_tonnage),
      adjustment_amount: parseFloat(result.adjustment_amount),
      adjusted_by_name: userMap.get(result.adjusted_by) || 'Unknown User',
      approved_by_name: result.approved_by ? userMap.get(result.approved_by) : undefined
    }));
  } catch (error) {
    console.error('Get stock adjustments failed:', error);
    throw error;
  }
}

export async function approveStockAdjustment(
  adjustmentId: number,
  approvedBy: number
): Promise<StockAdjustment> {
  try {
    return await db.transaction(async (tx) => {
      // Check if adjustment exists and is not already approved
      const adjustments = await tx.select()
        .from(stockAdjustmentsTable)
        .where(eq(stockAdjustmentsTable.id, adjustmentId))
        .execute();

      if (adjustments.length === 0) {
        throw new Error('Stock adjustment not found');
      }

      if (adjustments[0].approved_by !== null) {
        throw new Error('Stock adjustment is already approved');
      }

      // Update adjustment with approval
      const updatedAdjustments = await tx.update(stockAdjustmentsTable)
        .set({
          approved_by: approvedBy,
          approved_at: new Date()
        })
        .where(eq(stockAdjustmentsTable.id, adjustmentId))
        .returning()
        .execute();

      // Log approval to audit trail
      await tx.insert(auditLogTable)
        .values({
          user_id: approvedBy,
          action: 'stock_adjustment_approve',
          table_name: 'stock_adjustments',
          record_id: adjustmentId,
          old_values: JSON.stringify(adjustments[0]),
          new_values: JSON.stringify(updatedAdjustments[0])
        })
        .execute();

      const adjustment = updatedAdjustments[0];
      return {
        ...adjustment,
        previous_tonnage: parseFloat(adjustment.previous_tonnage),
        new_tonnage: parseFloat(adjustment.new_tonnage),
        adjustment_amount: parseFloat(adjustment.adjustment_amount)
      };
    });
  } catch (error) {
    console.error('Approve stock adjustment failed:', error);
    throw error;
  }
}

export async function updateStockFromProduction(
  contractorId: number,
  jettyId: number,
  tonnage: number
): Promise<void> {
  try {
    // Find existing stock record OUTSIDE transaction
    const existingStock = await db.select()
      .from(stockTable)
      .where(and(
        eq(stockTable.contractor_id, contractorId),
        eq(stockTable.jetty_id, jettyId)
      ))
      .execute();

    await db.transaction(async (tx) => {
      if (existingStock.length > 0) {
        // Update existing stock using original version for optimistic locking
        const originalStock = existingStock[0];
        const newTonnage = parseFloat(originalStock.tonnage) + tonnage;

        // Check if the stock record still has the expected version
        const currentStockCheck = await tx.select()
          .from(stockTable)
          .where(and(
            eq(stockTable.id, originalStock.id),
            eq(stockTable.version, originalStock.version)
          ))
          .execute();

        if (currentStockCheck.length === 0) {
          throw new Error('Stock record was modified by another user. Please try again.');
        }

        // Update stock record
        await tx.update(stockTable)
          .set({
            tonnage: newTonnage.toString(),
            last_updated: new Date(),
            version: originalStock.version + 1,
            updated_at: new Date()
          })
          .where(eq(stockTable.id, originalStock.id))
          .execute();
      } else {
        // Create new stock record
        await tx.insert(stockTable)
          .values({
            contractor_id: contractorId,
            jetty_id: jettyId,
            tonnage: tonnage.toString(),
            last_updated: new Date(),
            version: 1
          })
          .execute();
      }
    });
  } catch (error) {
    console.error('Update stock from production failed:', error);
    throw error;
  }
}

export async function updateStockFromBarging(
  contractorId: number,
  jettyId: number,
  tonnage: number
): Promise<void> {
  try {
    // Find existing stock record OUTSIDE transaction
    const existingStock = await db.select()
      .from(stockTable)
      .where(and(
        eq(stockTable.contractor_id, contractorId),
        eq(stockTable.jetty_id, jettyId)
      ))
      .execute();

    if (existingStock.length === 0) {
      throw new Error('No stock found for this contractor-jetty combination');
    }

    const originalStock = existingStock[0];
    const currentTonnage = parseFloat(originalStock.tonnage);
    
    if (currentTonnage < tonnage) {
      throw new Error('Insufficient stock available');
    }

    const newTonnage = currentTonnage - tonnage;

    await db.transaction(async (tx) => {
      // Check if the stock record still has the expected version
      const currentStockCheck = await tx.select()
        .from(stockTable)
        .where(and(
          eq(stockTable.id, originalStock.id),
          eq(stockTable.version, originalStock.version)
        ))
        .execute();

      if (currentStockCheck.length === 0) {
        throw new Error('Stock record was modified by another user. Please try again.');
      }

      // Update stock record
      await tx.update(stockTable)
        .set({
          tonnage: newTonnage.toString(),
          last_updated: new Date(),
          version: originalStock.version + 1,
          updated_at: new Date()
        })
        .where(eq(stockTable.id, originalStock.id))
        .execute();
    });
  } catch (error) {
    console.error('Update stock from barging failed:', error);
    throw error;
  }
}