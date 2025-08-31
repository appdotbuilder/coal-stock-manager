import { db } from '../db';
import { contractorsTable, stockTable, auditLogTable } from '../db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { 
  type CreateContractorInput, 
  type UpdateContractorInput, 
  type Contractor 
} from '../schema';

export async function createContractor(input: CreateContractorInput): Promise<Contractor> {
  try {
    // Check for duplicate code
    const existingContractor = await db.select()
      .from(contractorsTable)
      .where(eq(contractorsTable.code, input.code))
      .execute();

    if (existingContractor.length > 0) {
      throw new Error(`Contractor with code '${input.code}' already exists`);
    }

    // Insert new contractor
    const result = await db.insert(contractorsTable)
      .values({
        name: input.name,
        code: input.code,
        contact_person: input.contact_person,
        contract_number: input.contract_number,
        default_grade: input.default_grade
      })
      .returning()
      .execute();

    const contractor = result[0];
    
    return contractor;
  } catch (error) {
    console.error('Contractor creation failed:', error);
    throw error;
  }
}

export async function getContractors(): Promise<Contractor[]> {
  try {
    const contractors = await db.select()
      .from(contractorsTable)
      .where(isNull(contractorsTable.deleted_at))
      .orderBy(desc(contractorsTable.created_at))
      .execute();

    return contractors;
  } catch (error) {
    console.error('Failed to fetch contractors:', error);
    throw error;
  }
}

export async function getContractorById(id: number): Promise<Contractor | null> {
  try {
    const contractors = await db.select()
      .from(contractorsTable)
      .where(
        and(
          eq(contractorsTable.id, id),
          isNull(contractorsTable.deleted_at)
        )
      )
      .execute();

    return contractors.length > 0 ? contractors[0] : null;
  } catch (error) {
    console.error('Failed to fetch contractor by ID:', error);
    throw error;
  }
}

export async function updateContractor(input: UpdateContractorInput): Promise<Contractor> {
  try {
    // Check if contractor exists and is not deleted
    const existingContractor = await getContractorById(input.id);
    if (!existingContractor) {
      throw new Error('Contractor not found or has been deleted');
    }

    // Check for duplicate code if code is being updated
    if (input.code && input.code !== existingContractor.code) {
      const duplicateCodeCheck = await db.select()
        .from(contractorsTable)
        .where(eq(contractorsTable.code, input.code))
        .execute();

      if (duplicateCodeCheck.length > 0) {
        throw new Error(`Contractor with code '${input.code}' already exists`);
      }
    }

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.code !== undefined) updateData.code = input.code;
    if (input.contact_person !== undefined) updateData.contact_person = input.contact_person;
    if (input.contract_number !== undefined) updateData.contract_number = input.contract_number;
    if (input.default_grade !== undefined) updateData.default_grade = input.default_grade;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    // Update contractor
    const result = await db.update(contractorsTable)
      .set(updateData)
      .where(eq(contractorsTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Contractor update failed:', error);
    throw error;
  }
}

export async function deleteContractor(id: number, deletedBy: number): Promise<boolean> {
  try {
    // Check if contractor exists and is not already deleted
    const existingContractor = await getContractorById(id);
    if (!existingContractor) {
      throw new Error('Contractor not found or already deleted');
    }

    // Check if contractor has active stock
    const activeStock = await db.select()
      .from(stockTable)
      .where(eq(stockTable.contractor_id, id))
      .execute();

    const hasActiveStock = activeStock.some(stock => parseFloat(stock.tonnage) > 0);
    if (hasActiveStock) {
      throw new Error('Cannot delete contractor with active stock');
    }

    // Soft delete contractor
    await db.update(contractorsTable)
      .set({ 
        deleted_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(contractorsTable.id, id))
      .execute();

    // Log deletion to audit log
    await db.insert(auditLogTable)
      .values({
        user_id: deletedBy,
        action: 'DELETE',
        table_name: 'contractors',
        record_id: id,
        old_values: existingContractor,
        new_values: null
      })
      .execute();

    return true;
  } catch (error) {
    console.error('Contractor deletion failed:', error);
    throw error;
  }
}