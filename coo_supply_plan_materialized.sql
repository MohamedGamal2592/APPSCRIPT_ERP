/*
  MATERIALIZED COO PLAN
  ======================

  Purpose:
    Keep the existing, accurate recursive query, but execute it only during a
    refresh.  Apps Script reads the physical cache through the lightweight
    COO_TEST view.

  Run section 1 once.
  Run section 2 whenever the plan must be refreshed, or schedule it hourly.

  The existing heavy view is renamed to COO_TEST_CALC and is kept as the
  calculation source.  COO_TEST becomes the fast public view.
*/

USE topchemicalpest;

/* ================================================================
   1) ONE-TIME SETUP
   ================================================================ */

/* Preserve the current heavy view. Run this only once. */
RENAME TABLE topchemicalpest.COO_TEST
    TO topchemicalpest.COO_TEST_CALC;

/* Build the initial physical snapshot. This is the only slow step. */
DROP TABLE IF EXISTS topchemicalpest.coo_supply_plan_cache;

CREATE TABLE topchemicalpest.coo_supply_plan_cache AS
SELECT
    c.*,
    NOW() AS cache_refreshed_at
FROM topchemicalpest.COO_TEST_CALC AS c;

ALTER TABLE topchemicalpest.coo_supply_plan_cache
    ADD INDEX idx_coo_cache_plan_year (plan_year),
    ADD INDEX idx_coo_cache_item_id (item_id),
    ADD INDEX idx_coo_cache_supply_type (supply_type),
    ADD INDEX idx_coo_cache_decision_status (decision_status);

/* Public view used by Apps Script and dashboards. */
CREATE OR REPLACE VIEW topchemicalpest.COO_TEST AS
SELECT *
FROM topchemicalpest.coo_supply_plan_cache;

/* ================================================================
   2) REFRESH SCRIPT
   ================================================================

   Run this section later whenever new sales, manufacturing or stock data is
   available. It calculates into a staging table first, then swaps the tables
   so readers never see a half-filled cache.
*/

DROP TABLE IF EXISTS topchemicalpest.coo_supply_plan_cache_next;

CREATE TABLE topchemicalpest.coo_supply_plan_cache_next AS
SELECT
    c.*,
    NOW() AS cache_refreshed_at
FROM topchemicalpest.COO_TEST_CALC AS c;

ALTER TABLE topchemicalpest.coo_supply_plan_cache_next
    ADD INDEX idx_coo_cache_plan_year (plan_year),
    ADD INDEX idx_coo_cache_item_id (item_id),
    ADD INDEX idx_coo_cache_supply_type (supply_type),
    ADD INDEX idx_coo_cache_decision_status (decision_status);

DROP TABLE IF EXISTS topchemicalpest.coo_supply_plan_cache_old;

RENAME TABLE
    topchemicalpest.coo_supply_plan_cache
        TO topchemicalpest.coo_supply_plan_cache_old,
    topchemicalpest.coo_supply_plan_cache_next
        TO topchemicalpest.coo_supply_plan_cache;

DROP TABLE topchemicalpest.coo_supply_plan_cache_old;

/* ================================================================
   3) FAST APPS SCRIPT QUERY
   ================================================================ */

SELECT
    *
FROM topchemicalpest.COO_TEST
WHERE plan_year = YEAR(CURDATE())
ORDER BY
    CASE WHEN decision_status = 'ACTION_REQUIRED' THEN 0 ELSE 1 END,
    suggested_make_qty DESC,
    suggested_buy_qty DESC,
    item_id;
