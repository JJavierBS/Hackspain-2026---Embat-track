package com.xray.pipeline;

import com.xray.infrastructure.duckdb.DuckDbDataSource;
import com.xray.infrastructure.duckdb.DuckDbSqlRunner;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** A hand-built 2-company group: group ratios come from summed components (ARCHITECTURE §9). */
class RollupTest {

    /** Verbatim copy of overview contract item 8. */
    private static final List<String> CONTRACT_DDL = List.of(
            "CREATE OR REPLACE TABLE stg_companies (company_id VARCHAR, group_id VARCHAR, currency VARCHAR)",
            "CREATE OR REPLACE TABLE months (month_idx INTEGER, month VARCHAR, month_start DATE, month_end DATE)",
            "CREATE OR REPLACE TABLE daily_cash (company_id VARCHAR, date DATE, cash_eur DOUBLE, investment_eur DOUBLE)",
            """
            CREATE OR REPLACE TABLE monthly_flows (
              entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, flow_class VARCHAR, is_intragroup BOOLEAN,
              inflow_eur DOUBLE, outflow_eur DOUBLE, n_txn BIGINT)""",
            """
            CREATE OR REPLACE TABLE monthly_cash (
              entity_type VARCHAR, entity_id VARCHAR, month VARCHAR,
              cash_eom DOUBLE, cash_min DOUBLE, neg_days INTEGER, investment_eom DOUBLE)""",
            """
            CREATE OR REPLACE TABLE monthly_invoices (
              entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, direction VARCHAR, is_intragroup BOOLEAN,
              new_eur DOUBLE, n_new BIGINT,
              paid_eur DOUBLE, n_paid BIGINT, paid_days_x_eur DOUBLE, paid_late_days_x_eur DOUBLE,
              open_eur DOUBLE, due_90d_unpaid_eur DOUBLE,
              overdue_eur DOUBLE, overdue_0_30_eur DOUBLE, overdue_31_60_eur DOUBLE,
              overdue_61_90_eur DOUBLE, overdue_90p_eur DOUBLE)""",
            """
            CREATE OR REPLACE TABLE monthly_counterparty (
              entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, counterparty_id VARCHAR,
              direction VARCHAR, is_intragroup BOOLEAN, amount_eur DOUBLE, n_txn BIGINT)""",
            """
            CREATE OR REPLACE TABLE debt_snapshot (
              entity_type VARCHAR, entity_id VARCHAR, debt_type VARCHAR, n_products BIGINT,
              granted_eur DOUBLE, outstanding_eur DOUBLE, liquidity_eur DOUBLE,
              rated_outstanding_eur DOUBLE, rate_x_outstanding_eur DOUBLE)""");

    private static DuckDbDataSource ds;
    private static JdbcTemplate jdbc;

    @BeforeAll
    static void buildGroupAndRollUp() throws Exception {
        ds = new DuckDbDataSource("jdbc:duckdb:");
        jdbc = new JdbcTemplate(ds);
        CONTRACT_DDL.forEach(jdbc::execute);

        jdbc.execute("INSERT INTO stg_companies VALUES ('COMP_A','GROUP_T','EUR'), ('COMP_B','GROUP_T','EUR')");

        // Receivables paid in 2025-01: A 10 M€ at 30 days, B 100 k€ at 120 days.
        // A also has a 1 M€ intragroup invoice at 300 days, which must not count.
        jdbc.execute("""
            INSERT INTO monthly_invoices (entity_type, entity_id, month, direction, is_intragroup, paid_eur, paid_days_x_eur) VALUES
              ('COMPANY','COMP_A','2025-01','ISSUED',FALSE,10000000, 300000000),
              ('COMPANY','COMP_B','2025-01','ISSUED',FALSE,  100000,  12000000),
              ('COMPANY','COMP_A','2025-01','ISSUED',TRUE,  1000000, 300000000)""");

        // Operating outflows: A pays 500 to B (intragroup) plus 1000 to a supplier; B pays 200.
        jdbc.execute("""
            INSERT INTO monthly_flows VALUES
              ('COMPANY','COMP_A','2025-01','OPERATING_OUT',FALSE,0,1000,3),
              ('COMPANY','COMP_A','2025-01','OPERATING_OUT',TRUE, 0, 500,1),
              ('COMPANY','COMP_B','2025-01','OPERATING_OUT',FALSE,0, 200,2)""");

        // Daily cash: A 100 then -50, B -20 then 200. Group days: 80, 150. Sum of minimums would be -70.
        jdbc.execute("""
            INSERT INTO daily_cash VALUES
              ('COMP_A', DATE '2025-01-30', 100, 0), ('COMP_A', DATE '2025-01-31', -50, 0),
              ('COMP_B', DATE '2025-01-30', -20, 0), ('COMP_B', DATE '2025-01-31', 200, 0)""");

        jdbc.execute("""
            INSERT INTO debt_snapshot VALUES
              ('COMPANY','COMP_A','loan',1,NULL,300,NULL,300,12),
              ('COMPANY','COMP_B','loan',1,NULL,100,NULL,NULL,NULL)""");

        new DuckDbSqlRunner(jdbc).runScript("sql/25_entity_rollup.sql", Map.of());
    }

    @AfterAll
    static void close() throws Exception {
        ds.close();
    }

    @Test
    void groupDsoIsAmountWeightedNotTheMeanOfCompanyDsos() {
        Double dso = jdbc.queryForObject("""
            SELECT paid_days_x_eur / paid_eur FROM monthly_invoices
            WHERE entity_type = 'GROUP' AND entity_id = 'GROUP_T' AND month = '2025-01' AND direction = 'ISSUED'""",
                Double.class);
        assertEquals(312_000_000.0 / 10_100_000.0, dso, 1e-9);   // ≈ 30.89
        assertTrue(dso < 31.0, "mean of ratios would be 75");
    }

    @Test
    void intragroupFlowsAreRemovedAtGroupLevel() {
        Double out = jdbc.queryForObject("""
            SELECT SUM(outflow_eur) FROM monthly_flows
            WHERE entity_type = 'GROUP' AND entity_id = 'GROUP_T' AND flow_class = 'OPERATING_OUT'""", Double.class);
        assertEquals(1200.0, out, 1e-9);
        Long intragroupRows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM monthly_flows WHERE entity_type = 'GROUP' AND is_intragroup", Long.class);
        assertEquals(0L, intragroupRows);
    }

    @Test
    void groupMinimumCashComesFromSummedDailyBalances() {
        Map<String, Object> row = jdbc.queryForMap("""
            SELECT cash_eom, cash_min, neg_days FROM monthly_cash
            WHERE entity_type = 'GROUP' AND entity_id = 'GROUP_T' AND month = '2025-01'""");
        assertEquals(150.0, ((Number) row.get("cash_eom")).doubleValue(), 1e-9);
        assertEquals(80.0, ((Number) row.get("cash_min")).doubleValue(), 1e-9);
        assertEquals(0, ((Number) row.get("neg_days")).intValue());
    }

    @Test
    void groupDebtSumsOutstandingAndKeepsTheRateComponents() {
        Map<String, Object> row = jdbc.queryForMap("""
            SELECT outstanding_eur, rated_outstanding_eur, rate_x_outstanding_eur FROM debt_snapshot
            WHERE entity_type = 'GROUP' AND entity_id = 'GROUP_T' AND debt_type = 'loan'""");
        assertEquals(400.0, ((Number) row.get("outstanding_eur")).doubleValue(), 1e-9);
        assertEquals(300.0, ((Number) row.get("rated_outstanding_eur")).doubleValue(), 1e-9);
        assertEquals(12.0, ((Number) row.get("rate_x_outstanding_eur")).doubleValue(), 1e-9);
    }

    @Test
    void everyCompanyAndGroupIsAnEntity() {
        Long companies = jdbc.queryForObject("SELECT COUNT(*) FROM entities WHERE entity_type = 'COMPANY'", Long.class);
        Long groups = jdbc.queryForObject("SELECT COUNT(*) FROM entities WHERE entity_type = 'GROUP'", Long.class);
        assertEquals(2L, companies);
        assertEquals(1L, groups);
    }
}
