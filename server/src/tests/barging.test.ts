import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  contractorsTable, 
  jettiesTable, 
  stockTable,
  bargingRecordsTable 
} from '../db/schema';
import { type CreateBargingRecordInput } from '../schema';
import { createBargingRecord } from '../handlers/barging';
import { eq, and } from 'drizzle-orm';

describe('createBargingRecord', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data setup
  let testContractorId: number;
  let testJettyId: number;
  let testOperatorId: number;
  let testStockId: number;

  const setupTestData = async () => {
    // Create test user (operator)
    const userResult = await db.insert(usersTable)
      .values({
        email: 'operator@test.com',
        username: 'test_operator',
        password_hash: 'hashed_password',
        full_name: 'Test Operator',
        role: 'operator_barging',
        is_active: true
      })
      .returning()
      .execute();
    testOperatorId = userResult[0].id;

    // Create test contractor
    const contractorResult = await db.insert(contractorsTable)
      .values({
        name: 'Test Contractor',
        code: 'TC001',
        contact_person: 'John Doe',
        contract_number: 'CONTRACT-001',
        default_grade: 'high',
        is_active: true
      })
      .returning()
      .execute();
    testContractorId = contractorResult[0].id;

    // Create test jetty
    const jettyResult = await db.insert(jettiesTable)
      .values({
        name: 'Test Jetty',
        code: 'TJ001',
        capacity: '5000.00',
        is_active: true
      })
      .returning()
      .execute();
    testJettyId = jettyResult[0].id;

    // Create test stock record
    const stockResult = await db.insert(stockTable)
      .values({
        contractor_id: testContractorId,
        jetty_id: testJettyId,
        tonnage: '1000.00', // 1000 tons available
        version: 1
      })
      .returning()
      .execute();
    testStockId = stockResult[0].id;
  };

  const createValidInput = (): CreateBargingRecordInput => ({
    date_time: new Date('2024-01-15T10:30:00Z'),
    contractor_id: testContractorId,
    ship_batch_number: 'SHIP-001',
    tonnage: 500, // Request 500 tons
    jetty_id: testJettyId,
    buyer: 'Test Buyer Company',
    loading_document: 'LOAD-DOC-001',
    operator_id: testOperatorId,
    notes: 'Test barging operation'
  });

  it('should create a barging record successfully', async () => {
    await setupTestData();
    const input = createValidInput();

    const result = await createBargingRecord(input);

    // Verify barging record fields
    expect(result.id).toBeDefined();
    expect(result.date_time).toEqual(input.date_time);
    expect(result.contractor_id).toEqual(testContractorId);
    expect(result.ship_batch_number).toEqual('SHIP-001');
    expect(result.tonnage).toEqual(500);
    expect(result.jetty_id).toEqual(testJettyId);
    expect(result.buyer).toEqual('Test Buyer Company');
    expect(result.loading_document).toEqual('LOAD-DOC-001');
    expect(result.operator_id).toEqual(testOperatorId);
    expect(result.notes).toEqual('Test barging operation');
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);

    // Verify record was saved to database
    const savedRecord = await db.select()
      .from(bargingRecordsTable)
      .where(eq(bargingRecordsTable.id, result.id))
      .execute();

    expect(savedRecord).toHaveLength(1);
    expect(savedRecord[0].ship_batch_number).toEqual('SHIP-001');
    expect(parseFloat(savedRecord[0].tonnage)).toEqual(500);
  });

  it('should reduce stock after barging', async () => {
    await setupTestData();
    const input = createValidInput();

    await createBargingRecord(input);

    // Check stock was reduced
    const updatedStock = await db.select()
      .from(stockTable)
      .where(eq(stockTable.id, testStockId))
      .execute();

    expect(updatedStock).toHaveLength(1);
    expect(parseFloat(updatedStock[0].tonnage)).toEqual(500); // 1000 - 500 = 500
    expect(updatedStock[0].version).toEqual(2); // Version incremented
    expect(updatedStock[0].last_updated).toBeInstanceOf(Date);
  });

  it('should handle minimal required fields', async () => {
    await setupTestData();
    const input: CreateBargingRecordInput = {
      date_time: new Date('2024-01-15T10:30:00Z'),
      contractor_id: testContractorId,
      ship_batch_number: 'SHIP-002',
      tonnage: 300,
      jetty_id: testJettyId,
      buyer: null,
      loading_document: null,
      operator_id: testOperatorId,
      notes: null
    };

    const result = await createBargingRecord(input);

    expect(result.ship_batch_number).toEqual('SHIP-002');
    expect(result.tonnage).toEqual(300);
    expect(result.buyer).toBeNull();
    expect(result.loading_document).toBeNull();
    expect(result.notes).toBeNull();
  });

  it('should reject barging with non-existent contractor', async () => {
    await setupTestData();
    const input = createValidInput();
    input.contractor_id = 99999; // Non-existent contractor

    await expect(createBargingRecord(input)).rejects.toThrow(/contractor.*not found/i);
  });

  it('should reject barging with inactive contractor', async () => {
    await setupTestData();
    
    // Deactivate contractor
    await db.update(contractorsTable)
      .set({ is_active: false })
      .where(eq(contractorsTable.id, testContractorId))
      .execute();

    const input = createValidInput();

    await expect(createBargingRecord(input)).rejects.toThrow(/contractor.*inactive/i);
  });

  it('should reject barging with non-existent jetty', async () => {
    await setupTestData();
    const input = createValidInput();
    input.jetty_id = 99999; // Non-existent jetty

    await expect(createBargingRecord(input)).rejects.toThrow(/jetty.*not found/i);
  });

  it('should reject barging with inactive jetty', async () => {
    await setupTestData();
    
    // Deactivate jetty
    await db.update(jettiesTable)
      .set({ is_active: false })
      .where(eq(jettiesTable.id, testJettyId))
      .execute();

    const input = createValidInput();

    await expect(createBargingRecord(input)).rejects.toThrow(/jetty.*inactive/i);
  });

  it('should reject barging with non-existent operator', async () => {
    await setupTestData();
    const input = createValidInput();
    input.operator_id = 99999; // Non-existent operator

    await expect(createBargingRecord(input)).rejects.toThrow(/operator.*not found/i);
  });

  it('should reject barging with inactive operator', async () => {
    await setupTestData();
    
    // Deactivate operator
    await db.update(usersTable)
      .set({ is_active: false })
      .where(eq(usersTable.id, testOperatorId))
      .execute();

    const input = createValidInput();

    await expect(createBargingRecord(input)).rejects.toThrow(/operator.*inactive/i);
  });

  it('should reject barging with insufficient stock', async () => {
    await setupTestData();
    const input = createValidInput();
    input.tonnage = 1500; // More than available (1000 tons)

    await expect(createBargingRecord(input)).rejects.toThrow(/insufficient stock/i);
  });

  it('should reject barging with zero or negative tonnage', async () => {
    await setupTestData();
    
    const zeroTonnageInput = createValidInput();
    zeroTonnageInput.tonnage = 0;

    await expect(createBargingRecord(zeroTonnageInput)).rejects.toThrow(/tonnage must be positive/i);

    const negativeTonnageInput = createValidInput();
    negativeTonnageInput.tonnage = -100;

    await expect(createBargingRecord(negativeTonnageInput)).rejects.toThrow(/tonnage must be positive/i);
  });

  it('should reject barging when no stock exists for contractor-jetty combination', async () => {
    await setupTestData();
    
    // Create another jetty without stock
    const anotherJettyResult = await db.insert(jettiesTable)
      .values({
        name: 'Another Jetty',
        code: 'AJ001',
        capacity: '3000.00',
        is_active: true
      })
      .returning()
      .execute();

    const input = createValidInput();
    input.jetty_id = anotherJettyResult[0].id; // No stock for this jetty

    await expect(createBargingRecord(input)).rejects.toThrow(/no stock found/i);
  });

  it('should handle optimistic locking conflict', async () => {
    await setupTestData();
    const input = createValidInput();

    // Start the barging record creation to get the stock record
    // Then simulate concurrent modification before the update
    let stockModified = false;

    // Override the transaction to simulate race condition
    const originalCreateBargingRecord = createBargingRecord;
    
    // Create two separate barging operations that will conflict
    const input1 = createValidInput();
    input1.ship_batch_number = 'SHIP-CONFLICT-1';
    input1.tonnage = 600;

    const input2 = createValidInput();
    input2.ship_batch_number = 'SHIP-CONFLICT-2'; 
    input2.tonnage = 700;

    // Execute both operations simultaneously - one should fail due to optimistic locking
    const results = await Promise.allSettled([
      createBargingRecord(input1),
      createBargingRecord(input2)
    ]);

    // One should succeed, one should fail
    const successful = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(1);
    
    if (failed[0].status === 'rejected') {
      expect(failed[0].reason.message).toMatch(/stock was modified.*try again|insufficient stock/i);
    }
  });

  it('should handle exact stock amount barging', async () => {
    await setupTestData();
    const input = createValidInput();
    input.tonnage = 1000; // Exact available stock

    const result = await createBargingRecord(input);

    expect(result.tonnage).toEqual(1000);

    // Check stock is now zero
    const updatedStock = await db.select()
      .from(stockTable)
      .where(eq(stockTable.id, testStockId))
      .execute();

    expect(parseFloat(updatedStock[0].tonnage)).toEqual(0);
  });

  it('should handle multiple barging records properly', async () => {
    await setupTestData();
    
    // First barging: 400 tons
    const firstInput = createValidInput();
    firstInput.ship_batch_number = 'SHIP-001';
    firstInput.tonnage = 400;

    const firstResult = await createBargingRecord(firstInput);
    expect(firstResult.tonnage).toEqual(400);

    // Second barging: 300 tons
    const secondInput = createValidInput();
    secondInput.ship_batch_number = 'SHIP-002';
    secondInput.tonnage = 300;

    const secondResult = await createBargingRecord(secondInput);
    expect(secondResult.tonnage).toEqual(300);

    // Check final stock
    const finalStock = await db.select()
      .from(stockTable)
      .where(eq(stockTable.id, testStockId))
      .execute();

    expect(parseFloat(finalStock[0].tonnage)).toEqual(300); // 1000 - 400 - 300 = 300
    expect(finalStock[0].version).toEqual(3); // Two updates = version 3

    // Third barging should fail (only 300 tons left)
    const thirdInput = createValidInput();
    thirdInput.ship_batch_number = 'SHIP-003';
    thirdInput.tonnage = 400; // More than remaining

    await expect(createBargingRecord(thirdInput)).rejects.toThrow(/insufficient stock/i);
  });
});