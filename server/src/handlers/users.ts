import { db } from '../db';
import { usersTable, auditLogTable } from '../db/schema';
import { 
  type CreateUserInput, 
  type User, 
  type UserRole 
} from '../schema';
import { eq, and, asc, desc } from 'drizzle-orm';
// Using Bun's built-in password hashing
const hash = async (password: string, rounds: number = 10): Promise<string> => {
  return await Bun.password.hash(password);
};

const compare = async (password: string, hash: string): Promise<boolean> => {
  return await Bun.password.verify(password, hash);
};

export async function createUser(input: CreateUserInput): Promise<User> {
  try {
    // Check if email or username already exists
    const existingUsers = await db.select()
      .from(usersTable)
      .where(
        eq(usersTable.email, input.email)
      )
      .execute();

    if (existingUsers.length > 0) {
      throw new Error('Email already exists');
    }

    const existingUsername = await db.select()
      .from(usersTable)
      .where(
        eq(usersTable.username, input.username)
      )
      .execute();

    if (existingUsername.length > 0) {
      throw new Error('Username already exists');
    }

    // Hash the password
    const passwordHash = await hash(input.password, 10);

    // Insert new user
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        username: input.username,
        password_hash: passwordHash,
        full_name: input.full_name,
        role: input.role,
        is_active: true,
        updated_at: new Date()
      })
      .returning()
      .execute();

    const user = result[0];

    // Log user creation in audit log
    await db.insert(auditLogTable)
      .values({
        user_id: user.id,
        action: 'CREATE_USER',
        table_name: 'users',
        record_id: user.id,
        new_values: {
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          is_active: user.is_active
        }
      })
      .execute();

    // Return user without password hash
    const { password_hash, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      password_hash: '' // Explicitly set to empty string for security
    } as User;
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
}

export async function getUsers(): Promise<User[]> {
  try {
    const results = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      full_name: usersTable.full_name,
      role: usersTable.role,
      is_active: usersTable.is_active,
      last_login: usersTable.last_login,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at
    })
    .from(usersTable)
    .orderBy(asc(usersTable.full_name))
    .execute();

    return results.map(user => ({
      ...user,
      password_hash: '' // Excluded for security
    })) as User[];
  } catch (error) {
    console.error('Failed to fetch users:', error);
    throw error;
  }
}

export async function getUserById(id: number): Promise<User | null> {
  try {
    const results = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      full_name: usersTable.full_name,
      role: usersTable.role,
      is_active: usersTable.is_active,
      last_login: usersTable.last_login,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at
    })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .execute();

    if (results.length === 0) {
      return null;
    }

    const user = results[0];
    return {
      ...user,
      password_hash: '' // Excluded for security
    } as User;
  } catch (error) {
    console.error('Failed to fetch user by ID:', error);
    throw error;
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const results = await db.select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.email, email),
          eq(usersTable.is_active, true)
        )
      )
      .execute();

    if (results.length === 0) {
      return null;
    }

    return results[0];
  } catch (error) {
    console.error('Failed to fetch user by email:', error);
    throw error;
  }
}

export async function updateUser(
  id: number, 
  updates: Partial<{
    email: string;
    username: string;
    full_name: string;
    role: UserRole;
    is_active: boolean;
  }>
): Promise<User> {
  try {
    // Check if user exists
    const existingUser = await getUserById(id);
    if (!existingUser) {
      throw new Error('User not found');
    }

    // Check email uniqueness if updating email
    if (updates.email && updates.email !== existingUser.email) {
      const emailExists = await db.select()
        .from(usersTable)
        .where(eq(usersTable.email, updates.email))
        .execute();

      if (emailExists.length > 0) {
        throw new Error('Email already exists');
      }
    }

    // Check username uniqueness if updating username
    if (updates.username && updates.username !== existingUser.username) {
      const usernameExists = await db.select()
        .from(usersTable)
        .where(eq(usersTable.username, updates.username))
        .execute();

      if (usernameExists.length > 0) {
        throw new Error('Username already exists');
      }
    }

    // Update user
    const result = await db.update(usersTable)
      .set({
        ...updates,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, id))
      .returning()
      .execute();

    const updatedUser = result[0];

    // Log update to audit log
    await db.insert(auditLogTable)
      .values({
        user_id: id,
        action: 'UPDATE_USER',
        table_name: 'users',
        record_id: id,
        old_values: existingUser,
        new_values: updates
      })
      .execute();

    // Return user without password hash
    const { password_hash, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword as User;
  } catch (error) {
    console.error('User update failed:', error);
    throw error;
  }
}

export async function updateUserPassword(
  id: number, 
  currentPassword: string, 
  newPassword: string
): Promise<boolean> {
  try {
    // Get user with password hash
    const results = await db.select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, id),
          eq(usersTable.is_active, true)
        )
      )
      .execute();

    if (results.length === 0) {
      throw new Error('User not found or inactive');
    }

    const user = results[0];

    // Verify current password
    const isCurrentPasswordValid = await compare(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await hash(newPassword, 10);

    // Update password
    await db.update(usersTable)
      .set({
        password_hash: newPasswordHash,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, id))
      .execute();

    // Log password change
    await db.insert(auditLogTable)
      .values({
        user_id: id,
        action: 'UPDATE_PASSWORD',
        table_name: 'users',
        record_id: id,
        new_values: { password_changed: true }
      })
      .execute();

    return true;
  } catch (error) {
    console.error('Password update failed:', error);
    throw error;
  }
}

export async function deactivateUser(id: number, deactivatedBy: number): Promise<boolean> {
  try {
    // Check if user exists and is currently active
    const existingUser = await db.select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, id),
          eq(usersTable.is_active, true)
        )
      )
      .execute();

    if (existingUser.length === 0) {
      throw new Error('User not found or already inactive');
    }

    // Deactivate user
    await db.update(usersTable)
      .set({
        is_active: false,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, id))
      .execute();

    // Log deactivation
    await db.insert(auditLogTable)
      .values({
        user_id: deactivatedBy,
        action: 'DEACTIVATE_USER',
        table_name: 'users',
        record_id: id,
        old_values: { is_active: true },
        new_values: { is_active: false, deactivated_by: deactivatedBy }
      })
      .execute();

    return true;
  } catch (error) {
    console.error('User deactivation failed:', error);
    throw error;
  }
}

export async function getUsersByRole(role: UserRole): Promise<User[]> {
  try {
    const results = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      full_name: usersTable.full_name,
      role: usersTable.role,
      is_active: usersTable.is_active,
      last_login: usersTable.last_login,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, role),
        eq(usersTable.is_active, true)
      )
    )
    .orderBy(asc(usersTable.full_name))
    .execute();

    return results.map(user => ({
      ...user,
      password_hash: '' // Excluded for security
    })) as User[];
  } catch (error) {
    console.error('Failed to fetch users by role:', error);
    throw error;
  }
}

export async function updateLastLogin(id: number): Promise<void> {
  try {
    await db.update(usersTable)
      .set({
        last_login: new Date(),
        updated_at: new Date()
      })
      .where(eq(usersTable.id, id))
      .execute();
  } catch (error) {
    console.error('Failed to update last login:', error);
    throw error;
  }
}