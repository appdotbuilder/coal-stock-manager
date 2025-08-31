import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import {
  usersTable,
  jettiesTable,
  contractorsTable,
  productionRecordsTable,
  bargingRecordsTable,
  stockTable,
  stockAdjustmentsTable,
  fuelPurchasesTable,
  fuelUsageTable
} from '../db/schema';
import {
  getDashboardStats,
  getRecentActivity,
  getKPIMetrics,
  getStockTrends,
  getContractorPerformance
} from '../handlers/dashboard';

describe('Dashboard Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Setup test data
  async function createTestData() {
    // Create users
    const users = await db.insert(usersTable).values([
      {
        email: 'admin@test.com',
        username: 'admin',
        password_hash: 'hashed_password',
        full_name: 'Admin User',
        role: 'admin'
      },
      {
        email: 'operator@test.com',
        username: 'operator',
        password_hash: 'hashed_password',
        full_name: 'Operator User',
        role: 'operator_produksi'
      }
    ]).returning().execute();

    // Create jetties
    const jetties = await db.insert(jettiesTable).values([
      {
        name: 'Jetty A',
        code: 'JA001',
        capacity: '5000.00'
      },
      {
        name: 'Jetty B',
        code: 'JB002',
        capacity: '3000.00'
      }
    ]).returning().execute();

    // Create contractors
    const contractors = await db.insert(contractorsTable).values([
      {
        name: 'Contractor One',
        code: 'C001',
        contact_person: 'John Doe',
        contract_number: 'CT001',
        default_grade: 'high'
      },
      {
        name: 'Contractor Two',
        code: 'C002',
        contact_person: 'Jane Smith',
        contract_number: 'CT002',
        default_grade: 'medium'
      }
    ]).returning().execute();

    // Create stock records
    await db.insert(stockTable).values([
      {
        contractor_id: contractors[0].id,
        jetty_id: jetties[0].id,
        tonnage: '1500.50'
      },
      {
        contractor_id: contractors[1].id,
        jetty_id: jetties[1].id,
        tonnage: '2000.75'
      }
    ]).execute();

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    // Create production records
    await db.insert(productionRecordsTable).values([
      {
        date_time: today,
        contractor_id: contractors[0].id,
        truck_number: 'T001',
        tonnage: '100.50',
        coal_grade: 'high',
        jetty_id: jetties[0].id,
        operator_id: users[1].id,
        notes: 'Test production'
      },
      {
        date_time: yesterday,
        contractor_id: contractors[1].id,
        truck_number: 'T002',
        tonnage: '150.25',
        coal_grade: 'medium',
        jetty_id: jetties[1].id,
        operator_id: users[1].id,
        notes: 'Yesterday production'
      }
    ]).execute();

    // Create barging records
    await db.insert(bargingRecordsTable).values([
      {
        date_time: today,
        contractor_id: contractors[0].id,
        ship_batch_number: 'SB001',
        tonnage: '80.25',
        jetty_id: jetties[0].id,
        operator_id: users[1].id,
        buyer: 'Buyer One'
      }
    ]).execute();

    // Create stock adjustments
    const stockRecords = await db.select().from(stockTable).execute();
    await db.insert(stockAdjustmentsTable).values([
      {
        stock_id: stockRecords[0].id,
        adjusted_by: users[0].id,
        previous_tonnage: '1500.00',
        new_tonnage: '1500.50',
        adjustment_amount: '0.50',
        reason: 'manual_correction',
        reason_description: 'Manual correction for test'
      }
    ]).execute();

    // Create fuel purchases
    await db.insert(fuelPurchasesTable).values([
      {
        date: today,
        supplier: 'Fuel Supplier A',
        volume_liters: '500.00',
        cost: '750000.00',
        invoice_number: 'INV001',
        jetty_id: jetties[0].id,
        created_by: users[0].id
      }
    ]).execute();

    // Create fuel usage
    await db.insert(fuelUsageTable).values([
      {
        date: today,
        machine_equipment: 'Excavator 001',
        operator: 'Machine Operator',
        volume_liters: '50.00',
        production_tonnage: '100.00',
        created_by: users[0].id
      }
    ]).execute();

    return { users, jetties, contractors };
  }

  describe('getDashboardStats', () => {
    it('should return dashboard statistics', async () => {
      await createTestData();

      const stats = await getDashboardStats();

      expect(stats.total_stock).toBeGreaterThan(0);
      expect(typeof stats.total_stock).toBe('number');
      expect(stats.daily_production).toBeGreaterThan(0);
      expect(typeof stats.daily_production).toBe('number');
      expect(stats.active_contractors).toEqual(2);
      expect(stats.stock_by_jetty).toHaveLength(2);
      expect(stats.stock_by_contractor).toHaveLength(2);

      // Verify jetty aggregation
      const jettyA = stats.stock_by_jetty.find(j => j.jetty_name === 'Jetty A');
      expect(jettyA).toBeDefined();
      expect(jettyA!.total_tonnage).toEqual(1500.5);

      // Verify contractor aggregation
      const contractorOne = stats.stock_by_contractor.find(c => c.contractor_name === 'Contractor One');
      expect(contractorOne).toBeDefined();
      expect(contractorOne!.total_tonnage).toEqual(1500.5);
    });

    it('should handle empty data gracefully', async () => {
      const stats = await getDashboardStats();

      expect(stats.total_stock).toEqual(0);
      expect(stats.daily_production).toEqual(0);
      expect(stats.daily_barging).toEqual(0);
      expect(stats.active_contractors).toEqual(0);
      expect(stats.stock_by_jetty).toHaveLength(0);
      expect(stats.stock_by_contractor).toHaveLength(0);
    });
  });

  describe('getRecentActivity', () => {
    it('should return recent activity feed', async () => {
      await createTestData();

      const activities = await getRecentActivity(10);

      expect(activities.length).toBeGreaterThan(0);
      
      // Check activity types
      const activityTypes = activities.map(a => a.type);
      expect(activityTypes).toContain('production');
      expect(activityTypes).toContain('barging');
      expect(activityTypes).toContain('stock_adjustment');
      expect(activityTypes).toContain('fuel_purchase');

      // Verify activity structure
      const productionActivity = activities.find(a => a.type === 'production');
      if (productionActivity) {
        expect(productionActivity.tonnage).toBeGreaterThan(0);
        expect(typeof productionActivity.tonnage).toBe('number');
        expect(productionActivity.operator_name).toBeDefined();
        expect(productionActivity.description).toContain('Production:');
        expect(productionActivity.created_at).toBeInstanceOf(Date);
      }
    });

    it('should limit results correctly', async () => {
      await createTestData();

      const activities = await getRecentActivity(2);
      expect(activities.length).toBeLessThanOrEqual(2);
    });

    it('should sort by created_at descending', async () => {
      await createTestData();

      const activities = await getRecentActivity(10);
      
      for (let i = 1; i < activities.length; i++) {
        expect(activities[i - 1].created_at.getTime()).toBeGreaterThanOrEqual(
          activities[i].created_at.getTime()
        );
      }
    });
  });

  describe('getKPIMetrics', () => {
    it('should calculate KPI metrics', async () => {
      await createTestData();

      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const dateTo = new Date();

      const kpis = await getKPIMetrics(dateFrom, dateTo);

      expect(kpis.stock_available).toBeGreaterThan(0);
      expect(typeof kpis.stock_available).toBe('number');
      expect(kpis.daily_inflow).toBeGreaterThanOrEqual(0);
      expect(kpis.daily_outflow).toBeGreaterThanOrEqual(0);
      expect(kpis.average_daily_production).toBeGreaterThanOrEqual(0);
      expect(kpis.average_daily_barging).toBeGreaterThanOrEqual(0);
      expect(kpis.fuel_efficiency).toBeGreaterThanOrEqual(0);
    });

    it('should use default date range when not provided', async () => {
      await createTestData();

      const kpis = await getKPIMetrics();

      expect(kpis.stock_available).toBeGreaterThan(0);
      expect(typeof kpis.stock_available).toBe('number');
    });

    it('should calculate net change correctly', async () => {
      await createTestData();

      const kpis = await getKPIMetrics();

      expect(typeof kpis.net_change).toBe('number');
      // Net change should be total production minus total barging over the period
      expect(kpis.net_change).toBeGreaterThanOrEqual(0);
      
      // Verify that daily averages are calculated correctly
      expect(kpis.daily_inflow).toEqual(kpis.average_daily_production);
      expect(kpis.daily_outflow).toEqual(kpis.average_daily_barging);
    });
  });

  describe('getStockTrends', () => {
    it('should return stock trend data', async () => {
      await createTestData();

      const trends = await getStockTrends(7);

      expect(trends).toHaveLength(7);
      
      trends.forEach(trend => {
        expect(trend.date).toBeInstanceOf(Date);
        expect(typeof trend.total_stock).toBe('number');
        expect(typeof trend.production).toBe('number');
        expect(typeof trend.barging).toBe('number');
        expect(typeof trend.net_change).toBe('number');
        expect(trend.net_change).toEqual(trend.production - trend.barging);
      });
    });

    it('should generate correct date sequence', async () => {
      const trends = await getStockTrends(5);

      expect(trends).toHaveLength(5);
      
      // Verify dates are in ascending order
      for (let i = 1; i < trends.length; i++) {
        const prevDate = trends[i - 1].date.getTime();
        const currentDate = trends[i].date.getTime();
        expect(currentDate).toBeGreaterThan(prevDate);
      }
    });
  });

  describe('getContractorPerformance', () => {
    it('should return contractor performance metrics', async () => {
      await createTestData();

      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const dateTo = new Date();

      const performance = await getContractorPerformance(dateFrom, dateTo);

      expect(performance.length).toBeGreaterThan(0);
      
      performance.forEach(p => {
        expect(typeof p.contractor_id).toBe('number');
        expect(typeof p.contractor_name).toBe('string');
        expect(typeof p.total_production).toBe('number');
        expect(typeof p.total_barging).toBe('number');
        expect(typeof p.current_stock).toBe('number');
        expect(typeof p.production_days).toBe('number');
        expect(typeof p.average_daily_production).toBe('number');
      });

      // Find a contractor with production data
      const contractorWithProduction = performance.find(p => p.total_production > 0);
      if (contractorWithProduction && contractorWithProduction.production_days > 0) {
        expect(contractorWithProduction.average_daily_production).toEqual(
          contractorWithProduction.total_production / contractorWithProduction.production_days
        );
      }
    });

    it('should use default date range when not provided', async () => {
      await createTestData();

      const performance = await getContractorPerformance();

      expect(performance.length).toBeGreaterThan(0);
    });

    it('should handle contractors with no data', async () => {
      const { contractors } = await createTestData();

      // Create a contractor with no production/barging data
      await db.insert(contractorsTable).values({
        name: 'Inactive Contractor',
        code: 'C003',
        contact_person: 'No One',
        default_grade: 'low'
      }).execute();

      const performance = await getContractorPerformance();

      // Should only return contractors with production data
      const contractorNames = performance.map(p => p.contractor_name);
      expect(contractorNames).not.toContain('Inactive Contractor');
    });
  });
});