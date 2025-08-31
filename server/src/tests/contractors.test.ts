import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { contractorsTable, stockTable, usersTable, jettiesTable, auditLogTable } from '../db/schema';
import { 
  type CreateContractorInput, 
  type UpdateContractorInput 
} from '../schema';
import { 
  createContractor, 
  getContractors, 
  getContractorById, 
  updateContractor, 
  deleteContractor 
} from '../handlers/contractors';
import { eq } from 'drizzle-orm';

// Test data
const testContractorInput: CreateContractorInput = {
  name: 'Test Contractor Ltd',
  code: 'TC001',
  contact_person: 'John Doe',
  contract_number: 'CONTRACT-2024-001',
  default_grade: 'medium'
};

const testContractorInput2: CreateContractorInput = {
  name: 'Another Contractor',
  code: 'AC002',
  contact_person: 'Jane Smith',
  contract_number: null,
  default_grade: 'high'
};

describe('Contractors Handler', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createContractor', () => {
    it('should create a contractor with all fields', async () => {
      const result = await createContractor(testContractorInput);

      expect(result.name).toEqual('Test Contractor Ltd');
      expect(result.code).toEqual('TC001');
      expect(result.contact_person).toEqual('John Doe');
      expect(result.contract_number).toEqual('CONTRACT-2024-001');
      expect(result.default_grade).toEqual('medium');
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.deleted_at).toBeNull();
    });

    it('should create a contractor with null contract_number', async () => {
      const result = await createContractor(testContractorInput2);

      expect(result.name).toEqual('Another Contractor');
      expect(result.contract_number).toBeNull();
      expect(result.default_grade).toEqual('high');
    });

    it('should save contractor to database', async () => {
      const result = await createContractor(testContractorInput);

      const contractors = await db.select()
        .from(contractorsTable)
        .where(eq(contractorsTable.id, result.id))
        .execute();

      expect(contractors).toHaveLength(1);
      expect(contractors[0].name).toEqual('Test Contractor Ltd');
      expect(contractors[0].code).toEqual('TC001');
      expect(contractors[0].is_active).toBe(true);
    });

    it('should throw error for duplicate code', async () => {
      await createContractor(testContractorInput);

      const duplicateInput: CreateContractorInput = {
        ...testContractorInput,
        name: 'Different Name'
      };

      await expect(createContractor(duplicateInput))
        .rejects.toThrow(/already exists/i);
    });
  });

  describe('getContractors', () => {
    it('should return empty array when no contractors exist', async () => {
      const result = await getContractors();
      expect(result).toEqual([]);
    });

    it('should return all active contractors', async () => {
      await createContractor(testContractorInput);
      await createContractor(testContractorInput2);

      const result = await getContractors();

      expect(result).toHaveLength(2);
      expect(result[0].name).toEqual('Another Contractor'); // Most recent first
      expect(result[1].name).toEqual('Test Contractor Ltd');
    });

    it('should exclude soft-deleted contractors', async () => {
      const contractor1 = await createContractor(testContractorInput);
      await createContractor(testContractorInput2);

      // Create a user for deletion audit
      const testUser = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          username: 'testuser',
          password_hash: 'hashed',
          full_name: 'Test User',
          role: 'admin'
        })
        .returning()
        .execute();

      // Soft delete first contractor
      await deleteContractor(contractor1.id, testUser[0].id);

      const result = await getContractors();

      expect(result).toHaveLength(1);
      expect(result[0].name).toEqual('Another Contractor');
    });
  });

  describe('getContractorById', () => {
    it('should return null for non-existent contractor', async () => {
      const result = await getContractorById(999);
      expect(result).toBeNull();
    });

    it('should return contractor by ID', async () => {
      const created = await createContractor(testContractorInput);
      const result = await getContractorById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('Test Contractor Ltd');
      expect(result!.code).toEqual('TC001');
    });

    it('should return null for soft-deleted contractor', async () => {
      const contractor = await createContractor(testContractorInput);

      // Create user for audit log
      const testUser = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          username: 'testuser',
          password_hash: 'hashed',
          full_name: 'Test User',
          role: 'admin'
        })
        .returning()
        .execute();

      await deleteContractor(contractor.id, testUser[0].id);

      const result = await getContractorById(contractor.id);
      expect(result).toBeNull();
    });
  });

  describe('updateContractor', () => {
    it('should update contractor fields', async () => {
      const contractor = await createContractor(testContractorInput);

      const updateInput: UpdateContractorInput = {
        id: contractor.id,
        name: 'Updated Contractor Name',
        contact_person: 'Updated Contact',
        default_grade: 'high'
      };

      const result = await updateContractor(updateInput);

      expect(result.name).toEqual('Updated Contractor Name');
      expect(result.contact_person).toEqual('Updated Contact');
      expect(result.default_grade).toEqual('high');
      expect(result.code).toEqual('TC001'); // Unchanged
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should update is_active status', async () => {
      const contractor = await createContractor(testContractorInput);

      const updateInput: UpdateContractorInput = {
        id: contractor.id,
        is_active: false
      };

      const result = await updateContractor(updateInput);

      expect(result.is_active).toBe(false);
      expect(result.name).toEqual(contractor.name); // Other fields unchanged
    });

    it('should update code if unique', async () => {
      const contractor = await createContractor(testContractorInput);

      const updateInput: UpdateContractorInput = {
        id: contractor.id,
        code: 'NEW001'
      };

      const result = await updateContractor(updateInput);

      expect(result.code).toEqual('NEW001');
    });

    it('should throw error for non-existent contractor', async () => {
      const updateInput: UpdateContractorInput = {
        id: 999,
        name: 'Updated Name'
      };

      await expect(updateContractor(updateInput))
        .rejects.toThrow(/not found/i);
    });

    it('should throw error for duplicate code', async () => {
      const contractor1 = await createContractor(testContractorInput);
      const contractor2 = await createContractor(testContractorInput2);

      const updateInput: UpdateContractorInput = {
        id: contractor1.id,
        code: contractor2.code // Try to use existing code
      };

      await expect(updateContractor(updateInput))
        .rejects.toThrow(/already exists/i);
    });
  });

  describe('deleteContractor', () => {
    let testUserId: number;

    beforeEach(async () => {
      // Create a test user for audit logging
      const testUser = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          username: 'testuser',
          password_hash: 'hashed',
          full_name: 'Test User',
          role: 'admin'
        })
        .returning()
        .execute();

      testUserId = testUser[0].id;
    });

    it('should soft delete contractor successfully', async () => {
      const contractor = await createContractor(testContractorInput);

      const result = await deleteContractor(contractor.id, testUserId);

      expect(result).toBe(true);

      // Verify soft delete
      const deletedContractor = await db.select()
        .from(contractorsTable)
        .where(eq(contractorsTable.id, contractor.id))
        .execute();

      expect(deletedContractor[0].deleted_at).toBeInstanceOf(Date);
    });

    it('should create audit log entry', async () => {
      const contractor = await createContractor(testContractorInput);

      await deleteContractor(contractor.id, testUserId);

      const auditEntries = await db.select()
        .from(auditLogTable)
        .where(eq(auditLogTable.record_id, contractor.id))
        .execute();

      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].action).toEqual('DELETE');
      expect(auditEntries[0].table_name).toEqual('contractors');
      expect(auditEntries[0].user_id).toEqual(testUserId);
    });

    it('should throw error for non-existent contractor', async () => {
      await expect(deleteContractor(999, testUserId))
        .rejects.toThrow(/not found/i);
    });

    it('should throw error when contractor has active stock', async () => {
      const contractor = await createContractor(testContractorInput);

      // Create a jetty for the stock
      const jetty = await db.insert(jettiesTable)
        .values({
          name: 'Test Jetty',
          code: 'TJ001',
          capacity: '1000.00'
        })
        .returning()
        .execute();

      // Create stock for the contractor
      await db.insert(stockTable)
        .values({
          contractor_id: contractor.id,
          jetty_id: jetty[0].id,
          tonnage: '100.50' // Active stock
        })
        .execute();

      await expect(deleteContractor(contractor.id, testUserId))
        .rejects.toThrow(/active stock/i);
    });

    it('should allow deletion when contractor has zero stock', async () => {
      const contractor = await createContractor(testContractorInput);

      // Create a jetty for the stock
      const jetty = await db.insert(jettiesTable)
        .values({
          name: 'Test Jetty',
          code: 'TJ001',
          capacity: '1000.00'
        })
        .returning()
        .execute();

      // Create zero stock for the contractor
      await db.insert(stockTable)
        .values({
          contractor_id: contractor.id,
          jetty_id: jetty[0].id,
          tonnage: '0.00' // Zero stock
        })
        .execute();

      const result = await deleteContractor(contractor.id, testUserId);
      expect(result).toBe(true);
    });
  });
});