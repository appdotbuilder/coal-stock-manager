import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { 
  usersTable, 
  jettiesTable, 
  fuelPurchasesTable,
  fuelUsageTable,
  contractorsTable,
  productionRecordsTable
} from '../db/schema';
import { 
  type CreateFuelPurchaseInput,
  type CreateFuelUsageInput
} from '../schema';
import { 
  createFuelPurchase,
  createFuelUsage,
  getFuelPurchases,
  getFuelUsage,
  getFuelPurchaseById,
  getFuelUsageById,
  getFuelSummary
} from '../handlers/fuel';

// Test data
const testUser = {
  email: 'operator@test.com',
  username: 'operator',
  password_hash: 'hashed_password',
  full_name: 'Test Operator',
  role: 'operator_produksi' as const
};

const testJetty = {
  name: 'Test Jetty',
  code: 'TJ01',
  capacity: '10000' // numeric fields are strings in database
};

const testContractor = {
  name: 'Test Contractor',
  code: 'TC01',
  contact_person: 'John Doe',
  contract_number: 'CONTRACT-001',
  default_grade: 'high' as const
};

const testFuelPurchaseInput: CreateFuelPurchaseInput = {
  date: new Date('2024-01-15'),
  supplier: 'Fuel Supplier Inc',
  volume_liters: 1000,
  cost: 15000,
  invoice_number: 'INV-001',
  jetty_id: 0, // Will be set in tests
  machine_destination: 'Excavator XYZ',
  created_by: 0 // Will be set in tests
};

const testFuelUsageInput: CreateFuelUsageInput = {
  date: new Date('2024-01-15'),
  machine_equipment: 'Excavator XYZ',
  operator: 'John Smith',
  volume_liters: 50,
  production_tonnage: 100,
  production_record_id: null,
  created_by: 0 // Will be set in tests
};

describe('Fuel Handlers', () => {
  let userId: number;
  let jettyId: number;
  let contractorId: number;

  beforeEach(async () => {
    await createDB();
    
    // Create prerequisite data
    const userResult = await db.insert(usersTable).values(testUser).returning().execute();
    userId = userResult[0].id;

    const jettyResult = await db.insert(jettiesTable).values(testJetty).returning().execute();
    jettyId = jettyResult[0].id;

    const contractorResult = await db.insert(contractorsTable).values(testContractor).returning().execute();
    contractorId = contractorResult[0].id;
  });

  afterEach(resetDB);

  describe('createFuelPurchase', () => {
    it('should create a fuel purchase record', async () => {
      const input = {
        ...testFuelPurchaseInput,
        jetty_id: jettyId,
        created_by: userId
      };

      const result = await createFuelPurchase(input);

      expect(result.id).toBeDefined();
      expect(result.supplier).toEqual('Fuel Supplier Inc');
      expect(result.volume_liters).toEqual(1000);
      expect(typeof result.volume_liters).toBe('number');
      expect(result.cost).toEqual(15000);
      expect(typeof result.cost).toBe('number');
      expect(result.invoice_number).toEqual('INV-001');
      expect(result.jetty_id).toEqual(jettyId);
      expect(result.machine_destination).toEqual('Excavator XYZ');
      expect(result.created_by).toEqual(userId);
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save fuel purchase to database', async () => {
      const input = {
        ...testFuelPurchaseInput,
        jetty_id: jettyId,
        created_by: userId
      };

      const result = await createFuelPurchase(input);

      const saved = await db.select()
        .from(fuelPurchasesTable)
        .where(eq(fuelPurchasesTable.id, result.id))
        .execute();

      expect(saved).toHaveLength(1);
      expect(saved[0].supplier).toEqual('Fuel Supplier Inc');
      expect(parseFloat(saved[0].volume_liters)).toEqual(1000);
      expect(parseFloat(saved[0].cost)).toEqual(15000);
    });

    it('should throw error for inactive jetty', async () => {
      // Deactivate jetty
      await db.update(jettiesTable)
        .set({ is_active: false })
        .where(eq(jettiesTable.id, jettyId))
        .execute();

      const input = {
        ...testFuelPurchaseInput,
        jetty_id: jettyId,
        created_by: userId
      };

      await expect(createFuelPurchase(input)).rejects.toThrow(/jetty not found or inactive/i);
    });

    it('should throw error for non-existent jetty', async () => {
      const input = {
        ...testFuelPurchaseInput,
        jetty_id: 99999,
        created_by: userId
      };

      await expect(createFuelPurchase(input)).rejects.toThrow(/jetty not found or inactive/i);
    });
  });

  describe('createFuelUsage', () => {
    it('should create a fuel usage record', async () => {
      const input = {
        ...testFuelUsageInput,
        created_by: userId
      };

      const result = await createFuelUsage(input);

      expect(result.id).toBeDefined();
      expect(result.machine_equipment).toEqual('Excavator XYZ');
      expect(result.operator).toEqual('John Smith');
      expect(result.volume_liters).toEqual(50);
      expect(typeof result.volume_liters).toBe('number');
      expect(result.production_tonnage).toEqual(100);
      expect(typeof result.production_tonnage).toBe('number');
      expect(result.created_by).toEqual(userId);
      expect(result.production_record_id).toBeNull();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create fuel usage with production record reference', async () => {
      // Create production record first
      const productionRecord = await db.insert(productionRecordsTable)
        .values({
          date_time: new Date(),
          contractor_id: contractorId,
          truck_number: 'TRUCK-001',
          tonnage: '100',
          coal_grade: 'high',
          jetty_id: jettyId,
          operator_id: userId
        })
        .returning()
        .execute();

      const input = {
        ...testFuelUsageInput,
        production_record_id: productionRecord[0].id,
        created_by: userId
      };

      const result = await createFuelUsage(input);

      expect(result.production_record_id).toEqual(productionRecord[0].id);
    });

    it('should throw error for non-existent production record', async () => {
      const input = {
        ...testFuelUsageInput,
        production_record_id: 99999,
        created_by: userId
      };

      await expect(createFuelUsage(input)).rejects.toThrow(/production record not found/i);
    });

    it('should save fuel usage to database', async () => {
      const input = {
        ...testFuelUsageInput,
        created_by: userId
      };

      const result = await createFuelUsage(input);

      const saved = await db.select()
        .from(fuelUsageTable)
        .where(eq(fuelUsageTable.id, result.id))
        .execute();

      expect(saved).toHaveLength(1);
      expect(saved[0].machine_equipment).toEqual('Excavator XYZ');
      expect(parseFloat(saved[0].volume_liters)).toEqual(50);
      expect(parseFloat(saved[0].production_tonnage)).toEqual(100);
    });
  });

  describe('getFuelPurchases', () => {
    beforeEach(async () => {
      // Create test fuel purchases
      await db.insert(fuelPurchasesTable).values([
        {
          date: new Date('2024-01-15'),
          supplier: 'Supplier A',
          volume_liters: '1000',
          cost: '15000',
          invoice_number: 'INV-001',
          jetty_id: jettyId,
          created_by: userId
        },
        {
          date: new Date('2024-01-16'),
          supplier: 'Supplier B',
          volume_liters: '2000',
          cost: '30000',
          invoice_number: 'INV-002',
          jetty_id: jettyId,
          created_by: userId
        }
      ]).execute();
    });

    it('should get all fuel purchases with related data', async () => {
      const results = await getFuelPurchases();

      expect(results).toHaveLength(2);
      expect(results[0].supplier).toBeDefined();
      expect(results[0].jetty_name).toEqual('Test Jetty');
      expect(results[0].created_by_name).toEqual('Test Operator');
      expect(typeof results[0].volume_liters).toBe('number');
      expect(typeof results[0].cost).toBe('number');
    });

    it('should filter by date range', async () => {
      const results = await getFuelPurchases(
        new Date('2024-01-15'),
        new Date('2024-01-15')
      );

      expect(results).toHaveLength(1);
      expect(results[0].supplier).toEqual('Supplier A');
    });

    it('should filter by supplier', async () => {
      const results = await getFuelPurchases(undefined, undefined, undefined, 'Supplier B');

      expect(results).toHaveLength(1);
      expect(results[0].supplier).toEqual('Supplier B');
    });

    it('should filter by jetty', async () => {
      const results = await getFuelPurchases(undefined, undefined, jettyId);

      expect(results).toHaveLength(2);
    });

    it('should return empty array when no matches', async () => {
      const results = await getFuelPurchases(undefined, undefined, undefined, 'Non-existent');

      expect(results).toHaveLength(0);
    });
  });

  describe('getFuelUsage', () => {
    let productionRecordId: number;

    beforeEach(async () => {
      // Create production record
      const productionRecord = await db.insert(productionRecordsTable)
        .values({
          date_time: new Date(),
          contractor_id: contractorId,
          truck_number: 'TRUCK-001',
          tonnage: '100',
          coal_grade: 'high',
          jetty_id: jettyId,
          operator_id: userId
        })
        .returning()
        .execute();
      productionRecordId = productionRecord[0].id;

      // Create test fuel usage records
      await db.insert(fuelUsageTable).values([
        {
          date: new Date('2024-01-15'),
          machine_equipment: 'Excavator A',
          operator: 'Operator 1',
          volume_liters: '50',
          production_tonnage: '100',
          production_record_id: productionRecordId,
          created_by: userId
        },
        {
          date: new Date('2024-01-16'),
          machine_equipment: 'Excavator B',
          operator: 'Operator 2',
          volume_liters: '75',
          production_tonnage: '150',
          production_record_id: null,
          created_by: userId
        }
      ]).execute();
    });

    it('should get all fuel usage with related data', async () => {
      const results = await getFuelUsage();

      expect(results).toHaveLength(2);
      expect(results[0].created_by_name).toEqual('Test Operator');
      expect(typeof results[0].volume_liters).toBe('number');
      expect(typeof results[0].production_tonnage).toBe('number');
    });

    it('should include production record data when available', async () => {
      const results = await getFuelUsage();

      const withProductionRecord = results.find(r => r.production_record_id === productionRecordId);
      expect(withProductionRecord?.production_record).toBeDefined();
      expect(withProductionRecord?.production_record?.truck_number).toEqual('TRUCK-001');
      expect(withProductionRecord?.production_record?.contractor_name).toEqual('Test Contractor');

      const withoutProductionRecord = results.find(r => r.production_record_id === null);
      expect(withoutProductionRecord?.production_record).toBeUndefined();
    });

    it('should filter by date range', async () => {
      const results = await getFuelUsage(
        new Date('2024-01-15'),
        new Date('2024-01-15')
      );

      expect(results).toHaveLength(1);
      expect(results[0].machine_equipment).toEqual('Excavator A');
    });

    it('should filter by machine equipment', async () => {
      const results = await getFuelUsage(undefined, undefined, 'Excavator B');

      expect(results).toHaveLength(1);
      expect(results[0].machine_equipment).toEqual('Excavator B');
    });

    it('should filter by operator', async () => {
      const results = await getFuelUsage(undefined, undefined, undefined, 'Operator 1');

      expect(results).toHaveLength(1);
      expect(results[0].operator).toEqual('Operator 1');
    });
  });

  describe('getFuelPurchaseById', () => {
    it('should get fuel purchase by ID', async () => {
      const purchase = await db.insert(fuelPurchasesTable)
        .values({
          date: new Date('2024-01-15'),
          supplier: 'Test Supplier',
          volume_liters: '1000',
          cost: '15000',
          invoice_number: 'INV-001',
          jetty_id: jettyId,
          created_by: userId
        })
        .returning()
        .execute();

      const result = await getFuelPurchaseById(purchase[0].id);

      expect(result).not.toBeNull();
      expect(result!.supplier).toEqual('Test Supplier');
      expect(typeof result!.volume_liters).toBe('number');
      expect(typeof result!.cost).toBe('number');
    });

    it('should return null for non-existent ID', async () => {
      const result = await getFuelPurchaseById(99999);
      expect(result).toBeNull();
    });
  });

  describe('getFuelUsageById', () => {
    it('should get fuel usage by ID', async () => {
      const usage = await db.insert(fuelUsageTable)
        .values({
          date: new Date('2024-01-15'),
          machine_equipment: 'Excavator XYZ',
          operator: 'Test Operator',
          volume_liters: '50',
          production_tonnage: '100',
          created_by: userId
        })
        .returning()
        .execute();

      const result = await getFuelUsageById(usage[0].id);

      expect(result).not.toBeNull();
      expect(result!.machine_equipment).toEqual('Excavator XYZ');
      expect(typeof result!.volume_liters).toBe('number');
      expect(typeof result!.production_tonnage).toBe('number');
    });

    it('should return null for non-existent ID', async () => {
      const result = await getFuelUsageById(99999);
      expect(result).toBeNull();
    });
  });

  describe('getFuelSummary', () => {
    beforeEach(async () => {
      // Create test data for summary
      await db.insert(fuelPurchasesTable).values([
        {
          date: new Date('2024-01-15'),
          supplier: 'Supplier A',
          volume_liters: '1000',
          cost: '15000',
          invoice_number: 'INV-001',
          jetty_id: jettyId,
          created_by: userId
        },
        {
          date: new Date('2024-01-16'),
          supplier: 'Supplier A',
          volume_liters: '500',
          cost: '7500',
          invoice_number: 'INV-002',
          jetty_id: jettyId,
          created_by: userId
        },
        {
          date: new Date('2024-01-17'),
          supplier: 'Supplier B',
          volume_liters: '800',
          cost: '12000',
          invoice_number: 'INV-003',
          jetty_id: jettyId,
          created_by: userId
        }
      ]).execute();

      await db.insert(fuelUsageTable).values([
        {
          date: new Date('2024-01-15'),
          machine_equipment: 'Excavator A',
          operator: 'Operator 1',
          volume_liters: '50',
          production_tonnage: '100',
          created_by: userId
        },
        {
          date: new Date('2024-01-16'),
          machine_equipment: 'Excavator A',
          operator: 'Operator 1',
          volume_liters: '75',
          production_tonnage: '150',
          created_by: userId
        },
        {
          date: new Date('2024-01-17'),
          machine_equipment: 'Excavator B',
          operator: 'Operator 2',
          volume_liters: '60',
          production_tonnage: '120',
          created_by: userId
        }
      ]).execute();
    });

    it('should calculate comprehensive fuel summary', async () => {
      const summary = await getFuelSummary();

      expect(summary.total_purchased_liters).toEqual(2300); // 1000 + 500 + 800
      expect(summary.total_purchased_cost).toEqual(34500); // 15000 + 7500 + 12000
      expect(summary.total_used_liters).toEqual(185); // 50 + 75 + 60
      expect(summary.estimated_remaining_liters).toEqual(2115); // 2300 - 185

      // Check supplier grouping
      expect(summary.by_supplier).toHaveLength(2);
      const supplierA = summary.by_supplier.find(s => s.supplier === 'Supplier A');
      expect(supplierA?.volume_liters).toEqual(1500);
      expect(supplierA?.cost).toEqual(22500);

      // Check machine grouping
      expect(summary.by_machine).toHaveLength(2);
      const excavatorA = summary.by_machine.find(m => m.machine_equipment === 'Excavator A');
      expect(excavatorA?.volume_liters).toEqual(125);

      // Check efficiency ratio (liters per ton)
      expect(summary.efficiency_ratio).toEqual(0.5); // 185 liters / 370 tons
    });

    it('should filter summary by date range', async () => {
      const summary = await getFuelSummary(
        new Date('2024-01-15'),
        new Date('2024-01-16')
      );

      expect(summary.total_purchased_liters).toEqual(1500); // Only first two purchases
      expect(summary.total_used_liters).toEqual(125); // Only first two usage records
      expect(summary.by_supplier).toHaveLength(1); // Only Supplier A in range
    });

    it('should handle zero production tonnage', async () => {
      // Clear existing usage data
      await db.delete(fuelUsageTable).execute();

      const summary = await getFuelSummary();

      expect(summary.efficiency_ratio).toEqual(0);
    });

    it('should return empty summary when no data', async () => {
      // Clear all data
      await db.delete(fuelPurchasesTable).execute();
      await db.delete(fuelUsageTable).execute();

      const summary = await getFuelSummary();

      expect(summary.total_purchased_liters).toEqual(0);
      expect(summary.total_used_liters).toEqual(0);
      expect(summary.by_supplier).toHaveLength(0);
      expect(summary.by_machine).toHaveLength(0);
      expect(summary.efficiency_ratio).toEqual(0);
    });
  });
});