-- 00_ingest.sql — raw_* views over data/raw/*.csv (SPEC §5.1). Views, not tables: 10_staging reads each CSV once.
CREATE OR REPLACE VIEW raw_groups           AS SELECT * FROM read_csv_auto('${raw_dir}/groups.csv', header = true);
CREATE OR REPLACE VIEW raw_companies        AS SELECT * FROM read_csv_auto('${raw_dir}/companies.csv', header = true);
CREATE OR REPLACE VIEW raw_banking_products AS SELECT * FROM read_csv_auto('${raw_dir}/banking_products.csv', header = true);
CREATE OR REPLACE VIEW raw_debt_products    AS SELECT * FROM read_csv_auto('${raw_dir}/debt_products.csv', header = true);
CREATE OR REPLACE VIEW raw_debt_schedule    AS SELECT * FROM read_csv_auto('${raw_dir}/debt_schedule_config.csv', header = true);
CREATE OR REPLACE VIEW raw_balances         AS SELECT * FROM read_csv_auto('${raw_dir}/balances.csv', header = true);
CREATE OR REPLACE VIEW raw_transactions     AS SELECT * FROM read_csv_auto('${raw_dir}/transactions.csv', header = true);
CREATE OR REPLACE VIEW raw_invoices         AS SELECT * FROM read_csv_auto('${raw_dir}/invoices.csv', header = true);
