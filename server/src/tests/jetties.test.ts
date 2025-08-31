import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { jettiesTable } from '../db/schema';
import { type CreateJettyInput, type UpdateJettyInput } from '../schema';
import { 
  createJetty, 
  getJetties, 
  getActiveJetties, 
  getJettyById, 
  updateJetty 
} from '../handlers/jetties';
import { eq } from 'drizzle-orm';

// Test input data
const testJettyInput: CreateJettyInput = {
  name: 'Main Jetty',
  code: 'MJ001',
  capacity: 5000.50
};

const secondJettyInput: CreateJettyInput = {
  name: 'Secondary Jetty',
  code: 'SJ002',
  capacity: 3000.75
};

describe('jetties handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createJetty', () => {
    it('should create a jetty with correct data', async () => {
      const result = await createJetty(testJettyInput);

      expect(result.name).toEqual('Main Jetty');
      expect(result.code).toEqual('MJ001');
      expect(result.capacity).toEqual(5000.50);
      expect(typeof result.capacity).toEqual('number');
      expect(result.is_active).toEqual(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save jetty to database', async () => {
      const result = await createJetty(testJettyInput);

      const jetties = await db.select()
        .from(jettiesTable)
        .where(eq(jettiesTable.id, result.id))
        .execute();

      expect(jetties).toHaveLength(1);
      expect(jetties[0].name).toEqual('Main Jetty');
      expect(jetties[0].code).toEqual('MJ001');
      expect(parseFloat(jetties[0].capacity)).toEqual(5000.50);
      expect(jetties[0].is_active).toEqual(true);
      expect(jetties[0].created_at).toBeInstanceOf(Date);
    });

    it('should handle duplicate code error', async () => {
      await createJetty(testJettyInput);

      const duplicateInput: CreateJettyInput = {
        name: 'Another Jetty',
        code: 'MJ001', // Same code
        capacity: 2000
      };

      await expect(createJetty(duplicateInput)).rejects.toThrow(/duplicate key/i);
    });

    it('should handle large capacity values', async () => {
      const largeCapacityInput: CreateJettyInput = {
        name: 'Large Jetty',
        code: 'LG001',
        capacity: 999999.99
      };

      const result = await createJetty(largeCapacityInput);

      expect(result.capacity).toEqual(999999.99);
      expect(typeof result.capacity).toEqual('number');
    });
  });

  describe('getJetties', () => {
    it('should return empty array when no jetties exist', async () => {
      const result = await getJetties();

      expect(result).toEqual([]);
    });

    it('should return all jetties ordered by name', async () => {
      await createJetty(secondJettyInput); // Secondary Jetty
      await createJetty(testJettyInput); // Main Jetty

      const result = await getJetties();

      expect(result).toHaveLength(2);
      expect(result[0].name).toEqual('Main Jetty'); // Alphabetically first
      expect(result[1].name).toEqual('Secondary Jetty');
      
      // Verify numeric conversion
      expect(typeof result[0].capacity).toEqual('number');
      expect(typeof result[1].capacity).toEqual('number');
      expect(result[0].capacity).toEqual(5000.50);
      expect(result[1].capacity).toEqual(3000.75);
    });

    it('should include both active and inactive jetties', async () => {
      const jetty1 = await createJetty(testJettyInput);
      const jetty2 = await createJetty(secondJettyInput);

      // Update one jetty to be inactive
      await updateJetty({
        id: jetty2.id,
        is_active: false
      });

      const result = await getJetties();

      expect(result).toHaveLength(2);
      expect(result.find(j => j.id === jetty1.id)?.is_active).toEqual(true);
      expect(result.find(j => j.id === jetty2.id)?.is_active).toEqual(false);
    });
  });

  describe('getActiveJetties', () => {
    it('should return empty array when no active jetties exist', async () => {
      const result = await getActiveJetties();

      expect(result).toEqual([]);
    });

    it('should return only active jetties', async () => {
      const jetty1 = await createJetty(testJettyInput);
      const jetty2 = await createJetty(secondJettyInput);

      // Update one jetty to be inactive
      await updateJetty({
        id: jetty2.id,
        is_active: false
      });

      const result = await getActiveJetties();

      expect(result).toHaveLength(1);
      expect(result[0].id).toEqual(jetty1.id);
      expect(result[0].is_active).toEqual(true);
      expect(typeof result[0].capacity).toEqual('number');
    });

    it('should order active jetties by name', async () => {
      await createJetty(secondJettyInput); // Secondary Jetty
      await createJetty(testJettyInput); // Main Jetty

      const result = await getActiveJetties();

      expect(result).toHaveLength(2);
      expect(result[0].name).toEqual('Main Jetty'); // Alphabetically first
      expect(result[1].name).toEqual('Secondary Jetty');
    });
  });

  describe('getJettyById', () => {
    it('should return null when jetty does not exist', async () => {
      const result = await getJettyById(999);

      expect(result).toBeNull();
    });

    it('should return jetty when it exists', async () => {
      const created = await createJetty(testJettyInput);

      const result = await getJettyById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('Main Jetty');
      expect(result!.code).toEqual('MJ001');
      expect(result!.capacity).toEqual(5000.50);
      expect(typeof result!.capacity).toEqual('number');
      expect(result!.is_active).toEqual(true);
    });

    it('should return inactive jetty when it exists', async () => {
      const created = await createJetty(testJettyInput);
      
      // Update to inactive
      await updateJetty({
        id: created.id,
        is_active: false
      });

      const result = await getJettyById(created.id);

      expect(result).not.toBeNull();
      expect(result!.is_active).toEqual(false);
    });
  });

  describe('updateJetty', () => {
    it('should throw error when jetty does not exist', async () => {
      const updateInput: UpdateJettyInput = {
        id: 999,
        name: 'Updated Name'
      };

      await expect(updateJetty(updateInput)).rejects.toThrow(/not found/i);
    });

    it('should update jetty name only', async () => {
      const created = await createJetty(testJettyInput);

      const updateInput: UpdateJettyInput = {
        id: created.id,
        name: 'Updated Jetty Name'
      };

      const result = await updateJetty(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.name).toEqual('Updated Jetty Name');
      expect(result.code).toEqual('MJ001'); // Unchanged
      expect(result.capacity).toEqual(5000.50); // Unchanged
      expect(result.is_active).toEqual(true); // Unchanged
      expect(result.updated_at.getTime()).toBeGreaterThan(created.updated_at.getTime());
    });

    it('should update multiple fields', async () => {
      const created = await createJetty(testJettyInput);

      const updateInput: UpdateJettyInput = {
        id: created.id,
        name: 'Updated Name',
        code: 'UPD001',
        capacity: 7500.25,
        is_active: false
      };

      const result = await updateJetty(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.name).toEqual('Updated Name');
      expect(result.code).toEqual('UPD001');
      expect(result.capacity).toEqual(7500.25);
      expect(typeof result.capacity).toEqual('number');
      expect(result.is_active).toEqual(false);
      expect(result.updated_at.getTime()).toBeGreaterThan(created.updated_at.getTime());
    });

    it('should save updates to database', async () => {
      const created = await createJetty(testJettyInput);

      const updateInput: UpdateJettyInput = {
        id: created.id,
        name: 'Updated Name',
        capacity: 8000.75
      };

      await updateJetty(updateInput);

      const jetties = await db.select()
        .from(jettiesTable)
        .where(eq(jettiesTable.id, created.id))
        .execute();

      expect(jetties).toHaveLength(1);
      expect(jetties[0].name).toEqual('Updated Name');
      expect(parseFloat(jetties[0].capacity)).toEqual(8000.75);
      expect(jetties[0].updated_at.getTime()).toBeGreaterThan(created.updated_at.getTime());
    });

    it('should handle duplicate code error on update', async () => {
      const jetty1 = await createJetty(testJettyInput);
      const jetty2 = await createJetty(secondJettyInput);

      const updateInput: UpdateJettyInput = {
        id: jetty2.id,
        code: 'MJ001' // Same code as jetty1
      };

      await expect(updateJetty(updateInput)).rejects.toThrow(/duplicate key/i);
    });

    it('should update only specified fields', async () => {
      const created = await createJetty(testJettyInput);

      const updateInput: UpdateJettyInput = {
        id: created.id,
        capacity: 6000.25
      };

      const result = await updateJetty(updateInput);

      expect(result.name).toEqual('Main Jetty'); // Unchanged
      expect(result.code).toEqual('MJ001'); // Unchanged
      expect(result.capacity).toEqual(6000.25); // Updated
      expect(result.is_active).toEqual(true); // Unchanged
    });
  });
});