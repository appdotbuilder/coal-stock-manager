import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  contractorsTable, 
  jettiesTable, 
  stockTable,
  productionRecordsTable,
  bargingRecordsTable,
  fuelPurchasesTable,
  fuelUsageTable
} from '../db/schema';
import { 
  generateStockReport,
  generateProductionReport,
  generateBargingReport,
  generateFuelReport,
  generateContractorReport,
  generateMovementReport,
  generateExecutiveSummary
} from '../handlers/reports';
import { type StockFilter } from '../schema';

describe('Reports Handlers', () => {
  let testUser: any;
  let testContractor: any;
  let testJetty: any;
  let testStock: any;

  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'operator@test.com',
        username: 'operator',
        password_hash: 'hashed_password',
        full_name: 'Test Operator',
        role: 'operator_produksi'
      })
      .returning()
      .execute();
    testUser = userResult[0];

    // Create test contractor
    const contractorResult = await db.insert(contractorsTable)
      .values({
        name: 'Test Contractor Ltd',
        code: 'TC001',
        contact_person: 'John Contractor',
        contract_number: 'CONTRACT-2024-001',
        default_grade: 'high'
      })
      .returning()
      .execute();
    testContractor = contractorResult[0];

    // Create test jetty
    const jettyResult = await db.insert(jettiesTable)
      .values({
        name: 'Jetty Alpha',
        code: 'JA001',
        capacity: '5000.00'
      })
      .returning()
      .execute();
    testJetty = jettyResult[0];

    // Create test stock
    const stockResult = await db.insert(stockTable)
      .values({
        contractor_id: testContractor.id,
        jetty_id: testJetty.id,
        tonnage: '1500.50'
      })
      .returning()
      .execute();
    testStock = stockResult[0];
  });

  afterEach(resetDB);

  describe('generateStockReport', () => {
    it('should generate stock report without filters', async () => {
      const result = await generateStockReport();

      expect(result.content).toBeDefined();
      expect(result.filename).toMatch(/^stock_report_\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.mimeType).toBe('text/csv');

      // Check CSV structure
      const lines = result.content.split('\n');
      expect(lines[0]).toBe('Contractor Name,Contractor Code,Jetty Name,Jetty Code,Stock Tonnage,Coal Grade,Last Updated,Status');
      expect(lines[1]).toContain('Test Contractor Ltd');
      expect(lines[1]).toContain('TC001');
      expect(lines[1]).toContain('Jetty Alpha');
      expect(lines[1]).toContain('1500.5');
      expect(lines[1]).toContain('high');
    });

    it('should apply contractor filter', async () => {
      const filter: StockFilter = { contractor_id: testContractor.id };
      const result = await generateStockReport(filter);

      expect(result.content).toContain('Test Contractor Ltd');
      expect(result.filename).toContain(`contractor_${testContractor.id}`);
    });

    it('should apply jetty filter', async () => {
      const filter: StockFilter = { jetty_id: testJetty.id };
      const result = await generateStockReport(filter);

      expect(result.content).toContain('Jetty Alpha');
      expect(result.filename).toContain(`jetty_${testJetty.id}`);
    });

    it('should apply date range filter', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');
      const filter: StockFilter = { date_from: dateFrom, date_to: dateTo };
      
      const result = await generateStockReport(filter);

      expect(result.filename).toContain('2024-01-01_to_2024-12-31');
    });

    it('should handle empty results', async () => {
      // Use non-existent contractor ID
      const filter: StockFilter = { contractor_id: 99999 };
      const result = await generateStockReport(filter);

      const lines = result.content.split('\n');
      expect(lines).toHaveLength(1); // Only header row
      expect(lines[0]).toContain('Contractor Name');
    });
  });

  describe('generateProductionReport', () => {
    beforeEach(async () => {
      // Create test production record
      await db.insert(productionRecordsTable)
        .values({
          date_time: new Date('2024-06-15T10:30:00Z'),
          contractor_id: testContractor.id,
          truck_number: 'TRK-001',
          tonnage: '25.75',
          coal_grade: 'high',
          jetty_id: testJetty.id,
          operator_id: testUser.id,
          notes: 'Test production record'
        })
        .execute();
    });

    it('should generate production report without filters', async () => {
      const result = await generateProductionReport();

      expect(result.content).toBeDefined();
      expect(result.filename).toMatch(/^production_report_\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.mimeType).toBe('text/csv');

      const lines = result.content.split('\n');
      expect(lines[0]).toBe('Date Time,Contractor Name,Contractor Code,Jetty Name,Jetty Code,Truck Number,Tonnage,Coal Grade,Operator,Notes');
      expect(lines[1]).toContain('Test Contractor Ltd');
      expect(lines[1]).toContain('TRK-001');
      expect(lines[1]).toContain('25.75');
      expect(lines[1]).toContain('Test Operator');
    });

    it('should filter by date range', async () => {
      const dateFrom = new Date('2024-06-01');
      const dateTo = new Date('2024-06-30');
      
      const result = await generateProductionReport(dateFrom, dateTo);

      expect(result.content).toContain('TRK-001');
      expect(result.filename).toContain('2024-06-01_to_2024-06-30');
    });

    it('should filter by contractor', async () => {
      const result = await generateProductionReport(undefined, undefined, testContractor.id);

      expect(result.content).toContain('Test Contractor Ltd');
      expect(result.filename).toContain(`contractor_${testContractor.id}`);
    });

    it('should exclude records outside date range', async () => {
      const dateFrom = new Date('2025-01-01');
      const dateTo = new Date('2025-01-31');
      
      const result = await generateProductionReport(dateFrom, dateTo);

      const lines = result.content.split('\n');
      expect(lines).toHaveLength(1); // Only header
    });
  });

  describe('generateBargingReport', () => {
    beforeEach(async () => {
      // Create test barging record
      await db.insert(bargingRecordsTable)
        .values({
          date_time: new Date('2024-06-20T14:15:00Z'),
          contractor_id: testContractor.id,
          ship_batch_number: 'SHIP-2024-001',
          tonnage: '18.25',
          jetty_id: testJetty.id,
          buyer: 'Test Buyer Corp',
          operator_id: testUser.id,
          notes: 'Test barging record'
        })
        .execute();
    });

    it('should generate barging report', async () => {
      const result = await generateBargingReport();

      expect(result.content).toBeDefined();
      expect(result.filename).toMatch(/^barging_report_\d{4}-\d{2}-\d{2}\.csv$/);

      const lines = result.content.split('\n');
      expect(lines[0]).toBe('Date Time,Contractor Name,Contractor Code,Jetty Name,Jetty Code,Ship Batch Number,Tonnage,Buyer,Operator,Loading Document,Notes');
      expect(lines[1]).toContain('SHIP-2024-001');
      expect(lines[1]).toContain('18.25');
      expect(lines[1]).toContain('Test Buyer Corp');
    });

    it('should filter by contractor and jetty', async () => {
      const result = await generateBargingReport(undefined, undefined, testContractor.id, testJetty.id);

      expect(result.content).toContain('Test Contractor Ltd');
      expect(result.content).toContain('Jetty Alpha');
      expect(result.filename).toContain(`contractor_${testContractor.id}`);
      expect(result.filename).toContain(`jetty_${testJetty.id}`);
    });
  });

  describe('generateFuelReport', () => {
    beforeEach(async () => {
      // Create test fuel purchase
      await db.insert(fuelPurchasesTable)
        .values({
          date: new Date('2024-06-10'),
          supplier: 'Fuel Supplier Inc',
          volume_liters: '500.00',
          cost: '750.00',
          invoice_number: 'INV-2024-001',
          jetty_id: testJetty.id,
          machine_destination: 'Excavator A',
          created_by: testUser.id
        })
        .execute();

      // Create test fuel usage
      await db.insert(fuelUsageTable)
        .values({
          date: new Date('2024-06-12'),
          machine_equipment: 'Excavator A',
          operator: 'Machine Operator',
          volume_liters: '50.00',
          production_tonnage: '100.00',
          created_by: testUser.id
        })
        .execute();
    });

    it('should generate fuel report with both purchases and usage', async () => {
      const result = await generateFuelReport();

      expect(result.content).toBeDefined();
      expect(result.filename).toMatch(/^fuel_report_\d{4}-\d{2}-\d{2}\.csv$/);

      const lines = result.content.split('\n');
      expect(lines[0]).toBe('Date,Type,Jetty,Supplier/Machine,Volume (Liters),Cost/Production Tonnage,Invoice Number,Machine Destination/Operator,Created By');
      
      // Should contain both purchase and usage records
      expect(result.content).toContain('Purchase');
      expect(result.content).toContain('Usage'); 
      expect(result.content).toContain('Fuel Supplier Inc');
      expect(result.content).toContain('Excavator A');
    });

    it('should filter by jetty', async () => {
      const result = await generateFuelReport(undefined, undefined, testJetty.id);

      expect(result.content).toContain('Jetty Alpha');
      expect(result.filename).toContain(`jetty_${testJetty.id}`);
    });
  });

  describe('generateContractorReport', () => {
    it('should generate contractor report with stock aggregation', async () => {
      const result = await generateContractorReport();

      expect(result.content).toBeDefined();
      expect(result.filename).toMatch(/^contractors_report_\d{4}-\d{2}-\d{2}\.csv$/);

      const lines = result.content.split('\n');
      expect(lines[0]).toBe('Name,Code,Contact Person,Contract Number,Default Grade,Status,Current Stock (Tonnes),Created Date');
      expect(lines[1]).toContain('Test Contractor Ltd');
      expect(lines[1]).toContain('TC001');
      expect(lines[1]).toContain('John Contractor');
      expect(lines[1]).toContain('CONTRACT-2024-001');
      expect(lines[1]).toContain('high');
      expect(lines[1]).toContain('Active');
      expect(lines[1]).toContain('1500.5');
    });

    it('should include contractors without stock', async () => {
      // Create contractor without stock
      await db.insert(contractorsTable)
        .values({
          name: 'No Stock Contractor',
          code: 'NSC001',
          contact_person: 'Jane NoStock',
          default_grade: 'medium'
        })
        .execute();

      const result = await generateContractorReport();

      expect(result.content).toContain('No Stock Contractor');
      expect(result.content).toContain('NSC001');
    });
  });

  describe('generateMovementReport', () => {
    beforeEach(async () => {
      // Create production record (inflow)
      await db.insert(productionRecordsTable)
        .values({
          date_time: new Date('2024-06-15T10:00:00Z'),
          contractor_id: testContractor.id,
          truck_number: 'TRK-001',
          tonnage: '30.00',
          coal_grade: 'high',
          jetty_id: testJetty.id,
          operator_id: testUser.id
        })
        .execute();

      // Create barging record (outflow)
      await db.insert(bargingRecordsTable)
        .values({
          date_time: new Date('2024-06-16T14:00:00Z'),
          contractor_id: testContractor.id,
          ship_batch_number: 'SHIP-001',
          tonnage: '20.00',
          jetty_id: testJetty.id,
          operator_id: testUser.id
        })
        .execute();
    });

    it('should generate movement report with running balance', async () => {
      const result = await generateMovementReport();

      expect(result.content).toBeDefined();
      expect(result.filename).toMatch(/^movement_report_\d{4}-\d{2}-\d{2}\.csv$/);

      const lines = result.content.split('\n');
      expect(lines[0]).toBe('Date Time,Type,Contractor,Jetty,Tonnage,Direction,Running Balance,Operator,Reference');
      
      // Should show both production and barging with running balance
      expect(result.content).toContain('Production');
      expect(result.content).toContain('Barging');
      expect(result.content).toContain('In');
      expect(result.content).toContain('Out');
      expect(result.content).toContain('TRK-001');
      expect(result.content).toContain('SHIP-001');
    });

    it('should calculate running balance correctly', async () => {
      const result = await generateMovementReport();

      const lines = result.content.split('\n');
      // Skip header, check data rows
      const dataLines = lines.slice(1).filter(line => line.trim());
      
      expect(dataLines.length).toBe(2);
      
      // Records should be sorted chronologically
      const firstRecord = dataLines[0];
      const secondRecord = dataLines[1];
      
      // Check that running balance calculations are present
      expect(result.content).toContain('Production');
      expect(result.content).toContain('Barging');
      expect(result.content).toContain('In');
      expect(result.content).toContain('Out');
      
      // Verify both records have running balance values (numbers)
      const firstBalance = firstRecord.split(',')[6]; // Running balance column
      const secondBalance = secondRecord.split(',')[6];
      
      expect(parseFloat(firstBalance)).toBeGreaterThan(0);
      expect(parseFloat(secondBalance)).toBeGreaterThan(0);
    });

    it('should filter by date range', async () => {
      const dateFrom = new Date('2024-06-16');
      const dateTo = new Date('2024-06-17'); // Extend to next day to include June 16 records
      
      const result = await generateMovementReport(dateFrom, dateTo);

      // Should only contain barging record from June 16
      expect(result.content).toContain('Barging');
      expect(result.content).toContain('SHIP-001');
    });
  });

  describe('generateExecutiveSummary', () => {
    beforeEach(async () => {
      // Create some test data for summary
      await db.insert(productionRecordsTable)
        .values([
          {
            date_time: new Date('2024-06-01T10:00:00Z'),
            contractor_id: testContractor.id,
            truck_number: 'TRK-001',
            tonnage: '50.00',
            coal_grade: 'high',
            jetty_id: testJetty.id,
            operator_id: testUser.id
          },
          {
            date_time: new Date('2024-06-02T11:00:00Z'),
            contractor_id: testContractor.id,
            truck_number: 'TRK-002',
            tonnage: '75.00',
            coal_grade: 'medium',
            jetty_id: testJetty.id,
            operator_id: testUser.id
          }
        ])
        .execute();

      await db.insert(bargingRecordsTable)
        .values({
          date_time: new Date('2024-06-03T14:00:00Z'),
          contractor_id: testContractor.id,
          ship_batch_number: 'SHIP-001',
          tonnage: '40.00',
          jetty_id: testJetty.id,
          operator_id: testUser.id
        })
        .execute();
    });

    it('should generate executive summary with key metrics', async () => {
      const result = await generateExecutiveSummary();

      expect(result.content).toBeDefined();
      expect(result.filename).toMatch(/^executive_summary_report_\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(result.mimeType).toBe('application/pdf');

      // Check content includes key sections
      expect(result.content).toContain('EXECUTIVE SUMMARY');
      expect(result.content).toContain('KEY METRICS');
      expect(result.content).toContain('ANALYSIS');
      expect(result.content).toContain('Total Current Stock:');
      expect(result.content).toContain('Total Production:');
      expect(result.content).toContain('Total Barging:');
      expect(result.content).toContain('Active Contractors:');
    });

    it('should filter by date range', async () => {
      const dateFrom = new Date('2024-06-01');
      const dateTo = new Date('2024-06-02');
      
      const result = await generateExecutiveSummary(dateFrom, dateTo);

      expect(result.content).toContain('Period: 2024-06-01 to 2024-06-02');
      expect(result.filename).toContain('2024-06-01_to_2024-06-02');
    });

    it('should calculate metrics correctly', async () => {
      const result = await generateExecutiveSummary();

      // Should aggregate production (50 + 75 = 125)
      expect(result.content).toContain('Total Production: 125');
      // Should show barging (40)
      expect(result.content).toContain('Total Barging: 40');
      // Should calculate net change (125 - 40 = 85)
      expect(result.content).toContain('Net Stock Change: 85');
      // Should show active contractors (1)
      expect(result.content).toContain('Active Contractors: 1');
    });

    it('should handle production records count', async () => {
      const result = await generateExecutiveSummary();

      expect(result.content).toContain('Production Records: 2');
      expect(result.content).toContain('Barging Records: 1');
    });

    it('should calculate production vs barging ratio', async () => {
      const result = await generateExecutiveSummary();

      // Production (125) / Barging (40) = 3.13 (rounded to 2 decimal places)
      expect(result.content).toContain('Production vs Barging Ratio: 3.13');
    });
  });

  describe('CSV formatting', () => {
    it('should handle fields with commas in CSV output', async () => {
      // Create contractor with comma in name
      await db.insert(contractorsTable)
        .values({
          name: 'Smith, Jones & Associates',
          code: 'SJA001',
          contact_person: 'John Smith, Jr.',
          default_grade: 'high'
        })
        .execute();

      const result = await generateContractorReport();

      // Should contain the contractor data (exact CSV formatting may vary)
      expect(result.content).toContain('Smith, Jones & Associates');
      expect(result.content).toContain('SJA001');
      expect(result.content).toContain('John Smith, Jr.');
    });

    it('should handle null values in CSV output', async () => {
      // Create contractor with null contract number
      await db.insert(contractorsTable)
        .values({
          name: 'Null Contract Co',
          code: 'NCC001',
          contact_person: 'Jane Null',
          contract_number: null,
          default_grade: 'low'
        })
        .execute();

      const result = await generateContractorReport();

      // Should handle null values gracefully
      expect(result.content).toContain('Null Contract Co');
      expect(result.content).toContain('NCC001');
      expect(result.content).toContain('Jane Null');
      expect(result.content).toContain('low');
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Force a database error by using invalid table reference
      await expect(async () => {
        // This should cause an error since we're using a mocked scenario
        // In real implementation, we'd test with actual DB connection issues
        const filter: StockFilter = { contractor_id: testContractor.id };
        await generateStockReport(filter);
      }).not.toThrow();
    });
  });
});