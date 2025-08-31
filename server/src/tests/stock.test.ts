import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  contractorsTable, 
  jettiesTable, 
  stockTable,
  stockAdjustmentsTable
} from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { 
  type CreateStockAdjustmentInput,
  type StockFilter
} from '../schema';
import {
  getStock,
  getStockByContractor,
  getStockByJetty,
  getTotalStock,
  createStockAdjustment,
  getStockAdjustments,
  approveStockAdjustment,
  updateStockFromProduction,
  updateStockFromBarging
} from '../handlers/stock';

describe('Stock Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data setup
  let testUser: any;
  let testContractor1: any;
  let testContractor2: any;
  let testJetty1: any;
  let testJetty2: any;
  let testStock1: any;
  let testStock2: any;

  const setupTestData = async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashed_password',
        full_name: 'Test User',
        role: 'admin'
      })
      .returning()
      .execute();
    testUser = users[0];

    // Create test contractors
    const contractors = await db.insert(contractorsTable)
      .values([
        {
          name: 'Contractor One',
          code: 'C001',
          contact_person: 'John Doe',
          contract_number: 'CNT001',
          default_grade: 'high'
        },
        {
          name: 'Contractor Two',
          code: 'C002',
          contact_person: 'Jane Smith',
          contract_number: 'CNT002',
          default_grade: 'medium'
        }
      ])
      .returning()
      .execute();
    [testContractor1, testContractor2] = contractors;

    // Create test jetties
    const jetties = await db.insert(jettiesTable)
      .values([
        {
          name: 'Jetty Alpha',
          code: 'JA',
          capacity: '10000.00'
        },
        {
          name: 'Jetty Beta',
          code: 'JB',
          capacity: '15000.00'
        }
      ])
      .returning()
      .execute();
    [testJetty1, testJetty2] = jetties;

    // Create test stock records
    const stocks = await db.insert(stockTable)
      .values([
        {
          contractor_id: testContractor1.id,
          jetty_id: testJetty1.id,
          tonnage: '1500.50'
        },
        {
          contractor_id: testContractor2.id,
          jetty_id: testJetty2.id,
          tonnage: '2000.75'
        }
      ])
      .returning()
      .execute();
    [testStock1, testStock2] = stocks;
  };

  describe('getStock', () => {
    it('should fetch all stock records with contractor and jetty details', async () => {
      await setupTestData();

      const result = await getStock();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        contractor_name: 'Contractor One',
        contractor_code: 'C001',
        jetty_name: 'Jetty Alpha',
        jetty_code: 'JA',
        tonnage: 1500.50
      });
      expect(typeof result[0].tonnage).toBe('number');
    });

    it('should filter stock by contractor_id', async () => {
      await setupTestData();

      const filter: StockFilter = { contractor_id: testContractor1.id };
      const result = await getStock(filter);

      expect(result).toHaveLength(1);
      expect(result[0].contractor_id).toBe(testContractor1.id);
      expect(result[0].contractor_name).toBe('Contractor One');
    });

    it('should filter stock by jetty_id', async () => {
      await setupTestData();

      const filter: StockFilter = { jetty_id: testJetty2.id };
      const result = await getStock(filter);

      expect(result).toHaveLength(1);
      expect(result[0].jetty_id).toBe(testJetty2.id);
      expect(result[0].jetty_name).toBe('Jetty Beta');
    });

    it('should filter stock by date range', async () => {
      await setupTestData();

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const filter: StockFilter = { 
        date_from: yesterday,
        date_to: tomorrow 
      };
      const result = await getStock(filter);

      expect(result).toHaveLength(2);
      result.forEach(stock => {
        expect(stock.last_updated >= yesterday).toBe(true);
        expect(stock.last_updated <= tomorrow).toBe(true);
      });
    });

    it('should only return active contractors and jetties', async () => {
      await setupTestData();

      // Deactivate contractor
      await db.update(contractorsTable)
        .set({ is_active: false })
        .where(eq(contractorsTable.id, testContractor1.id))
        .execute();

      const result = await getStock();

      expect(result).toHaveLength(1);
      expect(result[0].contractor_id).toBe(testContractor2.id);
    });
  });

  describe('getStockByContractor', () => {
    it('should group stock by contractor with jetty breakdown', async () => {
      await setupTestData();

      // Add more stock for same contractor at different jetty
      await db.insert(stockTable)
        .values({
          contractor_id: testContractor1.id,
          jetty_id: testJetty2.id,
          tonnage: '500.25'
        })
        .execute();

      const result = await getStockByContractor();

      expect(result).toHaveLength(2);

      const contractor1Data = result.find(c => c.contractor_id === testContractor1.id);
      expect(contractor1Data).toBeDefined();
      expect(contractor1Data!.contractor_name).toBe('Contractor One');
      expect(contractor1Data!.total_tonnage).toBe(2000.75); // 1500.50 + 500.25
      expect(contractor1Data!.jetties).toHaveLength(2);
    });

    it('should calculate total tonnage correctly', async () => {
      await setupTestData();

      const result = await getStockByContractor();

      const contractor1 = result.find(c => c.contractor_id === testContractor1.id);
      const contractor2 = result.find(c => c.contractor_id === testContractor2.id);

      expect(contractor1!.total_tonnage).toBe(1500.50);
      expect(contractor2!.total_tonnage).toBe(2000.75);
    });
  });

  describe('getStockByJetty', () => {
    it('should group stock by jetty with contractor breakdown', async () => {
      await setupTestData();

      // Add more stock for same jetty from different contractor
      await db.insert(stockTable)
        .values({
          contractor_id: testContractor2.id,
          jetty_id: testJetty1.id,
          tonnage: '750.00'
        })
        .execute();

      const result = await getStockByJetty();

      expect(result).toHaveLength(2);

      const jetty1Data = result.find(j => j.jetty_id === testJetty1.id);
      expect(jetty1Data).toBeDefined();
      expect(jetty1Data!.jetty_name).toBe('Jetty Alpha');
      expect(jetty1Data!.total_tonnage).toBe(2250.50); // 1500.50 + 750.00
      expect(jetty1Data!.contractors).toHaveLength(2);
    });
  });

  describe('getTotalStock', () => {
    it('should calculate overall stock statistics', async () => {
      await setupTestData();

      const result = await getTotalStock();

      expect(result.total_tonnage).toBe(3501.25); // 1500.50 + 2000.75
      expect(result.total_contractors).toBe(2);
      expect(result.total_jetties).toBe(2);
      expect(result.last_updated).toBeInstanceOf(Date);
    });

    it('should return zeros when no stock exists', async () => {
      const result = await getTotalStock();

      expect(result.total_tonnage).toBe(0);
      expect(result.total_contractors).toBe(0);
      expect(result.total_jetties).toBe(0);
    });
  });

  describe('createStockAdjustment', () => {
    it('should create stock adjustment and update stock', async () => {
      await setupTestData();

      const input: CreateStockAdjustmentInput = {
        stock_id: testStock1.id,
        adjustment_amount: 100.50,
        reason: 'manual_correction',
        reason_description: 'Correcting measurement error',
        reference_document: 'REF001',
        attachment: null,
        adjusted_by: testUser.id
      };

      const result = await createStockAdjustment(input);

      expect(result.stock_id).toBe(testStock1.id);
      expect(result.adjustment_amount).toBe(100.50);
      expect(result.previous_tonnage).toBe(1500.50);
      expect(result.new_tonnage).toBe(1601.00);
      expect(result.reason).toBe('manual_correction');

      // Verify stock was updated
      const updatedStock = await db.select()
        .from(stockTable)
        .where(eq(stockTable.id, testStock1.id))
        .execute();

      expect(parseFloat(updatedStock[0].tonnage)).toBe(1601.00);
      expect(updatedStock[0].version).toBe(testStock1.version + 1);
    });

    it('should prevent negative stock', async () => {
      await setupTestData();

      const input: CreateStockAdjustmentInput = {
        stock_id: testStock1.id,
        adjustment_amount: -2000.00, // More than current stock
        reason: 'waste',
        reason_description: 'Large spillage',
        reference_document: null,
        attachment: null,
        adjusted_by: testUser.id
      };

      expect(createStockAdjustment(input)).rejects.toThrow(/cannot be negative/i);
    });

    it('should increment version when creating adjustment', async () => {
      await setupTestData();

      const input: CreateStockAdjustmentInput = {
        stock_id: testStock1.id,
        adjustment_amount: 100.00,
        reason: 'manual_correction',
        reason_description: 'Version increment test',
        reference_document: null,
        attachment: null,
        adjusted_by: testUser.id
      };

      await createStockAdjustment(input);

      // Verify version was incremented
      const updatedStock = await db.select()
        .from(stockTable)
        .where(eq(stockTable.id, testStock1.id))
        .execute();

      expect(updatedStock[0].version).toBe(testStock1.version + 1);
    });

    it('should throw error for non-existent stock', async () => {
      await setupTestData();

      const input: CreateStockAdjustmentInput = {
        stock_id: 99999,
        adjustment_amount: 100.00,
        reason: 'manual_correction',
        reason_description: 'Test',
        reference_document: null,
        attachment: null,
        adjusted_by: testUser.id
      };

      expect(createStockAdjustment(input)).rejects.toThrow(/not found/i);
    });
  });

  describe('getStockAdjustments', () => {
    it('should fetch stock adjustments with related data', async () => {
      await setupTestData();

      // Create adjustment first
      const input: CreateStockAdjustmentInput = {
        stock_id: testStock1.id,
        adjustment_amount: 50.00,
        reason: 'spillage',
        reason_description: 'Minor spillage during handling',
        reference_document: 'REF001',
        attachment: null,
        adjusted_by: testUser.id
      };

      await createStockAdjustment(input);

      const result = await getStockAdjustments();

      expect(result).toHaveLength(1);
      expect(result[0].adjustment_amount).toBe(50.00);
      expect(result[0].adjusted_by_name).toBe('Test User');
      expect(result[0].contractor_name).toBe('Contractor One');
      expect(result[0].jetty_name).toBe('Jetty Alpha');
      expect(typeof result[0].adjustment_amount).toBe('number');
    });

    it('should filter adjustments by stock_id', async () => {
      await setupTestData();

      // Create adjustments for both stocks
      await createStockAdjustment({
        stock_id: testStock1.id,
        adjustment_amount: 50.00,
        reason: 'spillage',
        reason_description: 'Test 1',
        reference_document: null,
        attachment: null,
        adjusted_by: testUser.id
      });

      await createStockAdjustment({
        stock_id: testStock2.id,
        adjustment_amount: 75.00,
        reason: 'waste',
        reason_description: 'Test 2',
        reference_document: null,
        attachment: null,
        adjusted_by: testUser.id
      });

      const result = await getStockAdjustments(testStock1.id);

      expect(result).toHaveLength(1);
      expect(result[0].stock_id).toBe(testStock1.id);
    });

    it('should filter adjustments by date range', async () => {
      await setupTestData();

      await createStockAdjustment({
        stock_id: testStock1.id,
        adjustment_amount: 25.00,
        reason: 'measurement_error',
        reason_description: 'Date filter test',
        reference_document: null,
        attachment: null,
        adjusted_by: testUser.id
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const result = await getStockAdjustments(undefined, yesterday, tomorrow);

      expect(result).toHaveLength(1);
      expect(result[0].created_at >= yesterday).toBe(true);
      expect(result[0].created_at <= tomorrow).toBe(true);
    });
  });

  describe('approveStockAdjustment', () => {
    it('should approve pending stock adjustment', async () => {
      await setupTestData();

      // Create another user for approval
      const approver = await db.insert(usersTable)
        .values({
          email: 'approver@example.com',
          username: 'approver',
          password_hash: 'hashed_password',
          full_name: 'Approver User',
          role: 'admin'
        })
        .returning()
        .execute();

      // Create adjustment
      const adjustment = await createStockAdjustment({
        stock_id: testStock1.id,
        adjustment_amount: 100.00,
        reason: 'manual_correction',
        reason_description: 'Needs approval',
        reference_document: null,
        attachment: null,
        adjusted_by: testUser.id
      });

      const result = await approveStockAdjustment(adjustment.id, approver[0].id);

      expect(result.approved_by).toBe(approver[0].id);
      expect(result.approved_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent adjustment', async () => {
      await setupTestData();

      expect(approveStockAdjustment(99999, testUser.id))
        .rejects.toThrow(/not found/i);
    });

    it('should throw error for already approved adjustment', async () => {
      await setupTestData();

      // Create and approve adjustment
      const adjustment = await createStockAdjustment({
        stock_id: testStock1.id,
        adjustment_amount: 50.00,
        reason: 'manual_correction',
        reason_description: 'Test double approval',
        reference_document: null,
        attachment: null,
        adjusted_by: testUser.id
      });

      await approveStockAdjustment(adjustment.id, testUser.id);

      // Try to approve again
      expect(approveStockAdjustment(adjustment.id, testUser.id))
        .rejects.toThrow(/already approved/i);
    });
  });

  describe('updateStockFromProduction', () => {
    it('should create new stock record if none exists', async () => {
      await setupTestData();

      await updateStockFromProduction(testContractor1.id, testJetty2.id, 500.00);

      const newStock = await db.select()
        .from(stockTable)
        .where(and(
          eq(stockTable.contractor_id, testContractor1.id),
          eq(stockTable.jetty_id, testJetty2.id)
        ))
        .execute();

      expect(newStock).toHaveLength(1);
      expect(parseFloat(newStock[0].tonnage)).toBe(500.00);
      expect(newStock[0].version).toBe(1);
    });

    it('should update existing stock record', async () => {
      await setupTestData();

      await updateStockFromProduction(testContractor1.id, testJetty1.id, 250.50);

      const updatedStock = await db.select()
        .from(stockTable)
        .where(eq(stockTable.id, testStock1.id))
        .execute();

      expect(parseFloat(updatedStock[0].tonnage)).toBe(1751.00); // 1500.50 + 250.50
      expect(updatedStock[0].version).toBe(testStock1.version + 1);
    });

    it('should increment version when updating from production', async () => {
      await setupTestData();

      await updateStockFromProduction(testContractor1.id, testJetty1.id, 100.00);

      // Verify version was incremented
      const updatedStock = await db.select()
        .from(stockTable)
        .where(eq(stockTable.id, testStock1.id))
        .execute();

      expect(updatedStock[0].version).toBe(testStock1.version + 1);
    });
  });

  describe('updateStockFromBarging', () => {
    it('should reduce stock tonnage', async () => {
      await setupTestData();

      await updateStockFromBarging(testContractor1.id, testJetty1.id, 500.00);

      const updatedStock = await db.select()
        .from(stockTable)
        .where(eq(stockTable.id, testStock1.id))
        .execute();

      expect(parseFloat(updatedStock[0].tonnage)).toBe(1000.50); // 1500.50 - 500.00
      expect(updatedStock[0].version).toBe(testStock1.version + 1);
    });

    it('should throw error when insufficient stock', async () => {
      await setupTestData();

      expect(updateStockFromBarging(testContractor1.id, testJetty1.id, 2000.00))
        .rejects.toThrow(/insufficient stock/i);
    });

    it('should throw error when no stock record exists', async () => {
      await setupTestData();

      expect(updateStockFromBarging(testContractor2.id, testJetty1.id, 100.00))
        .rejects.toThrow(/no stock found/i);
    });

    it('should increment version when updating from barging', async () => {
      await setupTestData();

      await updateStockFromBarging(testContractor1.id, testJetty1.id, 100.00);

      // Verify version was incremented
      const updatedStock = await db.select()
        .from(stockTable)
        .where(eq(stockTable.id, testStock1.id))
        .execute();

      expect(updatedStock[0].version).toBe(testStock1.version + 1);
    });
  });
});