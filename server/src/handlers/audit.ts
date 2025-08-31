import { db } from '../db';
import { auditLogTable, usersTable } from '../db/schema';
import { eq, and, gte, lte, desc, asc, count, sql, SQL } from 'drizzle-orm';
import { 
  type AuditLog, 
  type AuditLogFilter 
} from '../schema';

export async function createAuditLog(
  userId: number,
  action: string,
  tableName: string,
  recordId?: number,
  oldValues?: any,
  newValues?: any,
  ipAddress?: string,
  userAgent?: string
): Promise<AuditLog> {
  try {
    const result = await db.insert(auditLogTable)
      .values({
        user_id: userId,
        action,
        table_name: tableName,
        record_id: recordId || null,
        old_values: oldValues || null,
        new_values: newValues || null,
        ip_address: ipAddress || null,
        user_agent: userAgent || null
      })
      .returning()
      .execute();

    const auditLog = result[0];
    return {
      ...auditLog,
      old_values: auditLog.old_values ? JSON.stringify(auditLog.old_values) : null,
      new_values: auditLog.new_values ? JSON.stringify(auditLog.new_values) : null
    };
  } catch (error) {
    console.error('Audit log creation failed:', error);
    throw error;
  }
}

export async function getAuditLogs(filter?: AuditLogFilter): Promise<Array<AuditLog & {
  user_name: string;
  user_email: string;
}>> {
  try {
    // Build base query with user join
    let baseQuery = db.select({
      id: auditLogTable.id,
      user_id: auditLogTable.user_id,
      action: auditLogTable.action,
      table_name: auditLogTable.table_name,
      record_id: auditLogTable.record_id,
      old_values: auditLogTable.old_values,
      new_values: auditLogTable.new_values,
      ip_address: auditLogTable.ip_address,
      user_agent: auditLogTable.user_agent,
      created_at: auditLogTable.created_at,
      user_name: usersTable.full_name,
      user_email: usersTable.email
    })
    .from(auditLogTable)
    .innerJoin(usersTable, eq(auditLogTable.user_id, usersTable.id));

    // Build conditions array
    const conditions: SQL<unknown>[] = [];

    if (filter?.user_id) {
      conditions.push(eq(auditLogTable.user_id, filter.user_id));
    }

    if (filter?.action) {
      conditions.push(eq(auditLogTable.action, filter.action));
    }

    if (filter?.table_name) {
      conditions.push(eq(auditLogTable.table_name, filter.table_name));
    }

    if (filter?.date_from) {
      conditions.push(gte(auditLogTable.created_at, filter.date_from));
    }

    if (filter?.date_to) {
      conditions.push(lte(auditLogTable.created_at, filter.date_to));
    }

    // Apply conditions and order
    const finalQuery = conditions.length > 0 
      ? baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions)).orderBy(desc(auditLogTable.created_at))
      : baseQuery.orderBy(desc(auditLogTable.created_at));

    const results = await finalQuery.execute();

    return results.map(result => ({
      id: result.id,
      user_id: result.user_id,
      action: result.action,
      table_name: result.table_name,
      record_id: result.record_id,
      old_values: result.old_values ? JSON.stringify(result.old_values) : null,
      new_values: result.new_values ? JSON.stringify(result.new_values) : null,
      ip_address: result.ip_address,
      user_agent: result.user_agent,
      created_at: result.created_at,
      user_name: result.user_name,
      user_email: result.user_email
    }));
  } catch (error) {
    console.error('Get audit logs failed:', error);
    throw error;
  }
}

export async function getAuditLogById(id: number): Promise<(AuditLog & {
  user_name: string;
  user_email: string;
}) | null> {
  try {
    const results = await db.select({
      id: auditLogTable.id,
      user_id: auditLogTable.user_id,
      action: auditLogTable.action,
      table_name: auditLogTable.table_name,
      record_id: auditLogTable.record_id,
      old_values: auditLogTable.old_values,
      new_values: auditLogTable.new_values,
      ip_address: auditLogTable.ip_address,
      user_agent: auditLogTable.user_agent,
      created_at: auditLogTable.created_at,
      user_name: usersTable.full_name,
      user_email: usersTable.email
    })
    .from(auditLogTable)
    .innerJoin(usersTable, eq(auditLogTable.user_id, usersTable.id))
    .where(eq(auditLogTable.id, id))
    .execute();

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    return {
      id: result.id,
      user_id: result.user_id,
      action: result.action,
      table_name: result.table_name,
      record_id: result.record_id,
      old_values: result.old_values ? JSON.stringify(result.old_values) : null,
      new_values: result.new_values ? JSON.stringify(result.new_values) : null,
      ip_address: result.ip_address,
      user_agent: result.user_agent,
      created_at: result.created_at,
      user_name: result.user_name,
      user_email: result.user_email
    };
  } catch (error) {
    console.error('Get audit log by id failed:', error);
    throw error;
  }
}

export async function getAuditLogsByRecord(
  tableName: string, 
  recordId: number
): Promise<Array<AuditLog & {
  user_name: string;
  user_email: string;
}>> {
  try {
    const results = await db.select({
      id: auditLogTable.id,
      user_id: auditLogTable.user_id,
      action: auditLogTable.action,
      table_name: auditLogTable.table_name,
      record_id: auditLogTable.record_id,
      old_values: auditLogTable.old_values,
      new_values: auditLogTable.new_values,
      ip_address: auditLogTable.ip_address,
      user_agent: auditLogTable.user_agent,
      created_at: auditLogTable.created_at,
      user_name: usersTable.full_name,
      user_email: usersTable.email
    })
    .from(auditLogTable)
    .innerJoin(usersTable, eq(auditLogTable.user_id, usersTable.id))
    .where(and(
      eq(auditLogTable.table_name, tableName),
      eq(auditLogTable.record_id, recordId)
    ))
    .orderBy(asc(auditLogTable.created_at)) // Chronological order for history
    .execute();

    return results.map(result => ({
      id: result.id,
      user_id: result.user_id,
      action: result.action,
      table_name: result.table_name,
      record_id: result.record_id,
      old_values: result.old_values ? JSON.stringify(result.old_values) : null,
      new_values: result.new_values ? JSON.stringify(result.new_values) : null,
      ip_address: result.ip_address,
      user_agent: result.user_agent,
      created_at: result.created_at,
      user_name: result.user_name,
      user_email: result.user_email
    }));
  } catch (error) {
    console.error('Get audit logs by record failed:', error);
    throw error;
  }
}

export async function getAuditSummary(dateFrom?: Date, dateTo?: Date): Promise<{
  total_actions: number;
  actions_by_type: Array<{ action: string; count: number }>;
  actions_by_user: Array<{ user_id: number; user_name: string; count: number }>;
  actions_by_table: Array<{ table_name: string; count: number }>;
  most_active_day: { date: Date; count: number };
}> {
  try {
    // Build base conditions
    const conditions: SQL<unknown>[] = [];
    
    if (dateFrom) {
      conditions.push(gte(auditLogTable.created_at, dateFrom));
    }
    
    if (dateTo) {
      conditions.push(lte(auditLogTable.created_at, dateTo));
    }

    const baseWhere = conditions.length > 0 
      ? (conditions.length === 1 ? conditions[0] : and(...conditions))
      : undefined;

    // Get total actions count
    const totalQuery = db.select({ count: count() }).from(auditLogTable);
    const totalResult = baseWhere 
      ? await totalQuery.where(baseWhere).execute()
      : await totalQuery.execute();
    const total_actions = totalResult[0]?.count || 0;

    // Get actions by type
    const actionsByTypeQuery = db.select({
      action: auditLogTable.action,
      count: count()
    })
    .from(auditLogTable)
    .groupBy(auditLogTable.action)
    .orderBy(desc(count()));

    const actionsByTypeResult = baseWhere
      ? await actionsByTypeQuery.where(baseWhere).execute()
      : await actionsByTypeQuery.execute();
    
    const actions_by_type = actionsByTypeResult.map(row => ({
      action: row.action,
      count: row.count
    }));

    // Get actions by user
    const actionsByUserQuery = db.select({
      user_id: auditLogTable.user_id,
      user_name: usersTable.full_name,
      count: count()
    })
    .from(auditLogTable)
    .innerJoin(usersTable, eq(auditLogTable.user_id, usersTable.id))
    .groupBy(auditLogTable.user_id, usersTable.full_name)
    .orderBy(desc(count()));

    const actionsByUserResult = baseWhere
      ? await actionsByUserQuery.where(baseWhere).execute()
      : await actionsByUserQuery.execute();

    const actions_by_user = actionsByUserResult.map(row => ({
      user_id: row.user_id,
      user_name: row.user_name,
      count: row.count
    }));

    // Get actions by table
    const actionsByTableQuery = db.select({
      table_name: auditLogTable.table_name,
      count: count()
    })
    .from(auditLogTable)
    .groupBy(auditLogTable.table_name)
    .orderBy(desc(count()));

    const actionsByTableResult = baseWhere
      ? await actionsByTableQuery.where(baseWhere).execute()
      : await actionsByTableQuery.execute();

    const actions_by_table = actionsByTableResult.map(row => ({
      table_name: row.table_name,
      count: row.count
    }));

    // Get most active day
    const mostActiveDayQuery = db.select({
      date: sql<string>`DATE(${auditLogTable.created_at})`,
      count: count()
    })
    .from(auditLogTable)
    .groupBy(sql`DATE(${auditLogTable.created_at})`)
    .orderBy(desc(count()))
    .limit(1);

    const mostActiveDayResult = baseWhere
      ? await mostActiveDayQuery.where(baseWhere).execute()
      : await mostActiveDayQuery.execute();

    const most_active_day = mostActiveDayResult.length > 0
      ? { date: new Date(mostActiveDayResult[0].date), count: mostActiveDayResult[0].count }
      : { date: new Date(), count: 0 };

    return {
      total_actions,
      actions_by_type,
      actions_by_user,
      actions_by_table,
      most_active_day
    };
  } catch (error) {
    console.error('Get audit summary failed:', error);
    throw error;
  }
}

export async function exportAuditLogs(
  filter?: AuditLogFilter,
  format: 'csv' | 'pdf' = 'csv'
): Promise<{ content: string; filename: string; mimeType: string }> {
  try {
    // Get audit logs with filter
    const auditLogs = await getAuditLogs(filter);

    if (format === 'csv') {
      // Create CSV header
      const csvHeader = [
        'ID',
        'User ID',
        'User Name',
        'User Email',
        'Action',
        'Table Name',
        'Record ID',
        'Old Values',
        'New Values',
        'IP Address',
        'User Agent',
        'Created At'
      ].join(',');

      // Create CSV rows
      const csvRows = auditLogs.map(log => [
        log.id,
        log.user_id,
        `"${log.user_name}"`,
        `"${log.user_email}"`,
        `"${log.action}"`,
        `"${log.table_name}"`,
        log.record_id || '',
        `"${log.old_values || ''}"`,
        `"${log.new_values || ''}"`,
        `"${log.ip_address || ''}"`,
        `"${log.user_agent || ''}"`,
        log.created_at.toISOString()
      ].join(','));

      const csvContent = [csvHeader, ...csvRows].join('\n');
      const timestamp = new Date().toISOString().split('T')[0];

      return {
        content: csvContent,
        filename: `audit_logs_${timestamp}.csv`,
        mimeType: 'text/csv'
      };
    } else {
      // For PDF format, create a simple text representation
      const textContent = auditLogs.map(log => 
        `ID: ${log.id}\n` +
        `User: ${log.user_name} (${log.user_email})\n` +
        `Action: ${log.action}\n` +
        `Table: ${log.table_name}\n` +
        `Record ID: ${log.record_id || 'N/A'}\n` +
        `Created: ${log.created_at.toISOString()}\n` +
        `Old Values: ${log.old_values || 'N/A'}\n` +
        `New Values: ${log.new_values || 'N/A'}\n` +
        `IP: ${log.ip_address || 'N/A'}\n` +
        `User Agent: ${log.user_agent || 'N/A'}\n` +
        '---\n'
      ).join('\n');

      const timestamp = new Date().toISOString().split('T')[0];

      return {
        content: textContent,
        filename: `audit_logs_${timestamp}.txt`,
        mimeType: 'text/plain'
      };
    }
  } catch (error) {
    console.error('Export audit logs failed:', error);
    throw error;
  }
}