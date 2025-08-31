import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, auditLogTable } from '../db/schema';
import { type LoginInput } from '../schema';
import { login, verifyToken, refreshToken, hashPassword } from '../handlers/auth';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env['JWT_SECRET'] || 'default-secret-key';

// Helper function to create a JWT token for testing
const createTestToken = async (payload: any, type: 'access' | 'refresh', expiresInSeconds: number = 3600): Promise<string> => {
  const base64UrlEncode = (str: string): string => {
    return Buffer.from(str).toString('base64url');
  };

  const createSignature = async (data: string, secret: string): Promise<string> => {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return Buffer.from(signature).toString('base64url');
  };

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const jwtPayload = {
    ...payload,
    type,
    exp: now + expiresInSeconds,
    iat: now
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(jwtPayload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = await createSignature(data, JWT_SECRET);

  return `${data}.${signature}`;
};

// Helper function to decode JWT token for testing
const decodeTestToken = (token: string): any => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = Buffer.from(parts[1], 'base64url').toString();
  return JSON.parse(payload);
};

// Test user data
const testUserData = {
  email: 'test@example.com',
  username: 'testuser',
  password: 'password123',
  full_name: 'Test User',
  role: 'admin' as const,
  is_active: true
};

describe('Auth handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('login', () => {
    it('should authenticate user with valid credentials', async () => {
      // Create test user
      const hashedPassword = await hashPassword(testUserData.password);
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword
        })
        .returning()
        .execute();

      const testUser = insertedUsers[0];

      const loginInput: LoginInput = {
        email: testUserData.email,
        password: testUserData.password
      };

      const result = await login(loginInput);

      // Verify user data
      expect(result.user.id).toEqual(testUser.id);
      expect(result.user.email).toEqual(testUserData.email);
      expect(result.user.username).toEqual(testUserData.username);
      expect(result.user.full_name).toEqual(testUserData.full_name);
      expect(result.user.role).toEqual(testUserData.role);
      expect(result.user.is_active).toEqual(true);
      expect(result.user.last_login).toBeInstanceOf(Date);
      expect(result.user.created_at).toBeInstanceOf(Date);
      expect(result.user.updated_at).toBeInstanceOf(Date);

      // Verify token is generated
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');

      // Verify token can be decoded
      const decoded = decodeTestToken(result.token);
      expect(decoded.userId).toEqual(testUser.id);
      expect(decoded.email).toEqual(testUserData.email);
      expect(decoded.role).toEqual(testUserData.role);
      expect(decoded.type).toEqual('access');
    });

    it('should update last_login timestamp on successful login', async () => {
      const hashedPassword = await hashPassword(testUserData.password);
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword
        })
        .returning()
        .execute();

      const testUser = insertedUsers[0];
      const originalLastLogin = testUser.last_login;

      const loginInput: LoginInput = {
        email: testUserData.email,
        password: testUserData.password
      };

      await login(loginInput);

      // Check that last_login was updated
      const updatedUsers = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, testUser.id))
        .execute();

      expect(updatedUsers[0].last_login).not.toEqual(originalLastLogin);
      expect(updatedUsers[0].last_login).toBeInstanceOf(Date);
    });

    it('should create audit log entry on successful login', async () => {
      const hashedPassword = await hashPassword(testUserData.password);
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword
        })
        .returning()
        .execute();

      const testUser = insertedUsers[0];

      const loginInput: LoginInput = {
        email: testUserData.email,
        password: testUserData.password
      };

      await login(loginInput);

      // Check audit log entry
      const auditLogs = await db.select()
        .from(auditLogTable)
        .where(eq(auditLogTable.user_id, testUser.id))
        .execute();

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toEqual('login');
      expect(auditLogs[0].table_name).toEqual('users');
      expect(auditLogs[0].record_id).toEqual(testUser.id);
      expect(auditLogs[0].created_at).toBeInstanceOf(Date);

      // Verify new_values contains login information
      const newValues = auditLogs[0].new_values as any;
      expect(newValues.success).toBe(true);
      expect(newValues.login_time).toBeDefined();
    });

    it('should reject login with invalid email', async () => {
      const loginInput: LoginInput = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      await expect(login(loginInput)).rejects.toThrow(/invalid credentials/i);
    });

    it('should reject login with invalid password', async () => {
      const hashedPassword = await hashPassword(testUserData.password);
      await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword
        })
        .execute();

      const loginInput: LoginInput = {
        email: testUserData.email,
        password: 'wrongpassword'
      };

      await expect(login(loginInput)).rejects.toThrow(/invalid credentials/i);
    });

    it('should reject login for inactive user', async () => {
      const hashedPassword = await hashPassword(testUserData.password);
      await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword,
          is_active: false
        })
        .execute();

      const loginInput: LoginInput = {
        email: testUserData.email,
        password: testUserData.password
      };

      await expect(login(loginInput)).rejects.toThrow(/account is deactivated/i);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid access token and return user', async () => {
      // Create test user
      const hashedPassword = await hashPassword(testUserData.password);
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword
        })
        .returning()
        .execute();

      const testUser = insertedUsers[0];

      // Generate valid access token
      const token = await createTestToken(
        {
          userId: testUser.id,
          email: testUser.email,
          role: testUser.role
        },
        'access',
        3600
      );

      const result = await verifyToken(token);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(testUser.id);
      expect(result!.email).toEqual(testUser.email);
      expect(result!.username).toEqual(testUser.username);
      expect(result!.is_active).toBe(true);
    });

    it('should return null for invalid token', async () => {
      const invalidToken = 'invalid-token';
      const result = await verifyToken(invalidToken);
      expect(result).toBeNull();
    });

    it('should return null for expired token', async () => {
      // Create test user
      const hashedPassword = await hashPassword(testUserData.password);
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword
        })
        .returning()
        .execute();

      const testUser = insertedUsers[0];

      // Generate expired token
      const expiredToken = await createTestToken(
        {
          userId: testUser.id,
          email: testUser.email,
          role: testUser.role
        },
        'access',
        -1 // Already expired
      );

      const result = await verifyToken(expiredToken);
      expect(result).toBeNull();
    });

    it('should return null for refresh token (wrong type)', async () => {
      // Create test user
      const hashedPassword = await hashPassword(testUserData.password);
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword
        })
        .returning()
        .execute();

      const testUser = insertedUsers[0];

      // Generate refresh token (wrong type)
      const refreshTokenAsAccess = await createTestToken(
        {
          userId: testUser.id,
          email: testUser.email,
          role: testUser.role
        },
        'refresh',
        3600
      );

      const result = await verifyToken(refreshTokenAsAccess);
      expect(result).toBeNull();
    });

    it('should return null for token of inactive user', async () => {
      // Create inactive test user
      const hashedPassword = await hashPassword(testUserData.password);
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword,
          is_active: false
        })
        .returning()
        .execute();

      const testUser = insertedUsers[0];

      // Generate valid access token
      const token = await createTestToken(
        {
          userId: testUser.id,
          email: testUser.email,
          role: testUser.role
        },
        'access',
        3600
      );

      const result = await verifyToken(token);
      expect(result).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should generate new tokens with valid refresh token', async () => {
      // Create test user
      const hashedPassword = await hashPassword(testUserData.password);
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword
        })
        .returning()
        .execute();

      const testUser = insertedUsers[0];

      // Generate valid refresh token
      const oldRefreshToken = await createTestToken(
        {
          userId: testUser.id,
          email: testUser.email,
          role: testUser.role
        },
        'refresh',
        7 * 24 * 3600 // 7 days
      );

      const result = await refreshToken(oldRefreshToken);

      expect(result.token).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(typeof result.refreshToken).toBe('string');

      // Verify new access token
      const decodedAccessToken = decodeTestToken(result.token);
      expect(decodedAccessToken.userId).toEqual(testUser.id);
      expect(decodedAccessToken.type).toEqual('access');

      // Verify new refresh token
      const decodedRefreshToken = decodeTestToken(result.refreshToken);
      expect(decodedRefreshToken.userId).toEqual(testUser.id);
      expect(decodedRefreshToken.type).toEqual('refresh');
    });

    it('should create audit log entry on token refresh', async () => {
      // Create test user
      const hashedPassword = await hashPassword(testUserData.password);
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword
        })
        .returning()
        .execute();

      const testUser = insertedUsers[0];

      // Generate valid refresh token
      const oldRefreshToken = await createTestToken(
        {
          userId: testUser.id,
          email: testUser.email,
          role: testUser.role
        },
        'refresh',
        7 * 24 * 3600 // 7 days
      );

      await refreshToken(oldRefreshToken);

      // Check audit log entry
      const auditLogs = await db.select()
        .from(auditLogTable)
        .where(eq(auditLogTable.user_id, testUser.id))
        .execute();

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toEqual('token_refresh');
      expect(auditLogs[0].table_name).toEqual('users');
      expect(auditLogs[0].record_id).toEqual(testUser.id);

      // Verify new_values contains refresh information
      const newValues = auditLogs[0].new_values as any;
      expect(newValues.refresh_time).toBeDefined();
    });

    it('should reject invalid refresh token', async () => {
      const invalidRefreshToken = 'invalid-refresh-token';

      await expect(refreshToken(invalidRefreshToken)).rejects.toThrow();
    });

    it('should reject access token used as refresh token', async () => {
      // Create test user
      const hashedPassword = await hashPassword(testUserData.password);
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword
        })
        .returning()
        .execute();

      const testUser = insertedUsers[0];

      // Generate access token (wrong type)
      const accessToken = await createTestToken(
        {
          userId: testUser.id,
          email: testUser.email,
          role: testUser.role
        },
        'access',
        3600
      );

      await expect(refreshToken(accessToken)).rejects.toThrow(/invalid refresh token type/i);
    });

    it('should reject refresh token for inactive user', async () => {
      // Create inactive test user
      const hashedPassword = await hashPassword(testUserData.password);
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUserData,
          password_hash: hashedPassword,
          is_active: false
        })
        .returning()
        .execute();

      const testUser = insertedUsers[0];

      // Generate valid refresh token
      const oldRefreshToken = await createTestToken(
        {
          userId: testUser.id,
          email: testUser.email,
          role: testUser.role
        },
        'refresh',
        7 * 24 * 3600 // 7 days
      );

      await expect(refreshToken(oldRefreshToken)).rejects.toThrow(/user not found or inactive/i);
    });
  });

  describe('hashPassword utility', () => {
    it('should hash passwords consistently', async () => {
      const password = 'testpassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
      expect(typeof hash1).toBe('string');
      expect(typeof hash2).toBe('string');
      
      // Hashes should be different due to salt
      expect(hash1).not.toEqual(hash2);
      
      // But both should verify against the original password
      expect(await Bun.password.verify(password, hash1)).toBe(true);
      expect(await Bun.password.verify(password, hash2)).toBe(true);
    });
  });
});