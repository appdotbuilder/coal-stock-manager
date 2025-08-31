import { db } from '../db';
import { 
  stockTable,
  contractorsTable,
  jettiesTable,
  productionRecordsTable,
  bargingRecordsTable,
  stockAdjustmentsTable,
  fuelPurchasesTable,
  fuelUsageTable,
  usersTable
} from '../db/schema';
import { 
  type DashboardStats, 
  type RecentActivity 
} from '../schema';
import { eq, gte, lte, and, sum, count, desc, isNotNull, sql } from 'drizzle-orm';

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get total stock
    const totalStockResult = await db
      .select({ total: sum(stockTable.tonnage) })
      .from(stockTable)
      .execute();
    
    const totalStock = totalStockResult[0]?.total ? parseFloat(totalStockResult[0].total) : 0;

    // Get daily production for today
    const dailyProductionResult = await db
      .select({ total: sum(productionRecordsTable.tonnage) })
      .from(productionRecordsTable)
      .where(
        and(
          gte(productionRecordsTable.date_time, today),
          lte(productionRecordsTable.date_time, tomorrow)
        )
      )
      .execute();
    
    const dailyProduction = dailyProductionResult[0]?.total ? parseFloat(dailyProductionResult[0].total) : 0;

    // Get daily barging for today
    const dailyBargingResult = await db
      .select({ total: sum(bargingRecordsTable.tonnage) })
      .from(bargingRecordsTable)
      .where(
        and(
          gte(bargingRecordsTable.date_time, today),
          lte(bargingRecordsTable.date_time, tomorrow)
        )
      )
      .execute();
    
    const dailyBarging = dailyBargingResult[0]?.total ? parseFloat(dailyBargingResult[0].total) : 0;

    // Count active contractors
    const activeContractorsResult = await db
      .select({ count: count() })
      .from(contractorsTable)
      .where(eq(contractorsTable.is_active, true))
      .execute();
    
    const activeContractors = activeContractorsResult[0]?.count || 0;

    // Stock by jetty with names
    const stockByJettyResult = await db
      .select({
        jetty_id: stockTable.jetty_id,
        jetty_name: jettiesTable.name,
        total_tonnage: sum(stockTable.tonnage)
      })
      .from(stockTable)
      .innerJoin(jettiesTable, eq(stockTable.jetty_id, jettiesTable.id))
      .groupBy(stockTable.jetty_id, jettiesTable.name)
      .execute();

    const stockByJetty = stockByJettyResult.map(row => ({
      jetty_id: row.jetty_id,
      jetty_name: row.jetty_name,
      total_tonnage: row.total_tonnage ? parseFloat(row.total_tonnage) : 0
    }));

    // Stock by contractor with names
    const stockByContractorResult = await db
      .select({
        contractor_id: stockTable.contractor_id,
        contractor_name: contractorsTable.name,
        total_tonnage: sum(stockTable.tonnage)
      })
      .from(stockTable)
      .innerJoin(contractorsTable, eq(stockTable.contractor_id, contractorsTable.id))
      .groupBy(stockTable.contractor_id, contractorsTable.name)
      .execute();

    const stockByContractor = stockByContractorResult.map(row => ({
      contractor_id: row.contractor_id,
      contractor_name: row.contractor_name,
      total_tonnage: row.total_tonnage ? parseFloat(row.total_tonnage) : 0
    }));

    return {
      total_stock: totalStock,
      daily_production: dailyProduction,
      daily_barging: dailyBarging,
      active_contractors: activeContractors,
      stock_by_jetty: stockByJetty,
      stock_by_contractor: stockByContractor
    };
  } catch (error) {
    console.error('Dashboard stats retrieval failed:', error);
    throw error;
  }
}

export async function getRecentActivity(limit: number = 10): Promise<RecentActivity[]> {
  try {
    // Get recent production records
    const recentProduction = await db
      .select({
        id: productionRecordsTable.id,
        type: sql<string>`'production'`,
        tonnage: productionRecordsTable.tonnage,
        truck_number: productionRecordsTable.truck_number,
        operator_name: usersTable.full_name,
        created_at: productionRecordsTable.created_at
      })
      .from(productionRecordsTable)
      .innerJoin(usersTable, eq(productionRecordsTable.operator_id, usersTable.id))
      .orderBy(desc(productionRecordsTable.created_at))
      .limit(limit)
      .execute();

    // Get recent barging records
    const recentBarging = await db
      .select({
        id: bargingRecordsTable.id,
        type: sql<string>`'barging'`,
        tonnage: bargingRecordsTable.tonnage,
        ship_batch: bargingRecordsTable.ship_batch_number,
        operator_name: usersTable.full_name,
        created_at: bargingRecordsTable.created_at
      })
      .from(bargingRecordsTable)
      .innerJoin(usersTable, eq(bargingRecordsTable.operator_id, usersTable.id))
      .orderBy(desc(bargingRecordsTable.created_at))
      .limit(limit)
      .execute();

    // Get recent stock adjustments
    const recentAdjustments = await db
      .select({
        id: stockAdjustmentsTable.id,
        type: sql<string>`'stock_adjustment'`,
        adjustment_amount: stockAdjustmentsTable.adjustment_amount,
        reason: stockAdjustmentsTable.reason,
        operator_name: usersTable.full_name,
        created_at: stockAdjustmentsTable.created_at
      })
      .from(stockAdjustmentsTable)
      .innerJoin(usersTable, eq(stockAdjustmentsTable.adjusted_by, usersTable.id))
      .orderBy(desc(stockAdjustmentsTable.created_at))
      .limit(limit)
      .execute();

    // Get recent fuel purchases
    const recentFuelPurchases = await db
      .select({
        id: fuelPurchasesTable.id,
        type: sql<string>`'fuel_purchase'`,
        volume: fuelPurchasesTable.volume_liters,
        supplier: fuelPurchasesTable.supplier,
        operator_name: usersTable.full_name,
        created_at: fuelPurchasesTable.created_at
      })
      .from(fuelPurchasesTable)
      .innerJoin(usersTable, eq(fuelPurchasesTable.created_by, usersTable.id))
      .orderBy(desc(fuelPurchasesTable.created_at))
      .limit(limit)
      .execute();

    // Combine and format activities
    const activities: RecentActivity[] = [];

    // Add production activities
    recentProduction.forEach(record => {
      activities.push({
        id: record.id,
        type: 'production' as const,
        description: `Production: ${record.truck_number} - ${parseFloat(record.tonnage)} tons`,
        tonnage: parseFloat(record.tonnage),
        operator_name: record.operator_name,
        created_at: record.created_at
      });
    });

    // Add barging activities
    recentBarging.forEach(record => {
      activities.push({
        id: record.id,
        type: 'barging' as const,
        description: `Barging: ${record.ship_batch} - ${parseFloat(record.tonnage)} tons`,
        tonnage: parseFloat(record.tonnage),
        operator_name: record.operator_name,
        created_at: record.created_at
      });
    });

    // Add stock adjustment activities
    recentAdjustments.forEach(record => {
      activities.push({
        id: record.id,
        type: 'stock_adjustment' as const,
        description: `Stock Adjustment: ${record.reason} - ${parseFloat(record.adjustment_amount)} tons`,
        tonnage: parseFloat(record.adjustment_amount),
        operator_name: record.operator_name,
        created_at: record.created_at
      });
    });

    // Add fuel purchase activities
    recentFuelPurchases.forEach(record => {
      activities.push({
        id: record.id,
        type: 'fuel_purchase' as const,
        description: `Fuel Purchase: ${record.supplier} - ${parseFloat(record.volume)} liters`,
        tonnage: null,
        operator_name: record.operator_name,
        created_at: record.created_at
      });
    });

    // Sort by created_at descending and limit
    return activities
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, limit);

  } catch (error) {
    console.error('Recent activity retrieval failed:', error);
    throw error;
  }
}

export async function getKPIMetrics(dateFrom?: Date, dateTo?: Date): Promise<{
  stock_available: number;
  daily_inflow: number;
  daily_outflow: number;
  net_change: number;
  average_daily_production: number;
  average_daily_barging: number;
  stock_turnover_days: number;
  fuel_efficiency: number;
}> {
  try {
    const today = new Date();
    const defaultDateFrom = dateFrom || new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const defaultDateTo = dateTo || today;

    // Get current stock available
    const stockResult = await db
      .select({ total: sum(stockTable.tonnage) })
      .from(stockTable)
      .execute();
    
    const stockAvailable = stockResult[0]?.total ? parseFloat(stockResult[0].total) : 0;

    // Get production in date range
    const productionResult = await db
      .select({ total: sum(productionRecordsTable.tonnage) })
      .from(productionRecordsTable)
      .where(
        and(
          gte(productionRecordsTable.date_time, defaultDateFrom),
          lte(productionRecordsTable.date_time, defaultDateTo)
        )
      )
      .execute();
    
    const totalProduction = productionResult[0]?.total ? parseFloat(productionResult[0].total) : 0;

    // Get barging in date range
    const bargingResult = await db
      .select({ total: sum(bargingRecordsTable.tonnage) })
      .from(bargingRecordsTable)
      .where(
        and(
          gte(bargingRecordsTable.date_time, defaultDateFrom),
          lte(bargingRecordsTable.date_time, defaultDateTo)
        )
      )
      .execute();
    
    const totalBarging = bargingResult[0]?.total ? parseFloat(bargingResult[0].total) : 0;

    // Calculate date range in days
    const daysDiff = Math.max(1, Math.ceil((defaultDateTo.getTime() - defaultDateFrom.getTime()) / (24 * 60 * 60 * 1000)));
    
    const averageDailyProduction = totalProduction / daysDiff;
    const averageDailyBarging = totalBarging / daysDiff;
    const netChange = totalProduction - totalBarging;
    
    // Calculate stock turnover days
    const stockTurnoverDays = averageDailyBarging > 0 ? stockAvailable / averageDailyBarging : 0;

    // Get fuel efficiency (tons per liter)
    const fuelUsageResult = await db
      .select({ 
        total_fuel: sum(fuelUsageTable.volume_liters),
        total_production: sum(fuelUsageTable.production_tonnage)
      })
      .from(fuelUsageTable)
      .where(
        and(
          gte(fuelUsageTable.date, defaultDateFrom),
          lte(fuelUsageTable.date, defaultDateTo)
        )
      )
      .execute();
    
    const totalFuel = fuelUsageResult[0]?.total_fuel ? parseFloat(fuelUsageResult[0].total_fuel) : 0;
    const totalFuelProduction = fuelUsageResult[0]?.total_production ? parseFloat(fuelUsageResult[0].total_production) : 0;
    const fuelEfficiency = totalFuel > 0 ? totalFuelProduction / totalFuel : 0;

    return {
      stock_available: stockAvailable,
      daily_inflow: averageDailyProduction,
      daily_outflow: averageDailyBarging,
      net_change: netChange,
      average_daily_production: averageDailyProduction,
      average_daily_barging: averageDailyBarging,
      stock_turnover_days: stockTurnoverDays,
      fuel_efficiency: fuelEfficiency
    };
  } catch (error) {
    console.error('KPI metrics retrieval failed:', error);
    throw error;
  }
}

export async function getStockTrends(days: number = 30): Promise<Array<{
  date: Date;
  total_stock: number;
  production: number;
  barging: number;
  net_change: number;
}>> {
  try {
    const trends: Array<{
      date: Date;
      total_stock: number;
      production: number;
      barging: number;
      net_change: number;
    }> = [];

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Generate date range and calculate metrics for each day
    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const nextDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);

      // Get daily production
      const productionResult = await db
        .select({ total: sum(productionRecordsTable.tonnage) })
        .from(productionRecordsTable)
        .where(
          and(
            gte(productionRecordsTable.date_time, currentDate),
            lte(productionRecordsTable.date_time, nextDate)
          )
        )
        .execute();
      
      const dailyProduction = productionResult[0]?.total ? parseFloat(productionResult[0].total) : 0;

      // Get daily barging
      const bargingResult = await db
        .select({ total: sum(bargingRecordsTable.tonnage) })
        .from(bargingRecordsTable)
        .where(
          and(
            gte(bargingRecordsTable.date_time, currentDate),
            lte(bargingRecordsTable.date_time, nextDate)
          )
        )
        .execute();
      
      const dailyBarging = bargingResult[0]?.total ? parseFloat(bargingResult[0].total) : 0;

      // For total stock, we'll use current stock (this is simplified - in reality you'd need historical stock data)
      const stockResult = await db
        .select({ total: sum(stockTable.tonnage) })
        .from(stockTable)
        .execute();
      
      const totalStock = stockResult[0]?.total ? parseFloat(stockResult[0].total) : 0;

      trends.push({
        date: currentDate,
        total_stock: totalStock,
        production: dailyProduction,
        barging: dailyBarging,
        net_change: dailyProduction - dailyBarging
      });
    }

    return trends;
  } catch (error) {
    console.error('Stock trends retrieval failed:', error);
    throw error;
  }
}

export async function getContractorPerformance(dateFrom?: Date, dateTo?: Date): Promise<Array<{
  contractor_id: number;
  contractor_name: string;
  total_production: number;
  total_barging: number;
  current_stock: number;
  production_days: number;
  average_daily_production: number;
}>> {
  try {
    const today = new Date();
    const defaultDateFrom = dateFrom || new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const defaultDateTo = dateTo || today;

    // Get contractor production data
    const productionData = await db
      .select({
        contractor_id: productionRecordsTable.contractor_id,
        contractor_name: contractorsTable.name,
        total_production: sum(productionRecordsTable.tonnage),
        production_days: count(sql`DISTINCT DATE(${productionRecordsTable.date_time})`)
      })
      .from(productionRecordsTable)
      .innerJoin(contractorsTable, eq(productionRecordsTable.contractor_id, contractorsTable.id))
      .where(
        and(
          gte(productionRecordsTable.date_time, defaultDateFrom),
          lte(productionRecordsTable.date_time, defaultDateTo)
        )
      )
      .groupBy(productionRecordsTable.contractor_id, contractorsTable.name)
      .execute();

    // Get contractor barging data
    const bargingData = await db
      .select({
        contractor_id: bargingRecordsTable.contractor_id,
        total_barging: sum(bargingRecordsTable.tonnage)
      })
      .from(bargingRecordsTable)
      .where(
        and(
          gte(bargingRecordsTable.date_time, defaultDateFrom),
          lte(bargingRecordsTable.date_time, defaultDateTo)
        )
      )
      .groupBy(bargingRecordsTable.contractor_id)
      .execute();

    // Get current stock by contractor
    const stockData = await db
      .select({
        contractor_id: stockTable.contractor_id,
        current_stock: sum(stockTable.tonnage)
      })
      .from(stockTable)
      .groupBy(stockTable.contractor_id)
      .execute();

    // Combine data
    const performance: Array<{
      contractor_id: number;
      contractor_name: string;
      total_production: number;
      total_barging: number;
      current_stock: number;
      production_days: number;
      average_daily_production: number;
    }> = [];

    productionData.forEach(prod => {
      const barging = bargingData.find(b => b.contractor_id === prod.contractor_id);
      const stock = stockData.find(s => s.contractor_id === prod.contractor_id);

      const totalProduction = prod.total_production ? parseFloat(prod.total_production) : 0;
      const productionDays = prod.production_days || 0;

      performance.push({
        contractor_id: prod.contractor_id,
        contractor_name: prod.contractor_name,
        total_production: totalProduction,
        total_barging: barging?.total_barging ? parseFloat(barging.total_barging) : 0,
        current_stock: stock?.current_stock ? parseFloat(stock.current_stock) : 0,
        production_days: productionDays,
        average_daily_production: productionDays > 0 ? totalProduction / productionDays : 0
      });
    });

    return performance;
  } catch (error) {
    console.error('Contractor performance retrieval failed:', error);
    throw error;
  }
}