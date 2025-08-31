import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { auditLogTable, usersTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { 
  createAuditLog, 
  getAuditLogs, 
  getAuditLogById, 
  getAuditLogsByRecord,
  getAuditSummary,
  exportAuditLogs
} from '../handlers/audit';
import type { AuditLogFilter } from '../schema';

// Test data
const testUser = {
  email: 'audit@example.com',
  username: 'auditor',
  password_hash: 'hashedpassword',
  full_name: 'Audit User',
  role: 'auditor' as const
};

const testUser2 = {
  email: 'admin@example.com',
  username: 'admin',
  password_hash: 'hashedpassword',
  full_name: 'Admin User',
  role: 'admin' as const
};

describe('audit handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let userId: number;
  let userId2: number;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([testUser, testUser2])
      .returning()
      .execute();
    
    userId = users[0].id;
    userId2 = users[1].id;
  });

  describe('createAuditLog', () => {
    it('should create an audit log entry', async () => {
      const oldValues = { name: 'Old Name', value: 100 };
      const newValues = { name: 'New Name', value: 200 };

      const result = await createAuditLog(
        userId,
        'UPDATE',
        'test_table',
        123,
        oldValues,
        newValues,
        '192.168.1.1',
        'Test User Agent'
      );

      expect(result.id).toBeDefined();
      expect(result.user_id).toEqual(userId);
      expect(result.action).toEqual('UPDATE');
      expect(result.table_name).toEqual('test_table');
      expect(result.record_id).toEqual(123);
      expect(result.old_values).toEqual(JSON.stringify(oldValues));
      expect(result.new_values).toEqual(JSON.stringify(newValues));
      expect(result.ip_address).toEqual('192.168.1.1');
      expect(result.user_agent).toEqual('Test User Agent');
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create audit log with minimal data', async () => {
      const result = await createAuditLog(
        userId,
        'CREATE',
        'minimal_table'
      );

      expect(result.id).toBeDefined();
      expect(result.user_id).toEqual(userId);
      expect(result.action).toEqual('CREATE');
      expect(result.table_name).toEqual('minimal_table');
      expect(result.record_id).toBeNull();
      expect(result.old_values).toBeNull();
      expect(result.new_values).toBeNull();
      expect(result.ip_address).toBeNull();
      expect(result.user_agent).toBeNull();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save audit log to database', async () => {
      const result = await createAuditLog(
        userId,
        'DELETE',
        'products',
        456
      );

      const saved = await db.select()
        .from(auditLogTable)
        .where(eq(auditLogTable.id, result.id))
        .execute();

      expect(saved).toHaveLength(1);
      expect(saved[0].user_id).toEqual(userId);
      expect(saved[0].action).toEqual('DELETE');
      expect(saved[0].table_name).toEqual('products');
      expect(saved[0].record_id).toEqual(456);
    });
  });

  describe('getAuditLogs', () => {
    beforeEach(async () => {
      // Create multiple audit log entries
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      // Create audit logs one by one to ensure they're created
      await createAuditLog(userId, 'CREATE', 'products', 1, null, { name: 'Product 1' });
      await createAuditLog(userId2, 'UPDATE', 'products', 1, { name: 'Product 1' }, { name: 'Product 1 Updated' });
      await createAuditLog(userId, 'DELETE', 'categories', 2);
      await createAuditLog(userId2, 'CREATE', 'users', 3, null, { name: 'New User' });

      // Create an older entry for date filtering
      await db.insert(auditLogTable).values({
        user_id: userId,
        action: 'OLD_ACTION',
        table_name: 'old_table',
        record_id: 999,
        created_at: yesterday
      });
    });

    it('should get all audit logs with user information', async () => {
      const results = await getAuditLogs();

      expect(results.length).toBeGreaterThanOrEqual(4);
      
      const firstResult = results[0]; // Should be ordered by created_at desc
      expect(firstResult.user_name).toBeDefined();
      expect(firstResult.user_email).toBeDefined();
      expect(firstResult.action).toBeDefined();
      expect(firstResult.table_name).toBeDefined();
      expect(firstResult.created_at).toBeInstanceOf(Date);
      
      // Verify user information is correct
      expect([testUser.full_name, testUser2.full_name]).toContain(firstResult.user_name);
      expect([testUser.email, testUser2.email]).toContain(firstResult.user_email);
    });

    it('should filter audit logs by user_id', async () => {
      const filter: AuditLogFilter = { user_id: userId };
      const results = await getAuditLogs(filter);

      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach(log => {
        expect(log.user_id).toEqual(userId);
      });
    });

    it('should filter audit logs by action', async () => {
      const filter: AuditLogFilter = { action: 'CREATE' };
      const results = await getAuditLogs(filter);

      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach(log => {
        expect(log.action).toEqual('CREATE');
      });
    });

    it('should filter audit logs by table_name', async () => {
      const filter: AuditLogFilter = { table_name: 'products' };
      const results = await getAuditLogs(filter);

      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach(log => {
        expect(log.table_name).toEqual('products');
      });
    });

    it('should filter audit logs by date range', async () => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      
      const filter: AuditLogFilter = { 
        date_from: startOfDay,
        date_to: endOfDay
      };
      
      const results = await getAuditLogs(filter);

      expect(results.length).toBeGreaterThanOrEqual(4);
      results.forEach(log => {
        expect(log.created_at.getTime()).toBeGreaterThanOrEqual(startOfDay.getTime());
        expect(log.created_at.getTime()).toBeLessThan(endOfDay.getTime());
      });
    });

    it('should filter with multiple conditions', async () => {
      const filter: AuditLogFilter = { 
        user_id: userId,
        table_name: 'products'
      };
      
      const results = await getAuditLogs(filter);

      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach(log => {
        expect(log.user_id).toEqual(userId);
        expect(log.table_name).toEqual('products');
      });
    });

    it('should order results by created_at descending', async () => {
      const results = await getAuditLogs();

      if (results.length > 1) {
        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].created_at.getTime()).toBeGreaterThanOrEqual(
            results[i].created_at.getTime()
          );
        }
      }
    });
  });

  describe('getAuditLogById', () => {
    it('should get audit log by id with user information', async () => {
      const createdLog = await createAuditLog(
        userId,
        'TEST_ACTION',
        'test_table',
        123,
        { old: 'data' },
        { new: 'data' }
      );

      const result = await getAuditLogById(createdLog.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(createdLog.id);
      expect(result!.user_id).toEqual(userId);
      expect(result!.action).toEqual('TEST_ACTION');
      expect(result!.table_name).toEqual('test_table');
      expect(result!.record_id).toEqual(123);
      expect(result!.user_name).toEqual(testUser.full_name);
      expect(result!.user_email).toEqual(testUser.email);
      expect(result!.old_values).toEqual(JSON.stringify({ old: 'data' }));
      expect(result!.new_values).toEqual(JSON.stringify({ new: 'data' }));
    });

    it('should return null for non-existent audit log', async () => {
      const result = await getAuditLogById(99999);

      expect(result).toBeNull();
    });
  });

  describe('getAuditLogsByRecord', () => {
    beforeEach(async () => {
      // Create audit trail for a specific record sequentially
      await createAuditLog(userId, 'CREATE', 'products', 100, null, { name: 'Product' });
      await createAuditLog(userId2, 'UPDATE', 'products', 100, { name: 'Product' }, { name: 'Updated Product' });
      await createAuditLog(userId, 'UPDATE', 'products', 100, { name: 'Updated Product' }, { name: 'Final Product' });
      // Different record for comparison
      await createAuditLog(userId, 'CREATE', 'products', 200, null, { name: 'Other Product' });
    });

    it('should get audit logs for specific record in chronological order', async () => {
      const results = await getAuditLogsByRecord('products', 100);

      expect(results.length).toEqual(3);
      
      // Should be in chronological order (ascending)
      expect(results[0].action).toEqual('CREATE');
      expect(results[1].action).toEqual('UPDATE');
      expect(results[2].action).toEqual('UPDATE');
      
      // Verify chronological ordering
      for (let i = 1; i < results.length; i++) {
        expect(results[i].created_at.getTime()).toBeGreaterThanOrEqual(
          results[i - 1].created_at.getTime()
        );
      }

      // All should be for the same record
      results.forEach(log => {
        expect(log.table_name).toEqual('products');
        expect(log.record_id).toEqual(100);
      });
    });

    it('should include user information', async () => {
      const results = await getAuditLogsByRecord('products', 100);

      results.forEach(log => {
        expect(log.user_name).toBeDefined();
        expect(log.user_email).toBeDefined();
        expect([testUser.full_name, testUser2.full_name]).toContain(log.user_name);
      });
    });

    it('should return empty array for non-existent record', async () => {
      const results = await getAuditLogsByRecord('products', 99999);

      expect(results).toHaveLength(0);
    });
  });

  describe('getAuditSummary', () => {
    beforeEach(async () => {
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      // Create varied audit logs sequentially
      await createAuditLog(userId, 'CREATE', 'products', 1);
      await createAuditLog(userId, 'CREATE', 'products', 2);
      await createAuditLog(userId2, 'UPDATE', 'products', 1);
      await createAuditLog(userId, 'DELETE', 'categories', 3);
      await createAuditLog(userId2, 'UPDATE', 'users', 4);
      await createAuditLog(userId2, 'CREATE', 'users', 5);

      // Create yesterday's entry
      await db.insert(auditLogTable).values({
        user_id: userId,
        action: 'OLD_CREATE',
        table_name: 'old_products',
        record_id: 999,
        created_at: yesterday
      });
    });

    it('should provide complete audit summary', async () => {
      const summary = await getAuditSummary();

      expect(summary.total_actions).toBeGreaterThanOrEqual(6);
      expect(summary.actions_by_type).toBeInstanceOf(Array);
      expect(summary.actions_by_user).toBeInstanceOf(Array);
      expect(summary.actions_by_table).toBeInstanceOf(Array);
      expect(summary.most_active_day).toBeDefined();
      expect(summary.most_active_day.date).toBeInstanceOf(Date);
      expect(summary.most_active_day.count).toBeGreaterThan(0);
    });

    it('should group actions by type correctly', async () => {
      const summary = await getAuditSummary();

      const createActions = summary.actions_by_type.find(a => a.action === 'CREATE');
      const updateActions = summary.actions_by_type.find(a => a.action === 'UPDATE');
      const deleteActions = summary.actions_by_type.find(a => a.action === 'DELETE');

      expect(createActions?.count).toBeGreaterThanOrEqual(3);
      expect(updateActions?.count).toBeGreaterThanOrEqual(2);
      expect(deleteActions?.count).toBeGreaterThanOrEqual(1);
    });

    it('should group actions by user correctly', async () => {
      const summary = await getAuditSummary();

      expect(summary.actions_by_user.length).toBeGreaterThanOrEqual(2);
      
      const user1Actions = summary.actions_by_user.find(u => u.user_id === userId);
      const user2Actions = summary.actions_by_user.find(u => u.user_id === userId2);

      expect(user1Actions).toBeDefined();
      expect(user2Actions).toBeDefined();
      expect(user1Actions!.user_name).toEqual(testUser.full_name);
      expect(user2Actions!.user_name).toEqual(testUser2.full_name);
    });

    it('should group actions by table correctly', async () => {
      const summary = await getAuditSummary();

      const productsActions = summary.actions_by_table.find(t => t.table_name === 'products');
      const usersActions = summary.actions_by_table.find(t => t.table_name === 'users');
      const categoriesActions = summary.actions_by_table.find(t => t.table_name === 'categories');

      expect(productsActions?.count).toBeGreaterThanOrEqual(3);
      expect(usersActions?.count).toBeGreaterThanOrEqual(2);
      expect(categoriesActions?.count).toBeGreaterThanOrEqual(1);
    });

    it('should filter summary by date range', async () => {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const summary = await getAuditSummary(startOfDay);

      // Should only include today's actions (6), not yesterday's (1)
      expect(summary.total_actions).toEqual(6);
    });
  });

  describe('exportAuditLogs', () => {
    beforeEach(async () => {
      await createAuditLog(userId, 'CREATE', 'products', 1, null, { name: 'Product 1' });
      await createAuditLog(userId2, 'UPDATE', 'products', 1, { name: 'Product 1' }, { name: 'Updated' });
    });

    it('should export audit logs as CSV', async () => {
      const result = await exportAuditLogs(undefined, 'csv');

      expect(result.content).toBeDefined();
      expect(result.filename).toMatch(/^audit_logs_\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.mimeType).toEqual('text/csv');

      // Check CSV structure
      const lines = result.content.split('\n');
      expect(lines[0]).toContain('ID,User ID,User Name'); // Header
      expect(lines.length).toBeGreaterThan(2); // Header + at least 2 data rows
    });

    it('should export audit logs as text for PDF format', async () => {
      const result = await exportAuditLogs(undefined, 'pdf');

      expect(result.content).toBeDefined();
      expect(result.filename).toMatch(/^audit_logs_\d{4}-\d{2}-\d{2}\.txt$/);
      expect(result.mimeType).toEqual('text/plain');

      // Check text structure
      expect(result.content).toContain('ID:');
      expect(result.content).toContain('User:');
      expect(result.content).toContain('Action:');
    });

    it('should apply filters when exporting', async () => {
      const filter: AuditLogFilter = { action: 'CREATE' };
      const result = await exportAuditLogs(filter, 'csv');

      const lines = result.content.split('\n');
      // Should only contain CREATE actions
      const dataLines = lines.slice(1); // Skip header
      dataLines.forEach(line => {
        if (line.trim()) { // Skip empty lines
          expect(line).toContain('"CREATE"');
        }
      });
    });

    it('should handle empty results', async () => {
      const filter: AuditLogFilter = { action: 'NON_EXISTENT' };
      const result = await exportAuditLogs(filter, 'csv');

      expect(result.content).toBeDefined();
      expect(result.filename).toMatch(/^audit_logs_\d{4}-\d{2}-\d{2}\.csv$/);
      
      const lines = result.content.split('\n');
      expect(lines[0]).toContain('ID,User ID,User Name'); // Header should exist
      expect(lines.length).toEqual(1); // Only header, no data
    });
  });
});