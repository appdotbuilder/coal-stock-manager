import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, auditLogTable } from '../db/schema';
import { type CreateUserInput, type UserRole } from '../schema';
import { 
  createUser, 
  getUsers, 
  getUserById, 
  getUserByEmail, 
  updateUser, 
  updateUserPassword, 
  deactivateUser, 
  getUsersByRole, 
  updateLastLogin 
} from '../handlers/users';
import { eq, and } from 'drizzle-orm';
// Using Bun's built-in password verification
const compare = async (password: string, hash: string): Promise<boolean> => {
  return await Bun.password.verify(password, hash);
};

// Test input data
const testUserInput: CreateUserInput = {
  email: 'john.doe@example.com',
  username: 'johndoe',
  password: 'password123',
  full_name: 'John Doe',
  role: 'operator_produksi'
};

const adminUserInput: CreateUserInput = {
  email: 'admin@example.com',
  username: 'admin',
  password: 'admin123',
  full_name: 'System Admin',
  role: 'admin'
};

describe('User Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      const result = await createUser(testUserInput);

      expect(result.email).toEqual(testUserInput.email);
      expect(result.username).toEqual(testUserInput.username);
      expect(result.full_name).toEqual(testUserInput.full_name);
      expect(result.role).toEqual(testUserInput.role);
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.password_hash).toBe(''); // Should be excluded for security
    });

    it('should hash the password correctly', async () => {
      await createUser(testUserInput);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.email, testUserInput.email))
        .execute();

      expect(users).toHaveLength(1);
      const user = users[0];
      
      // Password should be hashed, not plain text
      expect(user.password_hash).not.toEqual(testUserInput.password);
      expect(user.password_hash).toBeTruthy();
      
      // Verify password can be validated
      const isValid = await compare(testUserInput.password, user.password_hash);
      expect(isValid).toBe(true);
    });

    it('should create audit log entry', async () => {
      const result = await createUser(testUserInput);

      const auditLogs = await db.select()
        .from(auditLogTable)
        .where(
          and(
            eq(auditLogTable.action, 'CREATE_USER'),
            eq(auditLogTable.record_id, result.id)
          )
        )
        .execute();

      expect(auditLogs).toHaveLength(1);
      const auditLog = auditLogs[0];
      expect(auditLog.table_name).toBe('users');
      expect(auditLog.user_id).toBe(result.id);
    });

    it('should reject duplicate email', async () => {
      await createUser(testUserInput);

      const duplicateInput = { ...testUserInput, username: 'different' };
      
      expect(createUser(duplicateInput)).rejects.toThrow(/email already exists/i);
    });

    it('should reject duplicate username', async () => {
      await createUser(testUserInput);

      const duplicateInput = { ...testUserInput, email: 'different@example.com' };
      
      expect(createUser(duplicateInput)).rejects.toThrow(/username already exists/i);
    });
  });

  describe('getUsers', () => {
    it('should return empty array when no users exist', async () => {
      const result = await getUsers();
      expect(result).toEqual([]);
    });

    it('should return all users without password hashes', async () => {
      await createUser(testUserInput);
      await createUser(adminUserInput);

      const result = await getUsers();
      expect(result).toHaveLength(2);
      
      result.forEach(user => {
        expect(user.password_hash).toBe(''); // Should be excluded
        expect(user.email).toBeTruthy();
        expect(user.username).toBeTruthy();
        expect(user.full_name).toBeTruthy();
      });
    });

    it('should order users by full name', async () => {
      await createUser(testUserInput); // John Doe
      await createUser(adminUserInput); // System Admin

      const result = await getUsers();
      expect(result[0].full_name).toBe('John Doe');
      expect(result[1].full_name).toBe('System Admin');
    });
  });

  describe('getUserById', () => {
    it('should return null for non-existent user', async () => {
      const result = await getUserById(999);
      expect(result).toBeNull();
    });

    it('should return user without password hash', async () => {
      const createdUser = await createUser(testUserInput);
      const result = await getUserById(createdUser.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(createdUser.id);
      expect(result!.email).toBe(testUserInput.email);
      expect(result!.password_hash).toBe(''); // Should be excluded
    });
  });

  describe('getUserByEmail', () => {
    it('should return null for non-existent email', async () => {
      const result = await getUserByEmail('nonexistent@example.com');
      expect(result).toBeNull();
    });

    it('should return user with password hash for authentication', async () => {
      await createUser(testUserInput);
      const result = await getUserByEmail(testUserInput.email);

      expect(result).not.toBeNull();
      expect(result!.email).toBe(testUserInput.email);
      expect(result!.password_hash).toBeTruthy(); // Should be included for auth
    });

    it('should return null for inactive user', async () => {
      const createdUser = await createUser(testUserInput);
      
      // Deactivate user directly in database
      await db.update(usersTable)
        .set({ is_active: false })
        .where(eq(usersTable.id, createdUser.id))
        .execute();

      const result = await getUserByEmail(testUserInput.email);
      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user fields successfully', async () => {
      const createdUser = await createUser(testUserInput);
      
      const updates = {
        full_name: 'John Updated',
        role: 'admin' as UserRole
      };

      const result = await updateUser(createdUser.id, updates);
      
      expect(result.full_name).toBe('John Updated');
      expect(result.role).toBe('admin');
      expect(result.email).toBe(testUserInput.email); // Unchanged
    });

    it('should create audit log entry', async () => {
      const createdUser = await createUser(testUserInput);
      await updateUser(createdUser.id, { full_name: 'Updated Name' });

      const auditLogs = await db.select()
        .from(auditLogTable)
        .where(eq(auditLogTable.action, 'UPDATE_USER'))
        .execute();

      expect(auditLogs).toHaveLength(1);
    });

    it('should reject update to existing email', async () => {
      await createUser(testUserInput);
      const user2 = await createUser(adminUserInput);

      expect(
        updateUser(user2.id, { email: testUserInput.email })
      ).rejects.toThrow(/email already exists/i);
    });

    it('should reject update to existing username', async () => {
      await createUser(testUserInput);
      const user2 = await createUser(adminUserInput);

      expect(
        updateUser(user2.id, { username: testUserInput.username })
      ).rejects.toThrow(/username already exists/i);
    });

    it('should throw error for non-existent user', async () => {
      expect(
        updateUser(999, { full_name: 'Test' })
      ).rejects.toThrow(/user not found/i);
    });
  });

  describe('updateUserPassword', () => {
    it('should update password successfully', async () => {
      const createdUser = await createUser(testUserInput);
      const newPassword = 'newpassword123';

      const result = await updateUserPassword(
        createdUser.id, 
        testUserInput.password, 
        newPassword
      );

      expect(result).toBe(true);

      // Verify new password works
      const updatedUser = await getUserByEmail(testUserInput.email);
      const isValid = await compare(newPassword, updatedUser!.password_hash);
      expect(isValid).toBe(true);
    });

    it('should create audit log entry', async () => {
      const createdUser = await createUser(testUserInput);
      await updateUserPassword(createdUser.id, testUserInput.password, 'new123');

      const auditLogs = await db.select()
        .from(auditLogTable)
        .where(eq(auditLogTable.action, 'UPDATE_PASSWORD'))
        .execute();

      expect(auditLogs).toHaveLength(1);
    });

    it('should reject incorrect current password', async () => {
      const createdUser = await createUser(testUserInput);

      expect(
        updateUserPassword(createdUser.id, 'wrongpassword', 'new123')
      ).rejects.toThrow(/current password is incorrect/i);
    });

    it('should reject for non-existent user', async () => {
      expect(
        updateUserPassword(999, 'any', 'new123')
      ).rejects.toThrow(/user not found or inactive/i);
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate user successfully', async () => {
      const createdUser = await createUser(testUserInput);
      const admin = await createUser(adminUserInput);

      const result = await deactivateUser(createdUser.id, admin.id);
      expect(result).toBe(true);

      // Verify user is deactivated
      const deactivatedUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, createdUser.id))
        .execute();

      expect(deactivatedUser[0].is_active).toBe(false);
    });

    it('should create audit log entry', async () => {
      const createdUser = await createUser(testUserInput);
      const admin = await createUser(adminUserInput);
      
      await deactivateUser(createdUser.id, admin.id);

      const auditLogs = await db.select()
        .from(auditLogTable)
        .where(eq(auditLogTable.action, 'DEACTIVATE_USER'))
        .execute();

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].user_id).toBe(admin.id);
    });

    it('should reject deactivating already inactive user', async () => {
      const createdUser = await createUser(testUserInput);
      const admin = await createUser(adminUserInput);
      
      await deactivateUser(createdUser.id, admin.id);

      expect(
        deactivateUser(createdUser.id, admin.id)
      ).rejects.toThrow(/user not found or already inactive/i);
    });
  });

  describe('getUsersByRole', () => {
    it('should return empty array when no users with role exist', async () => {
      const result = await getUsersByRole('auditor');
      expect(result).toEqual([]);
    });

    it('should return users with specific role', async () => {
      await createUser(testUserInput); // operator_produksi
      await createUser(adminUserInput); // admin

      const operators = await getUsersByRole('operator_produksi');
      const admins = await getUsersByRole('admin');

      expect(operators).toHaveLength(1);
      expect(operators[0].role).toBe('operator_produksi');
      
      expect(admins).toHaveLength(1);
      expect(admins[0].role).toBe('admin');
    });

    it('should only return active users', async () => {
      const user1 = await createUser(testUserInput);
      const user2 = await createUser({
        ...testUserInput,
        email: 'user2@example.com',
        username: 'user2'
      });
      const admin = await createUser(adminUserInput);

      // Deactivate one user
      await deactivateUser(user1.id, admin.id);

      const operators = await getUsersByRole('operator_produksi');
      expect(operators).toHaveLength(1);
      expect(operators[0].id).toBe(user2.id);
    });

    it('should exclude password hashes', async () => {
      await createUser(testUserInput);
      
      const result = await getUsersByRole('operator_produksi');
      expect(result[0].password_hash).toBe('');
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      const createdUser = await createUser(testUserInput);
      
      // Initial last_login should be null
      expect(createdUser.last_login).toBeNull();

      await updateLastLogin(createdUser.id);

      // Verify last_login was updated
      const updatedUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, createdUser.id))
        .execute();

      expect(updatedUser[0].last_login).toBeInstanceOf(Date);
      expect(updatedUser[0].last_login!.getTime()).toBeGreaterThan(
        createdUser.created_at.getTime()
      );
    });
  });
});