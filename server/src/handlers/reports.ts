import { db } from '../db';
import { 
  stockTable, 
  contractorsTable, 
  jettiesTable, 
  productionRecordsTable,
  bargingRecordsTable,
  fuelPurchasesTable,
  fuelUsageTable,
  usersTable
} from '../db/schema';
import { 
  type StockFilter 
} from '../schema';
import { eq, and, gte, lte, isNull, SQL, desc, sum, sql } from 'drizzle-orm';

// Helper function to escape CSV fields
function escapeCSVField(field: any): string {
  if (field === null || field === undefined) {
    return '';
  }
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Helper function to convert array to CSV
function arrayToCSV(headers: string[], rows: any[][]): string {
  const csvHeaders = headers.map(escapeCSVField).join(',');
  const csvRows = rows.map(row => 
    row.map(escapeCSVField).join(',')
  );
  return [csvHeaders, ...csvRows].join('\n');
}

// Helper function to generate filename with filters
function generateFilename(baseType: string, filters: any = {}, format: string = 'csv'): string {
  const date = new Date().toISOString().split('T')[0];
  let filename = `${baseType}_report_${date}`;
  
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? filters.dateFrom.toISOString().split('T')[0] : 'start';
    const to = filters.dateTo ? filters.dateTo.toISOString().split('T')[0] : 'end';
    filename += `_${from}_to_${to}`;
  }
  
  if (filters.contractorId) {
    filename += `_contractor_${filters.contractorId}`;
  }
  
  if (filters.jettyId) {
    filename += `_jetty_${filters.jettyId}`;
  }
  
  return `${filename}.${format}`;
}

export async function generateStockReport(
  filter?: StockFilter,
  format: 'csv' | 'pdf' = 'csv'
): Promise<{ content: string; filename: string; mimeType: string }> {
  try {
    // Build base query with joins
    let query = db.select({
      stock_id: stockTable.id,
      contractor_name: contractorsTable.name,
      contractor_code: contractorsTable.code,
      jetty_name: jettiesTable.name,
      jetty_code: jettiesTable.code,
      tonnage: stockTable.tonnage,
      last_updated: stockTable.last_updated,
      contractor_grade: contractorsTable.default_grade,
      contractor_status: contractorsTable.is_active
    })
    .from(stockTable)
    .innerJoin(contractorsTable, eq(stockTable.contractor_id, contractorsTable.id))
    .innerJoin(jettiesTable, eq(stockTable.jetty_id, jettiesTable.id));

    // Apply filters
    const conditions: SQL<unknown>[] = [];
    
    if (filter?.contractor_id) {
      conditions.push(eq(stockTable.contractor_id, filter.contractor_id));
    }
    
    if (filter?.jetty_id) {
      conditions.push(eq(stockTable.jetty_id, filter.jetty_id));
    }
    
    if (filter?.date_from) {
      conditions.push(gte(stockTable.last_updated, filter.date_from));
    }
    
    if (filter?.date_to) {
      conditions.push(lte(stockTable.last_updated, filter.date_to));
    }

    // Apply active contractors filter
    conditions.push(eq(contractorsTable.is_active, true));
    conditions.push(isNull(contractorsTable.deleted_at));

    // Apply where clause and ordering
    const finalQuery = query
      .where(and(...conditions))
      .orderBy(contractorsTable.name, jettiesTable.name);

    const results = await finalQuery.execute();

    // Convert to CSV format
    const headers = [
      'Contractor Name',
      'Contractor Code', 
      'Jetty Name',
      'Jetty Code',
      'Stock Tonnage',
      'Coal Grade',
      'Last Updated',
      'Status'
    ];

    const rows = results.map(result => [
      result.contractor_name,
      result.contractor_code,
      result.jetty_name,
      result.jetty_code,
      parseFloat(result.tonnage),
      result.contractor_grade,
      result.last_updated.toISOString(),
      result.contractor_status ? 'Active' : 'Inactive'
    ]);

    const content = arrayToCSV(headers, rows);
    const filename = generateFilename('stock', {
      contractorId: filter?.contractor_id,
      jettyId: filter?.jetty_id,
      dateFrom: filter?.date_from,
      dateTo: filter?.date_to
    }, format);
    
    return {
      content,
      filename,
      mimeType: format === 'csv' ? 'text/csv' : 'application/pdf'
    };
  } catch (error) {
    console.error('Stock report generation failed:', error);
    throw error;
  }
}

export async function generateProductionReport(
  dateFrom?: Date,
  dateTo?: Date,
  contractorId?: number,
  jettyId?: number,
  format: 'csv' | 'pdf' = 'csv'
): Promise<{ content: string; filename: string; mimeType: string }> {
  try {
    // Build query with joins
    let query = db.select({
      record_id: productionRecordsTable.id,
      date_time: productionRecordsTable.date_time,
      contractor_name: contractorsTable.name,
      contractor_code: contractorsTable.code,
      jetty_name: jettiesTable.name,
      jetty_code: jettiesTable.code,
      truck_number: productionRecordsTable.truck_number,
      tonnage: productionRecordsTable.tonnage,
      coal_grade: productionRecordsTable.coal_grade,
      operator_name: usersTable.full_name,
      notes: productionRecordsTable.notes
    })
    .from(productionRecordsTable)
    .innerJoin(contractorsTable, eq(productionRecordsTable.contractor_id, contractorsTable.id))
    .innerJoin(jettiesTable, eq(productionRecordsTable.jetty_id, jettiesTable.id))
    .innerJoin(usersTable, eq(productionRecordsTable.operator_id, usersTable.id));

    // Apply filters
    const conditions: SQL<unknown>[] = [];
    
    if (dateFrom) {
      conditions.push(gte(productionRecordsTable.date_time, dateFrom));
    }
    
    if (dateTo) {
      conditions.push(lte(productionRecordsTable.date_time, dateTo));
    }
    
    if (contractorId) {
      conditions.push(eq(productionRecordsTable.contractor_id, contractorId));
    }
    
    if (jettyId) {
      conditions.push(eq(productionRecordsTable.jetty_id, jettyId));
    }

    // Apply where clause and ordering  
    const finalQuery = conditions.length > 0
      ? query.where(and(...conditions)).orderBy(desc(productionRecordsTable.date_time))
      : query.orderBy(desc(productionRecordsTable.date_time));

    const results = await finalQuery.execute();

    // Convert to CSV format
    const headers = [
      'Date Time',
      'Contractor Name',
      'Contractor Code',
      'Jetty Name',
      'Jetty Code', 
      'Truck Number',
      'Tonnage',
      'Coal Grade',
      'Operator',
      'Notes'
    ];

    const rows = results.map(result => [
      result.date_time.toISOString(),
      result.contractor_name,
      result.contractor_code,
      result.jetty_name,
      result.jetty_code,
      result.truck_number,
      parseFloat(result.tonnage),
      result.coal_grade,
      result.operator_name,
      result.notes || ''
    ]);

    const content = arrayToCSV(headers, rows);
    const filename = generateFilename('production', { dateFrom, dateTo, contractorId, jettyId }, format);
    
    return {
      content,
      filename,
      mimeType: format === 'csv' ? 'text/csv' : 'application/pdf'
    };
  } catch (error) {
    console.error('Production report generation failed:', error);
    throw error;
  }
}

export async function generateBargingReport(
  dateFrom?: Date,
  dateTo?: Date,
  contractorId?: number,
  jettyId?: number,
  format: 'csv' | 'pdf' = 'csv'
): Promise<{ content: string; filename: string; mimeType: string }> {
  try {
    // Build query with joins
    let query = db.select({
      record_id: bargingRecordsTable.id,
      date_time: bargingRecordsTable.date_time,
      contractor_name: contractorsTable.name,
      contractor_code: contractorsTable.code,
      jetty_name: jettiesTable.name,
      jetty_code: jettiesTable.code,
      ship_batch_number: bargingRecordsTable.ship_batch_number,
      tonnage: bargingRecordsTable.tonnage,
      buyer: bargingRecordsTable.buyer,
      operator_name: usersTable.full_name,
      loading_document: bargingRecordsTable.loading_document,
      notes: bargingRecordsTable.notes
    })
    .from(bargingRecordsTable)
    .innerJoin(contractorsTable, eq(bargingRecordsTable.contractor_id, contractorsTable.id))
    .innerJoin(jettiesTable, eq(bargingRecordsTable.jetty_id, jettiesTable.id))
    .innerJoin(usersTable, eq(bargingRecordsTable.operator_id, usersTable.id));

    // Apply filters
    const conditions: SQL<unknown>[] = [];
    
    if (dateFrom) {
      conditions.push(gte(bargingRecordsTable.date_time, dateFrom));
    }
    
    if (dateTo) {
      conditions.push(lte(bargingRecordsTable.date_time, dateTo));
    }
    
    if (contractorId) {
      conditions.push(eq(bargingRecordsTable.contractor_id, contractorId));
    }
    
    if (jettyId) {
      conditions.push(eq(bargingRecordsTable.jetty_id, jettyId));
    }

    // Apply where clause and ordering
    const finalQuery = conditions.length > 0
      ? query.where(and(...conditions)).orderBy(desc(bargingRecordsTable.date_time))
      : query.orderBy(desc(bargingRecordsTable.date_time));

    const results = await finalQuery.execute();

    // Convert to CSV format
    const headers = [
      'Date Time',
      'Contractor Name',
      'Contractor Code',
      'Jetty Name',
      'Jetty Code',
      'Ship Batch Number',
      'Tonnage',
      'Buyer',
      'Operator',
      'Loading Document',
      'Notes'
    ];

    const rows = results.map(result => [
      result.date_time.toISOString(),
      result.contractor_name,
      result.contractor_code,
      result.jetty_name,
      result.jetty_code,
      result.ship_batch_number,
      parseFloat(result.tonnage),
      result.buyer || '',
      result.operator_name,
      result.loading_document || '',
      result.notes || ''
    ]);

    const content = arrayToCSV(headers, rows);
    const filename = generateFilename('barging', { dateFrom, dateTo, contractorId, jettyId }, format);
    
    return {
      content,
      filename,
      mimeType: format === 'csv' ? 'text/csv' : 'application/pdf'
    };
  } catch (error) {
    console.error('Barging report generation failed:', error);
    throw error;
  }
}

export async function generateFuelReport(
  dateFrom?: Date,
  dateTo?: Date,
  jettyId?: number,
  format: 'csv' | 'pdf' = 'csv'
): Promise<{ content: string; filename: string; mimeType: string }> {
  try {
    // Query fuel purchases
    let purchaseQuery = db.select({
      type: sql<string>`'Purchase'`.as('type'),
      date: fuelPurchasesTable.date,
      jetty_name: jettiesTable.name,
      supplier_machine: fuelPurchasesTable.supplier,
      volume_liters: fuelPurchasesTable.volume_liters,
      cost_tonnage: fuelPurchasesTable.cost,
      invoice_number: fuelPurchasesTable.invoice_number,
      machine_destination: fuelPurchasesTable.machine_destination,
      operator_name: usersTable.full_name
    })
    .from(fuelPurchasesTable)
    .innerJoin(jettiesTable, eq(fuelPurchasesTable.jetty_id, jettiesTable.id))
    .innerJoin(usersTable, eq(fuelPurchasesTable.created_by, usersTable.id));

    // Query fuel usage
    let usageQuery = db.select({
      type: sql<string>`'Usage'`.as('type'),
      date: fuelUsageTable.date,
      jetty_name: sql<string>`'N/A'`.as('jetty_name'),
      supplier_machine: fuelUsageTable.machine_equipment,
      volume_liters: fuelUsageTable.volume_liters,
      cost_tonnage: fuelUsageTable.production_tonnage,
      invoice_number: sql<string>`'N/A'`.as('invoice_number'),
      machine_destination: fuelUsageTable.operator,
      operator_name: usersTable.full_name
    })
    .from(fuelUsageTable)
    .innerJoin(usersTable, eq(fuelUsageTable.created_by, usersTable.id));

    // Apply filters to purchases
    const purchaseConditions: SQL<unknown>[] = [];
    if (dateFrom) {
      purchaseConditions.push(gte(fuelPurchasesTable.date, dateFrom));
    }
    if (dateTo) {
      purchaseConditions.push(lte(fuelPurchasesTable.date, dateTo));
    }
    if (jettyId) {
      purchaseConditions.push(eq(fuelPurchasesTable.jetty_id, jettyId));
    }

    // Apply filters to usage
    const usageConditions: SQL<unknown>[] = [];
    if (dateFrom) {
      usageConditions.push(gte(fuelUsageTable.date, dateFrom));
    }
    if (dateTo) {
      usageConditions.push(lte(fuelUsageTable.date, dateTo));
    }

    const finalPurchaseQuery = purchaseConditions.length > 0 
      ? purchaseQuery.where(and(...purchaseConditions))
      : purchaseQuery;

    const finalUsageQuery = usageConditions.length > 0 
      ? usageQuery.where(and(...usageConditions))
      : usageQuery;

    // Execute both queries
    const [purchases, usage] = await Promise.all([
      finalPurchaseQuery.execute(),
      finalUsageQuery.execute()
    ]);

    // Combine and sort results
    const allRecords = [
      ...purchases,
      ...usage
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    // Convert to CSV format
    const headers = [
      'Date',
      'Type',
      'Jetty',
      'Supplier/Machine',
      'Volume (Liters)',
      'Cost/Production Tonnage',
      'Invoice Number',
      'Machine Destination/Operator',
      'Created By'
    ];

    const rows = allRecords.map(result => [
      result.date.toISOString().split('T')[0],
      result.type,
      result.jetty_name,
      result.supplier_machine,
      parseFloat(result.volume_liters),
      parseFloat(result.cost_tonnage),
      result.invoice_number,
      result.machine_destination || '',
      result.operator_name
    ]);

    const content = arrayToCSV(headers, rows);
    const filename = generateFilename('fuel', { dateFrom, dateTo, jettyId }, format);
    
    return {
      content,
      filename,
      mimeType: format === 'csv' ? 'text/csv' : 'application/pdf'
    };
  } catch (error) {
    console.error('Fuel report generation failed:', error);
    throw error;
  }
}

export async function generateContractorReport(
  format: 'csv' | 'pdf' = 'csv'
): Promise<{ content: string; filename: string; mimeType: string }> {
  try {
    // Query contractors with aggregated stock
    const query = db.select({
      contractor_id: contractorsTable.id,
      name: contractorsTable.name,
      code: contractorsTable.code,
      contact_person: contractorsTable.contact_person,
      contract_number: contractorsTable.contract_number,
      default_grade: contractorsTable.default_grade,
      is_active: contractorsTable.is_active,
      created_at: contractorsTable.created_at,
      total_stock: sum(stockTable.tonnage).as('total_stock')
    })
    .from(contractorsTable)
    .leftJoin(stockTable, eq(contractorsTable.id, stockTable.contractor_id))
    .where(isNull(contractorsTable.deleted_at))
    .groupBy(
      contractorsTable.id,
      contractorsTable.name,
      contractorsTable.code,
      contractorsTable.contact_person,
      contractorsTable.contract_number,
      contractorsTable.default_grade,
      contractorsTable.is_active,
      contractorsTable.created_at
    )
    .orderBy(contractorsTable.name);

    const results = await query.execute();

    // Convert to CSV format
    const headers = [
      'Name',
      'Code',
      'Contact Person',
      'Contract Number',
      'Default Grade',
      'Status',
      'Current Stock (Tonnes)',
      'Created Date'
    ];

    const rows = results.map(result => [
      result.name,
      result.code,
      result.contact_person,
      result.contract_number || '',
      result.default_grade,
      result.is_active ? 'Active' : 'Inactive',
      result.total_stock ? parseFloat(result.total_stock) : 0,
      result.created_at.toISOString().split('T')[0]
    ]);

    const content = arrayToCSV(headers, rows);
    const filename = generateFilename('contractors', {}, format);
    
    return {
      content,
      filename,
      mimeType: format === 'csv' ? 'text/csv' : 'application/pdf'
    };
  } catch (error) {
    console.error('Contractor report generation failed:', error);
    throw error;
  }
}

export async function generateMovementReport(
  dateFrom?: Date,
  dateTo?: Date,
  contractorId?: number,
  jettyId?: number,
  format: 'csv' | 'pdf' = 'csv'
): Promise<{ content: string; filename: string; mimeType: string }> {
  try {
    // Query production records (inflow)
    let productionQuery = db.select({
      type: sql<string>`'Production'`.as('type'),
      date_time: productionRecordsTable.date_time,
      contractor_name: contractorsTable.name,
      jetty_name: jettiesTable.name,
      tonnage: productionRecordsTable.tonnage,
      direction: sql<string>`'In'`.as('direction'),
      operator_name: usersTable.full_name,
      reference: productionRecordsTable.truck_number,
      contractor_id: contractorsTable.id,
      jetty_id: jettiesTable.id
    })
    .from(productionRecordsTable)
    .innerJoin(contractorsTable, eq(productionRecordsTable.contractor_id, contractorsTable.id))
    .innerJoin(jettiesTable, eq(productionRecordsTable.jetty_id, jettiesTable.id))
    .innerJoin(usersTable, eq(productionRecordsTable.operator_id, usersTable.id));

    // Query barging records (outflow)
    let bargingQuery = db.select({
      type: sql<string>`'Barging'`.as('type'),
      date_time: bargingRecordsTable.date_time,
      contractor_name: contractorsTable.name,
      jetty_name: jettiesTable.name,
      tonnage: bargingRecordsTable.tonnage,
      direction: sql<string>`'Out'`.as('direction'),
      operator_name: usersTable.full_name,
      reference: bargingRecordsTable.ship_batch_number,
      contractor_id: contractorsTable.id,
      jetty_id: jettiesTable.id
    })
    .from(bargingRecordsTable)
    .innerJoin(contractorsTable, eq(bargingRecordsTable.contractor_id, contractorsTable.id))
    .innerJoin(jettiesTable, eq(bargingRecordsTable.jetty_id, jettiesTable.id))
    .innerJoin(usersTable, eq(bargingRecordsTable.operator_id, usersTable.id));

    // Apply filters to production
    const productionConditions: SQL<unknown>[] = [];
    if (dateFrom) {
      productionConditions.push(gte(productionRecordsTable.date_time, dateFrom));
    }
    if (dateTo) {
      productionConditions.push(lte(productionRecordsTable.date_time, dateTo));
    }
    if (contractorId) {
      productionConditions.push(eq(productionRecordsTable.contractor_id, contractorId));
    }
    if (jettyId) {
      productionConditions.push(eq(productionRecordsTable.jetty_id, jettyId));
    }

    // Apply filters to barging
    const bargingConditions: SQL<unknown>[] = [];
    if (dateFrom) {
      bargingConditions.push(gte(bargingRecordsTable.date_time, dateFrom));
    }
    if (dateTo) {
      bargingConditions.push(lte(bargingRecordsTable.date_time, dateTo));
    }
    if (contractorId) {
      bargingConditions.push(eq(bargingRecordsTable.contractor_id, contractorId));
    }
    if (jettyId) {
      bargingConditions.push(eq(bargingRecordsTable.jetty_id, jettyId));
    }

    const finalProductionQuery = productionConditions.length > 0 
      ? productionQuery.where(and(...productionConditions))
      : productionQuery;

    const finalBargingQuery = bargingConditions.length > 0 
      ? bargingQuery.where(and(...bargingConditions))
      : bargingQuery;

    // Execute both queries
    const [production, barging] = await Promise.all([
      finalProductionQuery.execute(),
      finalBargingQuery.execute()
    ]);

    // Combine and sort by date
    const movements = [...production, ...barging].sort((a, b) => 
      a.date_time.getTime() - b.date_time.getTime()
    );

    // Calculate running balances by contractor/jetty combination
    const balanceTracker = new Map<string, number>();
    const movementsWithBalance = movements.map(movement => {
      const key = `${movement.contractor_id}_${movement.jetty_id}`;
      const currentBalance = balanceTracker.get(key) || 0;
      const tonnageChange = movement.direction === 'In' ? 
        parseFloat(movement.tonnage) : -parseFloat(movement.tonnage);
      const newBalance = currentBalance + tonnageChange;
      balanceTracker.set(key, newBalance);
      
      return {
        ...movement,
        running_balance: newBalance
      };
    });

    // Convert to CSV format
    const headers = [
      'Date Time',
      'Type',
      'Contractor',
      'Jetty',
      'Tonnage',
      'Direction',
      'Running Balance',
      'Operator',
      'Reference'
    ];

    const rows = movementsWithBalance.map(result => [
      result.date_time.toISOString(),
      result.type,
      result.contractor_name,
      result.jetty_name,
      parseFloat(result.tonnage),
      result.direction,
      result.running_balance,
      result.operator_name,
      result.reference
    ]);

    const content = arrayToCSV(headers, rows);
    const filename = generateFilename('movement', { dateFrom, dateTo, contractorId, jettyId }, format);
    
    return {
      content,
      filename,
      mimeType: format === 'csv' ? 'text/csv' : 'application/pdf'
    };
  } catch (error) {
    console.error('Movement report generation failed:', error);
    throw error;
  }
}

export async function generateExecutiveSummary(
  dateFrom?: Date,
  dateTo?: Date,
  format: 'pdf' = 'pdf'
): Promise<{ content: string; filename: string; mimeType: string }> {
  try {
    // For this implementation, we'll generate a comprehensive text-based summary
    // In a real implementation, this would generate a proper PDF with charts
    
    const conditions: SQL<unknown>[] = [];
    if (dateFrom) {
      conditions.push(gte(productionRecordsTable.date_time, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(productionRecordsTable.date_time, dateTo));
    }

    // Get total stock
    const stockResults = await db.select({
      total_stock: sum(stockTable.tonnage)
    })
    .from(stockTable)
    .execute();

    // Get production totals
    let productionQuery = db.select({
      total_production: sum(productionRecordsTable.tonnage),
      record_count: sql<number>`COUNT(*)`.as('record_count')
    })
    .from(productionRecordsTable);

    const finalProductionQuery = conditions.length > 0 
      ? productionQuery.where(and(...conditions))
      : productionQuery;

    const productionResults = await finalProductionQuery.execute();

    // Get barging totals
    let bargingQuery = db.select({
      total_barging: sum(bargingRecordsTable.tonnage),
      record_count: sql<number>`COUNT(*)`.as('record_count')
    })
    .from(bargingRecordsTable);

    const bargingConditions: SQL<unknown>[] = [];
    if (dateFrom) {
      bargingConditions.push(gte(bargingRecordsTable.date_time, dateFrom));
    }
    if (dateTo) {
      bargingConditions.push(lte(bargingRecordsTable.date_time, dateTo));
    }

    const finalBargingQuery = bargingConditions.length > 0 
      ? bargingQuery.where(and(...bargingConditions))
      : bargingQuery;

    const bargingResults = await finalBargingQuery.execute();

    // Get active contractors count
    const contractorResults = await db.select({
      active_count: sql<number>`COUNT(*)`.as('active_count')
    })
    .from(contractorsTable)
    .where(and(eq(contractorsTable.is_active, true), isNull(contractorsTable.deleted_at)))
    .execute();

    // Build summary content
    const totalStock = stockResults[0]?.total_stock ? parseFloat(stockResults[0].total_stock) : 0;
    const totalProduction = productionResults[0]?.total_production ? parseFloat(productionResults[0].total_production) : 0;
    const totalBarging = bargingResults[0]?.total_barging ? parseFloat(bargingResults[0].total_barging) : 0;
    const activeContractors = contractorResults[0]?.active_count || 0;

    const periodText = dateFrom && dateTo ? 
      `Period: ${dateFrom.toISOString().split('T')[0]} to ${dateTo.toISOString().split('T')[0]}` :
      'Period: All time';

    const summaryContent = [
      'EXECUTIVE SUMMARY',
      '==================',
      '',
      periodText,
      `Generated: ${new Date().toISOString()}`,
      '',
      'KEY METRICS',
      '-----------',
      `Total Current Stock: ${totalStock.toLocaleString()} tonnes`,
      `Total Production: ${totalProduction.toLocaleString()} tonnes`,
      `Total Barging: ${totalBarging.toLocaleString()} tonnes`,
      `Active Contractors: ${activeContractors}`,
      `Production Records: ${productionResults[0]?.record_count || 0}`,
      `Barging Records: ${bargingResults[0]?.record_count || 0}`,
      '',
      'ANALYSIS',
      '--------',
      `Net Stock Change: ${(totalProduction - totalBarging).toLocaleString()} tonnes`,
      `Production vs Barging Ratio: ${totalBarging > 0 ? (totalProduction / totalBarging).toFixed(2) : 'N/A'}`,
      '',
      '* This is a simplified text-based executive summary.',
      '* A complete implementation would include charts, graphs, and detailed analytics.',
      '* PDF generation would require additional libraries like PDFKit or Puppeteer.'
    ].join('\n');

    const filename = generateFilename('executive_summary', { dateFrom, dateTo }, 'txt');
    
    return {
      content: summaryContent,
      filename: filename.replace('.txt', '.pdf'), // Keep PDF extension for consistency
      mimeType: 'application/pdf'
    };
  } catch (error) {
    console.error('Executive summary generation failed:', error);
    throw error;
  }
}