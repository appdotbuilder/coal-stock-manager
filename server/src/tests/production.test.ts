import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  contractorsTable, 
  jettiesTable, 
  usersTable, 
  productionRecordsTable,
  stockTable 
} from '../db/schema';
import { type CreateProductionRecordInput } from '../schema';
import { createProductionRecord } from '../handlers/production';
import { eq, and } from 'drizzle-orm';

describe('createProductionRecord', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test data
  const createTestData = async () => {
    // Create test contractor
    const contractorResult = await db.insert(contractorsTable)
      .values({
        name: 'Test Contractor',
        code: 'TC001',
        contact_person: 'John Doe',
        contract_number: 'CNT-2024-001',
        default_grade: 'high',
        is_active: true
      })
      .returning()
      .execute();

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

    // Create test operator
    const operatorResult = await db.insert(usersTable)
      .values({
        email: 'operator@test.com',
        username: 'testoperator',
        password_hash: 'hashed_password',
        full_name: 'Test Operator',
        role: 'operator_produksi',
        is_active: true
      })
      .returning()
      .execute();

    return {
      contractor: contractorResult[0],
      jetty: jettyResult[0],
      operator: operatorResult[0]
    };
  };

  const createTestInput = (contractorId: number, jettyId: number, operatorId: number): CreateProductionRecordInput => ({
    date_time: new Date('2024-01-15T10:30:00Z'),
    contractor_id: contractorId,
    truck_number: 'TRK-001',
    tonnage: 25.5,
    coal_grade: 'high',
    jetty_id: jettyId,
    document_photo: 'photo1.jpg',
    operator_id: operatorId,
    notes: 'Test production record'
  });

  it('should create a production record successfully', async () => {
    const { contractor, jetty, operator } = await createTestData();
    const input = createTestInput(contractor.id, jetty.id, operator.id);

    const result = await createProductionRecord(input);

    // Verify production record fields
    expect(result.id).toBeDefined();
    expect(result.date_time).toEqual(input.date_time);
    expect(result.contractor_id).toEqual(contractor.id);
    expect(result.truck_number).toEqual('TRK-001');
    expect(result.tonnage).toEqual(25.5);
    expect(typeof result.tonnage).toBe('number');
    expect(result.coal_grade).toEqual('high');
    expect(result.jetty_id).toEqual(jetty.id);
    expect(result.document_photo).toEqual('photo1.jpg');
    expect(result.operator_id).toEqual(operator.id);
    expect(result.notes).toEqual('Test production record');
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save production record to database', async () => {
    const { contractor, jetty, operator } = await createTestData();
    const input = createTestInput(contractor.id, jetty.id, operator.id);

    const result = await createProductionRecord(input);

    // Query database to verify record was saved
    const records = await db.select()
      .from(productionRecordsTable)
      .where(eq(productionRecordsTable.id, result.id))
      .execute();

    expect(records).toHaveLength(1);
    expect(records[0].truck_number).toEqual('TRK-001');
    expect(parseFloat(records[0].tonnage)).toEqual(25.5);
    expect(records[0].coal_grade).toEqual('high');
    expect(records[0].document_photo).toEqual('photo1.jpg');
    expect(records[0].notes).toEqual('Test production record');
  });

  it('should create new stock record when none exists', async () => {
    const { contractor, jetty, operator } = await createTestData();
    const input = createTestInput(contractor.id, jetty.id, operator.id);

    await createProductionRecord(input);

    // Verify stock record was created
    const stockRecords = await db.select()
      .from(stockTable)
      .where(and(
        eq(stockTable.contractor_id, contractor.id),
        eq(stockTable.jetty_id, jetty.id)
      ))
      .execute();

    expect(stockRecords).toHaveLength(1);
    expect(parseFloat(stockRecords[0].tonnage)).toEqual(25.5);
    expect(stockRecords[0].version).toEqual(1);
    expect(stockRecords[0].last_updated).toBeInstanceOf(Date);
  });

  it('should update existing stock record', async () => {
    const { contractor, jetty, operator } = await createTestData();

    // Create initial stock record
    await db.insert(stockTable)
      .values({
        contractor_id: contractor.id,
        jetty_id: jetty.id,
        tonnage: '50.0',
        version: 1
      })
      .execute();

    const input = createTestInput(contractor.id, jetty.id, operator.id);
    await createProductionRecord(input);

    // Verify stock was updated
    const stockRecords = await db.select()
      .from(stockTable)
      .where(and(
        eq(stockTable.contractor_id, contractor.id),
        eq(stockTable.jetty_id, jetty.id)
      ))
      .execute();

    expect(stockRecords).toHaveLength(1);
    expect(parseFloat(stockRecords[0].tonnage)).toEqual(75.5); // 50.0 + 25.5
    expect(stockRecords[0].version).toEqual(2); // Incremented for optimistic locking
  });

  it('should handle multiple production records for same contractor-jetty', async () => {
    const { contractor, jetty, operator } = await createTestData();
    
    // Create first production record
    const input1 = createTestInput(contractor.id, jetty.id, operator.id);
    input1.tonnage = 20.0;
    input1.truck_number = 'TRK-001';
    
    await createProductionRecord(input1);

    // Create second production record
    const input2 = createTestInput(contractor.id, jetty.id, operator.id);
    input2.tonnage = 30.5;
    input2.truck_number = 'TRK-002';
    
    await createProductionRecord(input2);

    // Verify both production records exist
    const productionRecords = await db.select()
      .from(productionRecordsTable)
      .where(and(
        eq(productionRecordsTable.contractor_id, contractor.id),
        eq(productionRecordsTable.jetty_id, jetty.id)
      ))
      .execute();

    expect(productionRecords).toHaveLength(2);

    // Verify stock is cumulative
    const stockRecords = await db.select()
      .from(stockTable)
      .where(and(
        eq(stockTable.contractor_id, contractor.id),
        eq(stockTable.jetty_id, jetty.id)
      ))
      .execute();

    expect(stockRecords).toHaveLength(1);
    expect(parseFloat(stockRecords[0].tonnage)).toEqual(50.5); // 20.0 + 30.5
    expect(stockRecords[0].version).toEqual(2); // Updated twice
  });

  it('should throw error for non-existent contractor', async () => {
    const { jetty, operator } = await createTestData();
    const input = createTestInput(999, jetty.id, operator.id); // Non-existent contractor

    await expect(createProductionRecord(input))
      .rejects
      .toThrow(/contractor not found or inactive/i);
  });

  it('should throw error for inactive contractor', async () => {
    const { jetty, operator } = await createTestData();
    
    // Create inactive contractor
    const inactiveContractorResult = await db.insert(contractorsTable)
      .values({
        name: 'Inactive Contractor',
        code: 'IC001',
        contact_person: 'Jane Doe',
        contract_number: 'CNT-2024-002',
        default_grade: 'medium',
        is_active: false
      })
      .returning()
      .execute();

    const input = createTestInput(inactiveContractorResult[0].id, jetty.id, operator.id);

    await expect(createProductionRecord(input))
      .rejects
      .toThrow(/contractor not found or inactive/i);
  });

  it('should throw error for non-existent jetty', async () => {
    const { contractor, operator } = await createTestData();
    const input = createTestInput(contractor.id, 999, operator.id); // Non-existent jetty

    await expect(createProductionRecord(input))
      .rejects
      .toThrow(/jetty not found or inactive/i);
  });

  it('should throw error for inactive jetty', async () => {
    const { contractor, operator } = await createTestData();
    
    // Create inactive jetty
    const inactiveJettyResult = await db.insert(jettiesTable)
      .values({
        name: 'Inactive Jetty',
        code: 'IJ001',
        capacity: '3000.00',
        is_active: false
      })
      .returning()
      .execute();

    const input = createTestInput(contractor.id, inactiveJettyResult[0].id, operator.id);

    await expect(createProductionRecord(input))
      .rejects
      .toThrow(/jetty not found or inactive/i);
  });

  it('should throw error for non-existent operator', async () => {
    const { contractor, jetty } = await createTestData();
    const input = createTestInput(contractor.id, jetty.id, 999); // Non-existent operator

    await expect(createProductionRecord(input))
      .rejects
      .toThrow(/operator not found or inactive/i);
  });

  it('should throw error for inactive operator', async () => {
    const { contractor, jetty } = await createTestData();
    
    // Create inactive operator
    const inactiveOperatorResult = await db.insert(usersTable)
      .values({
        email: 'inactive@test.com',
        username: 'inactiveoperator',
        password_hash: 'hashed_password',
        full_name: 'Inactive Operator',
        role: 'operator_produksi',
        is_active: false
      })
      .returning()
      .execute();

    const input = createTestInput(contractor.id, jetty.id, inactiveOperatorResult[0].id);

    await expect(createProductionRecord(input))
      .rejects
      .toThrow(/operator not found or inactive/i);
  });

  it('should handle production record with optional fields as null', async () => {
    const { contractor, jetty, operator } = await createTestData();
    
    const input: CreateProductionRecordInput = {
      date_time: new Date('2024-01-15T10:30:00Z'),
      contractor_id: contractor.id,
      truck_number: 'TRK-003',
      tonnage: 15.0,
      coal_grade: 'low',
      jetty_id: jetty.id,
      document_photo: null,
      operator_id: operator.id,
      notes: null
    };

    const result = await createProductionRecord(input);

    expect(result.document_photo).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.tonnage).toEqual(15.0);
    expect(typeof result.tonnage).toBe('number');
  });

  it('should verify numeric conversion for tonnage', async () => {
    const { contractor, jetty, operator } = await createTestData();
    const input = createTestInput(contractor.id, jetty.id, operator.id);
    input.tonnage = 42.75;

    const result = await createProductionRecord(input);

    // Verify returned tonnage is a number
    expect(typeof result.tonnage).toBe('number');
    expect(result.tonnage).toEqual(42.75);

    // Verify database stores as string (numeric column)
    const dbRecord = await db.select()
      .from(productionRecordsTable)
      .where(eq(productionRecordsTable.id, result.id))
      .execute();

    expect(typeof dbRecord[0].tonnage).toBe('string');
    expect(parseFloat(dbRecord[0].tonnage)).toEqual(42.75);
  });
});