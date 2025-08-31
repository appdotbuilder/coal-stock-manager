import { db } from '../db';
import { jettiesTable } from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { 
  type CreateJettyInput, 
  type UpdateJettyInput, 
  type Jetty 
} from '../schema';

export const createJetty = async (input: CreateJettyInput): Promise<Jetty> => {
  try {
    // Insert jetty record
    const result = await db.insert(jettiesTable)
      .values({
        name: input.name,
        code: input.code,
        capacity: input.capacity.toString(), // Convert number to string for numeric column
        is_active: true
      })
      .returning()
      .execute();

    // Convert numeric fields back to numbers before returning
    const jetty = result[0];
    return {
      ...jetty,
      capacity: parseFloat(jetty.capacity) // Convert string back to number
    };
  } catch (error) {
    console.error('Jetty creation failed:', error);
    throw error;
  }
};

export const getJetties = async (): Promise<Jetty[]> => {
  try {
    const results = await db.select()
      .from(jettiesTable)
      .orderBy(asc(jettiesTable.name))
      .execute();

    // Convert numeric fields back to numbers before returning
    return results.map(jetty => ({
      ...jetty,
      capacity: parseFloat(jetty.capacity)
    }));
  } catch (error) {
    console.error('Failed to fetch jetties:', error);
    throw error;
  }
};

export const getActiveJetties = async (): Promise<Jetty[]> => {
  try {
    const results = await db.select()
      .from(jettiesTable)
      .where(eq(jettiesTable.is_active, true))
      .orderBy(asc(jettiesTable.name))
      .execute();

    // Convert numeric fields back to numbers before returning
    return results.map(jetty => ({
      ...jetty,
      capacity: parseFloat(jetty.capacity)
    }));
  } catch (error) {
    console.error('Failed to fetch active jetties:', error);
    throw error;
  }
};

export const getJettyById = async (id: number): Promise<Jetty | null> => {
  try {
    const results = await db.select()
      .from(jettiesTable)
      .where(eq(jettiesTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    // Convert numeric fields back to numbers before returning
    const jetty = results[0];
    return {
      ...jetty,
      capacity: parseFloat(jetty.capacity)
    };
  } catch (error) {
    console.error('Failed to fetch jetty by ID:', error);
    throw error;
  }
};

export const updateJetty = async (input: UpdateJettyInput): Promise<Jetty> => {
  try {
    // Check if jetty exists
    const existing = await getJettyById(input.id);
    if (!existing) {
      throw new Error(`Jetty with id ${input.id} not found`);
    }

    // Build update values, converting numeric fields to strings
    const updateValues: any = {
      updated_at: new Date()
    };

    if (input.name !== undefined) {
      updateValues.name = input.name;
    }
    if (input.code !== undefined) {
      updateValues.code = input.code;
    }
    if (input.capacity !== undefined) {
      updateValues.capacity = input.capacity.toString();
    }
    if (input.is_active !== undefined) {
      updateValues.is_active = input.is_active;
    }

    const result = await db.update(jettiesTable)
      .set(updateValues)
      .where(eq(jettiesTable.id, input.id))
      .returning()
      .execute();

    // Convert numeric fields back to numbers before returning
    const jetty = result[0];
    return {
      ...jetty,
      capacity: parseFloat(jetty.capacity)
    };
  } catch (error) {
    console.error('Jetty update failed:', error);
    throw error;
  }
};