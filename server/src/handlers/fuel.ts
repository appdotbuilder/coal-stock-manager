import { db } from '../db';
import { 
  fuelPurchasesTable,
  fuelUsageTable,
  jettiesTable,
  usersTable,
  productionRecordsTable,
  contractorsTable
} from '../db/schema';
import { 
  type CreateFuelPurchaseInput, 
  type CreateFuelUsageInput,
  type FuelPurchase,
  type FuelUsage 
} from '../schema';
import { eq, gte, lte, and, desc, sum, SQL } from 'drizzle-orm';

export async function createFuelPurchase(input: CreateFuelPurchaseInput): Promise<FuelPurchase> {
  try {
    // Validate jetty exists and is active
    const jetty = await db.select()
      .from(jettiesTable)
      .where(and(eq(jettiesTable.id, input.jetty_id), eq(jettiesTable.is_active, true)))
      .execute();

    if (jetty.length === 0) {
      throw new Error('Jetty not found or inactive');
    }

    // Insert fuel purchase record
    const result = await db.insert(fuelPurchasesTable)
      .values({
        date: input.date,
        supplier: input.supplier,
        volume_liters: input.volume_liters.toString(),
        cost: input.cost.toString(),
        invoice_number: input.invoice_number,
        jetty_id: input.jetty_id,
        machine_destination: input.machine_destination,
        created_by: input.created_by
      })
      .returning()
      .execute();

    const purchase = result[0];
    return {
      ...purchase,
      volume_liters: parseFloat(purchase.volume_liters),
      cost: parseFloat(purchase.cost)
    };
  } catch (error) {
    console.error('Fuel purchase creation failed:', error);
    throw error;
  }
}

export async function createFuelUsage(input: CreateFuelUsageInput): Promise<FuelUsage> {
  try {
    // Validate production record exists if provided
    if (input.production_record_id) {
      const productionRecord = await db.select()
        .from(productionRecordsTable)
        .where(eq(productionRecordsTable.id, input.production_record_id))
        .execute();

      if (productionRecord.length === 0) {
        throw new Error('Production record not found');
      }
    }

    // Insert fuel usage record
    const result = await db.insert(fuelUsageTable)
      .values({
        date: input.date,
        machine_equipment: input.machine_equipment,
        operator: input.operator,
        volume_liters: input.volume_liters.toString(),
        production_tonnage: input.production_tonnage.toString(),
        production_record_id: input.production_record_id,
        created_by: input.created_by
      })
      .returning()
      .execute();

    const usage = result[0];
    return {
      ...usage,
      volume_liters: parseFloat(usage.volume_liters),
      production_tonnage: parseFloat(usage.production_tonnage)
    };
  } catch (error) {
    console.error('Fuel usage creation failed:', error);
    throw error;
  }
}

export async function getFuelPurchases(
  dateFrom?: Date,
  dateTo?: Date,
  jettyId?: number,
  supplier?: string
): Promise<Array<FuelPurchase & {
  jetty_name: string;
  created_by_name: string;
}>> {
  try {
    // Start with base query
    let baseQuery = db.select({
      id: fuelPurchasesTable.id,
      date: fuelPurchasesTable.date,
      supplier: fuelPurchasesTable.supplier,
      volume_liters: fuelPurchasesTable.volume_liters,
      cost: fuelPurchasesTable.cost,
      invoice_number: fuelPurchasesTable.invoice_number,
      jetty_id: fuelPurchasesTable.jetty_id,
      machine_destination: fuelPurchasesTable.machine_destination,
      created_by: fuelPurchasesTable.created_by,
      created_at: fuelPurchasesTable.created_at,
      updated_at: fuelPurchasesTable.updated_at,
      jetty_name: jettiesTable.name,
      created_by_name: usersTable.full_name
    })
      .from(fuelPurchasesTable)
      .innerJoin(jettiesTable, eq(fuelPurchasesTable.jetty_id, jettiesTable.id))
      .innerJoin(usersTable, eq(fuelPurchasesTable.created_by, usersTable.id));

    const conditions: SQL<unknown>[] = [];

    if (dateFrom) {
      conditions.push(gte(fuelPurchasesTable.date, dateFrom));
    }

    if (dateTo) {
      conditions.push(lte(fuelPurchasesTable.date, dateTo));
    }

    if (jettyId) {
      conditions.push(eq(fuelPurchasesTable.jetty_id, jettyId));
    }

    if (supplier) {
      conditions.push(eq(fuelPurchasesTable.supplier, supplier));
    }

    // Build final query with conditions and ordering
    const finalQuery = conditions.length > 0
      ? baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : baseQuery;

    const results = await finalQuery.orderBy(desc(fuelPurchasesTable.date)).execute();

    return results.map(result => ({
      id: result.id,
      date: result.date,
      supplier: result.supplier,
      volume_liters: parseFloat(result.volume_liters),
      cost: parseFloat(result.cost),
      invoice_number: result.invoice_number,
      jetty_id: result.jetty_id,
      machine_destination: result.machine_destination,
      created_by: result.created_by,
      created_at: result.created_at,
      updated_at: result.updated_at,
      jetty_name: result.jetty_name,
      created_by_name: result.created_by_name
    }));
  } catch (error) {
    console.error('Get fuel purchases failed:', error);
    throw error;
  }
}

export async function getFuelUsage(
  dateFrom?: Date,
  dateTo?: Date,
  machineEquipment?: string,
  operator?: string
): Promise<Array<FuelUsage & {
  created_by_name: string;
  production_record?: {
    truck_number: string;
    contractor_name: string;
  };
}>> {
  try {
    // Start with base query
    let baseQuery = db.select({
      id: fuelUsageTable.id,
      date: fuelUsageTable.date,
      machine_equipment: fuelUsageTable.machine_equipment,
      operator: fuelUsageTable.operator,
      volume_liters: fuelUsageTable.volume_liters,
      production_tonnage: fuelUsageTable.production_tonnage,
      production_record_id: fuelUsageTable.production_record_id,
      created_by: fuelUsageTable.created_by,
      created_at: fuelUsageTable.created_at,
      updated_at: fuelUsageTable.updated_at,
      created_by_name: usersTable.full_name,
      truck_number: productionRecordsTable.truck_number,
      contractor_name: contractorsTable.name
    })
      .from(fuelUsageTable)
      .innerJoin(usersTable, eq(fuelUsageTable.created_by, usersTable.id))
      .leftJoin(productionRecordsTable, eq(fuelUsageTable.production_record_id, productionRecordsTable.id))
      .leftJoin(contractorsTable, eq(productionRecordsTable.contractor_id, contractorsTable.id));

    const conditions: SQL<unknown>[] = [];

    if (dateFrom) {
      conditions.push(gte(fuelUsageTable.date, dateFrom));
    }

    if (dateTo) {
      conditions.push(lte(fuelUsageTable.date, dateTo));
    }

    if (machineEquipment) {
      conditions.push(eq(fuelUsageTable.machine_equipment, machineEquipment));
    }

    if (operator) {
      conditions.push(eq(fuelUsageTable.operator, operator));
    }

    // Build final query with conditions and ordering
    const finalQuery = conditions.length > 0
      ? baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : baseQuery;

    const results = await finalQuery.orderBy(desc(fuelUsageTable.date)).execute();

    return results.map(result => ({
      id: result.id,
      date: result.date,
      machine_equipment: result.machine_equipment,
      operator: result.operator,
      volume_liters: parseFloat(result.volume_liters),
      production_tonnage: parseFloat(result.production_tonnage),
      production_record_id: result.production_record_id,
      created_by: result.created_by,
      created_at: result.created_at,
      updated_at: result.updated_at,
      created_by_name: result.created_by_name,
      production_record: result.truck_number && result.contractor_name ? {
        truck_number: result.truck_number,
        contractor_name: result.contractor_name
      } : undefined
    }));
  } catch (error) {
    console.error('Get fuel usage failed:', error);
    throw error;
  }
}

export async function getFuelPurchaseById(id: number): Promise<FuelPurchase | null> {
  try {
    const results = await db.select()
      .from(fuelPurchasesTable)
      .where(eq(fuelPurchasesTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const purchase = results[0];
    return {
      ...purchase,
      volume_liters: parseFloat(purchase.volume_liters),
      cost: parseFloat(purchase.cost)
    };
  } catch (error) {
    console.error('Get fuel purchase by ID failed:', error);
    throw error;
  }
}

export async function getFuelUsageById(id: number): Promise<FuelUsage | null> {
  try {
    const results = await db.select()
      .from(fuelUsageTable)
      .where(eq(fuelUsageTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const usage = results[0];
    return {
      ...usage,
      volume_liters: parseFloat(usage.volume_liters),
      production_tonnage: parseFloat(usage.production_tonnage)
    };
  } catch (error) {
    console.error('Get fuel usage by ID failed:', error);
    throw error;
  }
}

export async function getFuelSummary(
  dateFrom?: Date,
  dateTo?: Date
): Promise<{
  total_purchased_liters: number;
  total_purchased_cost: number;
  total_used_liters: number;
  estimated_remaining_liters: number;
  by_supplier: Array<{ supplier: string; volume_liters: number; cost: number }>;
  by_machine: Array<{ machine_equipment: string; volume_liters: number }>;
  efficiency_ratio: number;
}> {
  try {
    // Build base queries with date filters
    let basePurchaseQuery = db.select({
      volume_liters: fuelPurchasesTable.volume_liters,
      cost: fuelPurchasesTable.cost,
      supplier: fuelPurchasesTable.supplier
    }).from(fuelPurchasesTable);

    let baseUsageQuery = db.select({
      volume_liters: fuelUsageTable.volume_liters,
      production_tonnage: fuelUsageTable.production_tonnage,
      machine_equipment: fuelUsageTable.machine_equipment
    }).from(fuelUsageTable);

    const purchaseConditions: SQL<unknown>[] = [];
    const usageConditions: SQL<unknown>[] = [];

    if (dateFrom) {
      purchaseConditions.push(gte(fuelPurchasesTable.date, dateFrom));
      usageConditions.push(gte(fuelUsageTable.date, dateFrom));
    }

    if (dateTo) {
      purchaseConditions.push(lte(fuelPurchasesTable.date, dateTo));
      usageConditions.push(lte(fuelUsageTable.date, dateTo));
    }

    // Build final queries
    const purchaseQuery = purchaseConditions.length > 0
      ? basePurchaseQuery.where(
          purchaseConditions.length === 1 ? purchaseConditions[0] : and(...purchaseConditions)
        )
      : basePurchaseQuery;

    const usageQuery = usageConditions.length > 0
      ? baseUsageQuery.where(
          usageConditions.length === 1 ? usageConditions[0] : and(...usageConditions)
        )
      : baseUsageQuery;

    const [purchases, usage] = await Promise.all([
      purchaseQuery.execute(),
      usageQuery.execute()
    ]);

    // Calculate totals
    const totalPurchasedLiters = purchases.reduce((sum, p) => sum + parseFloat(p.volume_liters), 0);
    const totalPurchasedCost = purchases.reduce((sum, p) => sum + parseFloat(p.cost), 0);
    const totalUsedLiters = usage.reduce((sum, u) => sum + parseFloat(u.volume_liters), 0);
    const totalProductionTonnage = usage.reduce((sum, u) => sum + parseFloat(u.production_tonnage), 0);

    // Group by supplier
    const supplierMap = new Map<string, { volume_liters: number; cost: number }>();
    purchases.forEach(p => {
      const existing = supplierMap.get(p.supplier) || { volume_liters: 0, cost: 0 };
      supplierMap.set(p.supplier, {
        volume_liters: existing.volume_liters + parseFloat(p.volume_liters),
        cost: existing.cost + parseFloat(p.cost)
      });
    });

    // Group by machine
    const machineMap = new Map<string, number>();
    usage.forEach(u => {
      const existing = machineMap.get(u.machine_equipment) || 0;
      machineMap.set(u.machine_equipment, existing + parseFloat(u.volume_liters));
    });

    return {
      total_purchased_liters: totalPurchasedLiters,
      total_purchased_cost: totalPurchasedCost,
      total_used_liters: totalUsedLiters,
      estimated_remaining_liters: totalPurchasedLiters - totalUsedLiters,
      by_supplier: Array.from(supplierMap.entries()).map(([supplier, data]) => ({
        supplier,
        volume_liters: data.volume_liters,
        cost: data.cost
      })),
      by_machine: Array.from(machineMap.entries()).map(([machine_equipment, volume_liters]) => ({
        machine_equipment,
        volume_liters
      })),
      efficiency_ratio: totalProductionTonnage > 0 ? totalUsedLiters / totalProductionTonnage : 0
    };
  } catch (error) {
    console.error('Get fuel summary failed:', error);
    throw error;
  }
}