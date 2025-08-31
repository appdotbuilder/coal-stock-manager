import { db } from '../db';
import { usersTable, auditLogTable } from '../db/schema';
import { type LoginInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

// Environment variables for JWT configuration
const JWT_SECRET = process.env['JWT_SECRET'] || 'default-secret-key';

interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  exp: number;
  iat: number;
}

// Simple JWT implementation using Bun's crypto functions
const base64UrlEncode = (str: string): string => {
  return Buffer.from(str).toString('base64url');
};

const base64UrlDecode = (str: string): string => {
  return Buffer.from(str, 'base64url').toString();
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

const verifySignature = async (data: string, signature: string, secret: string): Promise<boolean> => {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signatureBuffer = Buffer.from(signature, 'base64url');
    return await crypto.subtle.verify('HMAC', key, signatureBuffer, encoder.encode(data));
  } catch (error) {
    return false;
  }
};

// Simple password hashing using Bun's built-in crypto
const hashPassword = async (password: string): Promise<string> => {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 12
  });
};

const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return await Bun.password.verify(password, hash);
};

const generateToken = async (payload: Omit<JWTPayload, 'type' | 'exp' | 'iat'>, type: 'access' | 'refresh'): Promise<string> => {
  const expiresInHours = type === 'access' ? 24 : 168; // 24h for access, 7d for refresh
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (expiresInHours * 3600);
  
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const jwtPayload: JWTPayload = {
    ...payload,
    type,
    exp,
    iat: now
  };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(jwtPayload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = await createSignature(data, JWT_SECRET);
  
  return `${data}.${signature}`;
};

const verifyTokenJWT = async (token: string): Promise<JWTPayload | null> => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [encodedHeader, encodedPayload, signature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;
    
    // Verify signature
    const isValidSignature = await verifySignature(data, signature, JWT_SECRET);
    if (!isValidSignature) return null;
    
    // Decode payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JWTPayload;
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    
    return payload;
  } catch (error) {
    return null;
  }
};

export async function login(input: LoginInput): Promise<{ user: User; token: string }> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (users.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isValidPassword = await verifyPassword(input.password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last_login timestamp
    const updatedUsers = await db.update(usersTable)
      .set({ 
        last_login: new Date(),
        updated_at: new Date()
      })
      .where(eq(usersTable.id, user.id))
      .returning()
      .execute();

    const updatedUser = updatedUsers[0];

    // Generate JWT token
    const token = await generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    }, 'access');

    // Log authentication attempt to audit log
    await db.insert(auditLogTable)
      .values({
        user_id: user.id,
        action: 'login',
        table_name: 'users',
        record_id: user.id,
        new_values: { 
          login_time: new Date().toISOString(),
          success: true 
        },
        created_at: new Date()
      })
      .execute();

    return {
      user: updatedUser,
      token
    };
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

export async function verifyToken(token: string): Promise<User | null> {
  try {
    // Verify JWT token
    const decoded = await verifyTokenJWT(token);
    if (!decoded) return null;

    // Check if it's an access token
    if (decoded.type !== 'access') {
      return null;
    }

    // Fetch current user data from database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .execute();

    if (users.length === 0 || !users[0].is_active) {
      return null;
    }

    return users[0];
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

export async function refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
  try {
    // Verify refresh token
    const decoded = await verifyTokenJWT(refreshToken);
    if (!decoded) {
      throw new Error('Invalid refresh token');
    }

    // Check if it's a refresh token
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token type');
    }

    // Fetch current user data to ensure user is still active
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .execute();

    if (users.length === 0 || !users[0].is_active) {
      throw new Error('User not found or inactive');
    }

    const user = users[0];

    // Generate new access token and refresh token
    const newToken = await generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    }, 'access');

    const newRefreshToken = await generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    }, 'refresh');

    // Log token refresh to audit log
    await db.insert(auditLogTable)
      .values({
        user_id: user.id,
        action: 'token_refresh',
        table_name: 'users',
        record_id: user.id,
        new_values: { 
          refresh_time: new Date().toISOString()
        },
        created_at: new Date()
      })
      .execute();

    return {
      token: newToken,
      refreshToken: newRefreshToken
    };
  } catch (error) {
    console.error('Token refresh failed:', error);
    throw error;
  }
}

// Utility function to hash passwords (for use in other handlers)
export { hashPassword };