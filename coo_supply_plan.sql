/*
  COO SUPPLY PLAN
  ----------------
  Output grain: one row per item.

  The result is intentionally free of subtotal/grand-total rows so it can be
  loaded directly into a dashboard or BI model.  Use supply_type to filter:

    MAKE = finished goods and manufactured subassemblies
    BUY  = raw materials/components that must be purchased

  Important planning assumptions:
    1. The historical component usage is used as the BOM ratio because this
       database does not expose a separate BOM-master table in the original
       query.
    2. Finished-good stock is netted against manufacture demand.
    3. Raw-material stock, safety stock and lead-time demand are netted
       against purchase demand.
    4. Open purchase orders, reservations and in-process manufacturing are
       not included because their source tables were not present in the
       original query. Add them to current_stock_qty when available.
*/

WITH RECURSIVE
Params AS (
    SELECT
        '2022' AS exclude_years,
        2.0 AS recency_half_life,
        0.5 AS trend_weight,
        1.65 AS service_z,
        30 AS lead_time_days,
        1.0 AS default_lot_size,
        10 AS max_bom_level,
        YEAR(CURDATE()) AS this_year,
        YEAR(CURDATE()) + 1 AS next_year
),

/* Net approved sales by product and year. */
RawProductYearSales AS (
    SELECT
        f.product_id,
        YEAR(h.invoiceDate) AS sale_year,
        SUM(
            GREATEST(
                f.productQuantity - COALESCE(r.total_returned_qty, 0),
                0
            )
        ) AS yearly_net_qty
    FROM topchemicalpest.invoice_footers AS f
    JOIN topchemicalpest.invoice_headers AS h
        ON h.id = f.invoice_header_id
    LEFT JOIN (
        SELECT
            invoice_id,
            product_id,
            SUM(quantity) AS total_returned_qty
        FROM topchemicalpest.item_returns
        GROUP BY invoice_id, product_id
    ) AS r
        ON r.invoice_id = h.id
       AND r.product_id = f.product_id
    WHERE h.status = 'approved'
      AND h.deleted_at IS NULL
      AND f.deleted_at IS NULL
      AND f.productQuantity <> 0
      AND h.client_id NOT IN (844, 761, 674, 510, 423, 104, 513)
    GROUP BY f.product_id, YEAR(h.invoiceDate)
),

SalesHistory AS (
    SELECT
        s.product_id,
        s.sale_year,
        s.yearly_net_qty,
        POW(
            0.5,
            (p.this_year - s.sale_year) / p.recency_half_life
        ) AS recency_weight
    FROM RawProductYearSales AS s
    CROSS JOIN Params AS p
    WHERE s.sale_year < p.this_year
      AND FIND_IN_SET(s.sale_year, p.exclude_years) = 0
),

SalesForecastStats AS (
    SELECT
        h.product_id,
        COUNT(*) AS history_years,
        MAX(h.sale_year) AS last_sales_year,
        SUM(h.yearly_net_qty * h.recency_weight)
            / NULLIF(SUM(h.recency_weight), 0) AS weighted_avg_qty,
        STDDEV_SAMP(h.yearly_net_qty) AS stddev_annual_qty,
        (
            COUNT(*) * SUM(h.sale_year * h.yearly_net_qty)
            - SUM(h.sale_year) * SUM(h.yearly_net_qty)
        ) / NULLIF(
            COUNT(*) * SUM(h.sale_year * h.sale_year)
            - POW(SUM(h.sale_year), 2),
            0
        ) AS trend_slope,
        (
            SUM(h.yearly_net_qty)
            - (
                (
                    COUNT(*) * SUM(h.sale_year * h.yearly_net_qty)
                    - SUM(h.sale_year) * SUM(h.yearly_net_qty)
                ) / NULLIF(
                    COUNT(*) * SUM(h.sale_year * h.sale_year)
                    - POW(SUM(h.sale_year), 2),
                    0
                )
            ) * SUM(h.sale_year)
        ) / COUNT(*) AS trend_intercept
    FROM SalesHistory AS h
    GROUP BY h.product_id
),

CurrentYearSales AS (
    SELECT
        s.product_id,
        s.yearly_net_qty AS current_year_actual
    FROM RawProductYearSales AS s
    CROSS JOIN Params AS p
    WHERE s.sale_year = p.this_year
),

SalesProductIds AS (
    SELECT product_id
    FROM SalesForecastStats

    UNION

    SELECT product_id
    FROM CurrentYearSales

    UNION

    /* Keep products present in the approved sales source even when the
       statistical history is too short to create a forecast row. */
    SELECT s.product_id
    FROM RawProductYearSales AS s
    CROSS JOIN Params AS p
    WHERE s.sale_year <= p.this_year
      AND FIND_IN_SET(s.sale_year, p.exclude_years) = 0
),

SalesForecast AS (
    SELECT
        i.product_id,
        COALESCE(st.history_years, 0) AS sales_history_years,
        st.last_sales_year,
        COALESCE(
            st.weighted_avg_qty,
            cy.current_year_actual,
            0
        ) AS weighted_avg_qty,
        COALESCE(st.stddev_annual_qty, 0) AS stddev_annual_qty,
        GREATEST(
            p.trend_weight * (
                COALESCE(st.trend_slope, 0) * p.this_year
                + COALESCE(
                    st.trend_intercept,
                    COALESCE(st.weighted_avg_qty, cy.current_year_actual, 0)
                )
            )
            + (1 - p.trend_weight)
                * COALESCE(st.weighted_avg_qty, cy.current_year_actual, 0),
            COALESCE(cy.current_year_actual, 0)
        ) AS forecast_this_year_total,
        GREATEST(
            p.trend_weight * (
                COALESCE(st.trend_slope, 0) * p.next_year
                + COALESCE(
                    st.trend_intercept,
                    COALESCE(st.weighted_avg_qty, cy.current_year_actual, 0)
                )
            )
            + (1 - p.trend_weight)
                * COALESCE(st.weighted_avg_qty, cy.current_year_actual, 0),
            COALESCE(cy.current_year_actual, 0)
        ) AS forecast_next_year_total,
        COALESCE(cy.current_year_actual, 0) AS current_year_actual
    FROM SalesProductIds AS i
    CROSS JOIN Params AS p
    LEFT JOIN SalesForecastStats AS st
        ON st.product_id = i.product_id
    LEFT JOIN CurrentYearSales AS cy
        ON cy.product_id = i.product_id
),

SalesDemand AS (
    SELECT
        sf.product_id,
        sf.sales_history_years,
        sf.last_sales_year,
        sf.weighted_avg_qty,
        sf.stddev_annual_qty,
        sf.forecast_this_year_total,
        sf.current_year_actual,
        sf.forecast_next_year_total,
        GREATEST(
            sf.forecast_this_year_total - sf.current_year_actual,
            0
        ) AS direct_need_this_year,
        sf.forecast_next_year_total AS direct_need_next_year
    FROM SalesForecast AS sf
),

/* Historical manufacturing is used to identify manufactured products. */
RawProductYearMfg AS (
    SELECT
        mh.product_id,
        YEAR(mh.updated_at) AS mfg_year,
        SUM(mh.deliver_quantity) AS yearly_mfg_qty
    FROM topchemicalpest.manufacture_headers AS mh
    WHERE mh.deliver_quantity <> 0
    GROUP BY mh.product_id, YEAR(mh.updated_at)
),

MfgHistory AS (
    SELECT
        m.product_id,
        m.mfg_year,
        m.yearly_mfg_qty,
        POW(
            0.5,
            (p.this_year - m.mfg_year) / p.recency_half_life
        ) AS recency_weight
    FROM RawProductYearMfg AS m
    CROSS JOIN Params AS p
    WHERE m.mfg_year < p.this_year
      AND FIND_IN_SET(m.mfg_year, p.exclude_years) = 0
),

MfgForecast AS (
    SELECT
        h.product_id,
        COUNT(*) AS manufacture_history_years,
        MAX(h.mfg_year) AS last_manufacture_year,
        SUM(h.yearly_mfg_qty * h.recency_weight)
            / NULLIF(SUM(h.recency_weight), 0) AS avg_manufactured_qty
    FROM MfgHistory AS h
    GROUP BY h.product_id
),

CurrentYearManufacturedProducts AS (
    SELECT DISTINCT
        m.product_id
    FROM RawProductYearMfg AS m
    CROSS JOIN Params AS p
    WHERE m.mfg_year = p.this_year
),

/*
  Infer an effective unit BOM ratio from historical manufacturing usage.
  For example, if 2 kg of component X were used per finished unit, unit_ratio
  will be approximately 2.
*/
RawCompYearUsageByParent AS (
    SELECT
        mh.product_id AS finished_id,
        mf.product_id AS comp_id,
        YEAR(mh.updated_at) AS usage_year,
        SUM(mf.productQuantity) AS yearly_comp_qty
    FROM topchemicalpest.manufacture_footers AS mf
    JOIN topchemicalpest.manufacture_headers AS mh
        ON mh.id = mf.manufacture_header_id
    WHERE mf.productQuantity <> 0
    GROUP BY mh.product_id, mf.product_id, YEAR(mh.updated_at)
),

CompUsageHistoryByParent AS (
    SELECT
        u.finished_id,
        u.comp_id,
        u.usage_year,
        u.yearly_comp_qty,
        POW(
            0.5,
            (p.this_year - u.usage_year) / p.recency_half_life
        ) AS recency_weight
    FROM RawCompYearUsageByParent AS u
    CROSS JOIN Params AS p
    WHERE u.usage_year < p.this_year
      AND FIND_IN_SET(u.usage_year, p.exclude_years) = 0
),

CompUsageRatio AS (
    SELECT
        h.finished_id,
        h.comp_id,
        SUM(h.yearly_comp_qty * h.recency_weight)
            / NULLIF(SUM(h.recency_weight), 0) AS avg_component_usage_qty
    FROM CompUsageHistoryByParent AS h
    GROUP BY h.finished_id, h.comp_id
),

BOMRatio AS (
    SELECT
        u.finished_id,
        u.comp_id,
        u.avg_component_usage_qty
            / NULLIF(m.avg_manufactured_qty, 0) AS unit_ratio
    FROM CompUsageRatio AS u
    JOIN MfgForecast AS m
        ON m.product_id = u.finished_id
    WHERE m.avg_manufactured_qty > 0
),

BOMEvidence AS (
    SELECT
        b.comp_id AS product_id,
        COUNT(DISTINCT b.finished_id) AS parent_product_count,
        AVG(b.unit_ratio) AS average_unit_ratio_from_parent
    FROM BOMRatio AS b
    GROUP BY b.comp_id
),

ManufacturedProducts AS (
    SELECT product_id FROM MfgForecast
    UNION
    SELECT product_id FROM CurrentYearManufacturedProducts
    UNION
    SELECT finished_id AS product_id FROM BOMRatio
),

/*
  Finished-good manufacture plan.  This is deliberately calculated before
  exploding the BOM so finished-good stock reduces component requirements.
*/
RootManufacturePlan AS (
    SELECT
        mp.product_id,
        COALESCE(sd.direct_need_this_year, 0) AS direct_need_this_year,
        COALESCE(sd.direct_need_next_year, 0) AS direct_need_next_year,
        COALESCE(sd.stddev_annual_qty, 0) AS stddev_annual_qty,
        COALESCE(pq.current_qty, 0) AS current_stock,
        GREATEST(
            CEILING(
                (
                    COALESCE(sd.direct_need_this_year, 0)
                    + p.service_z * COALESCE(sd.stddev_annual_qty, 0)
                        * SQRT(p.lead_time_days / 365)
                    - COALESCE(pq.current_qty, 0)
                ) / p.default_lot_size
            ) * p.default_lot_size,
            0
        ) AS root_make_qty_this_year,
        GREATEST(
            CEILING(
                (
                    COALESCE(sd.direct_need_next_year, 0)
                    + p.service_z * COALESCE(sd.stddev_annual_qty, 0)
                ) / p.default_lot_size
            ) * p.default_lot_size,
            0
        ) AS root_make_qty_next_year
    FROM ManufacturedProducts AS mp
    CROSS JOIN Params AS p
    LEFT JOIN SalesDemand AS sd
        ON sd.product_id = mp.product_id
    LEFT JOIN topchemicalpest.product_current_quantity AS pq
        ON pq.id = mp.product_id
    WHERE COALESCE(sd.direct_need_this_year, 0) > 0
       OR COALESCE(sd.direct_need_next_year, 0) > 0
),

/* Recursive BOM explosion.  One row represents one root-to-component path. */
BOMExplosion AS (
    SELECT
        b.finished_id AS root_product_id,
        b.comp_id AS component_product_id,
        1 AS bom_level,
        b.unit_ratio AS cumulative_ratio,
        CONCAT(b.finished_id, ',', b.comp_id) AS path_guard
    FROM BOMRatio AS b
    JOIN RootManufacturePlan AS r
        ON r.product_id = b.finished_id

    UNION ALL

    SELECT
        e.root_product_id,
        b.comp_id AS component_product_id,
        e.bom_level + 1 AS bom_level,
        e.cumulative_ratio * b.unit_ratio AS cumulative_ratio,
        CONCAT(e.path_guard, ',', b.comp_id) AS path_guard
    FROM BOMExplosion AS e
    JOIN BOMRatio AS b
        ON b.finished_id = e.component_product_id
    CROSS JOIN Params AS p
    WHERE e.bom_level < p.max_bom_level
      AND FIND_IN_SET(b.comp_id, e.path_guard) = 0
),

DependentNeed AS (
    SELECT
        e.component_product_id AS product_id,
        SUM(
            r.root_make_qty_this_year * e.cumulative_ratio
        ) AS dependent_need_this_year,
        SUM(
            r.root_make_qty_next_year * e.cumulative_ratio
        ) AS dependent_need_next_year,
        SQRT(
            SUM(
                POW(
                    COALESCE(sd.stddev_annual_qty, 0)
                    * e.cumulative_ratio,
                    2
                )
            )
        ) AS dependent_stddev
    FROM BOMExplosion AS e
    JOIN RootManufacturePlan AS r
        ON r.product_id = e.root_product_id
    LEFT JOIN SalesDemand AS sd
        ON sd.product_id = e.root_product_id
    GROUP BY e.component_product_id
),

ComponentCandidates AS (
    SELECT product_id
    FROM DependentNeed

    UNION

    SELECT sd.product_id
    FROM SalesDemand AS sd
    WHERE NOT EXISTS (
        SELECT 1
        FROM ManufacturedProducts AS mp
        WHERE mp.product_id = sd.product_id
    )
),

PlanningItems AS (
    SELECT product_id FROM ManufacturedProducts
    UNION
    SELECT product_id FROM ComponentCandidates
    UNION
    /* Always retain products with sales demand, even when no BOM was found. */
    SELECT product_id FROM SalesDemand
),

ItemPlanning AS (
    SELECT
        i.product_id,
        pdt.name_ar AS item_name,
        pdt.category_id,
        cat.name_ar AS category_name,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM ManufacturedProducts AS mp
                WHERE mp.product_id = i.product_id
            ) THEN 0
            ELSE 1
        END AS is_raw_material,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM BOMRatio AS br
                WHERE br.finished_id = i.product_id
            ) THEN 1
            ELSE 0
        END AS has_bom,
        COALESCE(sd.sales_history_years, 0) AS sales_history_years,
        sd.last_sales_year,
        COALESCE(sd.weighted_avg_qty, 0) AS weighted_sales_average_qty,
        COALESCE(sd.forecast_this_year_total, 0) AS forecast_this_year_qty,
        COALESCE(sd.current_year_actual, 0) AS sales_actual_this_year_qty,
        COALESCE(sd.forecast_next_year_total, 0) AS forecast_next_year_qty,
        COALESCE(sd.direct_need_this_year, 0) AS direct_need_this_year,
        COALESCE(sd.direct_need_next_year, 0) AS direct_need_next_year,
        COALESCE(dn.dependent_need_this_year, 0) AS dependent_need_this_year,
        COALESCE(dn.dependent_need_next_year, 0) AS dependent_need_next_year,
        COALESCE(sd.stddev_annual_qty, 0) AS direct_stddev,
        COALESCE(dn.dependent_stddev, 0) AS dependent_stddev,
        COALESCE(mf.manufacture_history_years, 0) AS manufacture_history_years,
        mf.last_manufacture_year,
        COALESCE(mf.avg_manufactured_qty, 0) AS average_manufactured_qty,
        COALESCE(be.parent_product_count, 0) AS parent_product_count,
        COALESCE(be.average_unit_ratio_from_parent, 0)
            AS average_unit_ratio_from_parent,
        COALESCE(pq.current_qty, 0) AS current_stock
    FROM PlanningItems AS i
    LEFT JOIN topchemicalpest.products AS pdt
        ON pdt.id = i.product_id
    LEFT JOIN topchemicalpest.categories AS cat
        ON cat.id = pdt.category_id
    LEFT JOIN SalesDemand AS sd
        ON sd.product_id = i.product_id
    LEFT JOIN MfgForecast AS mf
        ON mf.product_id = i.product_id
    LEFT JOIN DependentNeed AS dn
        ON dn.product_id = i.product_id
    LEFT JOIN BOMEvidence AS be
        ON be.product_id = i.product_id
    LEFT JOIN topchemicalpest.product_current_quantity AS pq
        ON pq.id = i.product_id
),

CalculatedPlan AS (
    SELECT
        ip.*,
        ip.direct_need_this_year + ip.dependent_need_this_year
            AS total_need_this_year,
        ip.direct_need_next_year + ip.dependent_need_next_year
            AS total_need_next_year,
        SQRT(
            POW(ip.direct_stddev, 2)
            + POW(ip.dependent_stddev, 2)
        ) AS combined_stddev,
        p.service_z,
        p.lead_time_days,
        p.default_lot_size,
        p.this_year,
        p.next_year,
        CASE
            WHEN ip.direct_need_this_year + ip.dependent_need_this_year > 0
            THEN ip.current_stock
                 / ((ip.direct_need_this_year
                     + ip.dependent_need_this_year) / 365)
            ELSE NULL
        END AS stock_coverage_days
    FROM ItemPlanning AS ip
    CROSS JOIN Params AS p
),

PlanWithQuantities AS (
    SELECT
        cp.*,
        cp.service_z * cp.combined_stddev
            * SQRT(cp.lead_time_days / 365) AS safety_stock,
        cp.total_need_this_year / 365 * cp.lead_time_days
            AS lead_time_demand,
        GREATEST(
            CEILING(
                (
                    cp.total_need_this_year
                    + cp.service_z * cp.combined_stddev
                        * SQRT(cp.lead_time_days / 365)
                    + CASE
                        WHEN cp.is_raw_material = 1
                        THEN cp.total_need_this_year / 365 * cp.lead_time_days
                        ELSE 0
                      END
                    - cp.current_stock
                ) / cp.default_lot_size
            ) * cp.default_lot_size,
            0
        ) AS suggested_qty_this_year,
        GREATEST(
            CEILING(
                (
                    cp.total_need_next_year
                    + cp.service_z * cp.combined_stddev
                ) / cp.default_lot_size
            ) * cp.default_lot_size,
            0
        ) AS suggested_qty_next_year
    FROM CalculatedPlan AS cp
),

PurchasePlanTotals AS (
    SELECT
        SUM(
            CASE
                WHEN is_raw_material = 1 THEN suggested_qty_this_year
                ELSE 0
            END
        ) AS total_buy_qty
    FROM PlanWithQuantities
),

PurchasePlanRanked AS (
    SELECT
        q.*,
        t.total_buy_qty,
        (
            SELECT SUM(q2.suggested_qty_this_year)
            FROM PlanWithQuantities AS q2
            WHERE q2.is_raw_material = 1
              AND (
                    q2.suggested_qty_this_year > q.suggested_qty_this_year
                    OR (
                        q2.suggested_qty_this_year = q.suggested_qty_this_year
                        AND q2.product_id <= q.product_id
                    )
                  )
        ) AS cumulative_buy_qty
    FROM PlanWithQuantities AS q
    CROSS JOIN PurchasePlanTotals AS t
),

ScoredPlan AS (
    SELECT
        r.*,
        CASE
            WHEN r.is_raw_material = 1
             AND r.total_buy_qty > 0
            THEN
                CASE
                    WHEN r.cumulative_buy_qty / r.total_buy_qty <= 0.80
                    THEN 'A'
                    WHEN r.cumulative_buy_qty / r.total_buy_qty <= 0.95
                    THEN 'B'
                    ELSE 'C'
                END
            ELSE NULL
        END AS abc_class
    FROM PurchasePlanRanked AS r
)

SELECT
    CASE
        WHEN sp.is_raw_material = 1 THEN 'BUY'
        ELSE 'MAKE'
    END AS supply_type,
    CASE
        WHEN sp.is_raw_material = 1 THEN 'RAW_MATERIAL'
        WHEN sp.has_bom = 1 THEN 'MANUFACTURED_COMPONENT'
        ELSE 'FINISHED_GOOD'
    END AS item_role,
    sp.this_year AS plan_year,
    sp.product_id AS item_id,
    sp.item_name,
    sp.category_id,
    sp.category_name,
    sp.is_raw_material,
    sp.has_bom,
    sp.sales_history_years,
    sp.last_sales_year,
    ROUND(sp.weighted_sales_average_qty, 2)
        AS weighted_sales_average_qty,
    ROUND(sp.forecast_this_year_qty, 2)
        AS forecast_this_year_qty,
    ROUND(sp.sales_actual_this_year_qty, 2)
        AS sales_actual_this_year_qty,
    ROUND(sp.forecast_next_year_qty, 2)
        AS forecast_next_year_qty,
    ROUND(
        CASE
            WHEN sp.forecast_this_year_qty > 0
            THEN (sp.forecast_next_year_qty - sp.forecast_this_year_qty)
                 / sp.forecast_this_year_qty * 100
            ELSE NULL
        END,
        2
    ) AS forecast_growth_next_year_pct,
    sp.manufacture_history_years,
    sp.last_manufacture_year,
    ROUND(sp.average_manufactured_qty, 2)
        AS average_manufactured_qty,
    sp.parent_product_count,
    ROUND(sp.average_unit_ratio_from_parent, 4)
        AS average_unit_ratio_from_parent,
    ROUND(sp.direct_need_this_year, 2) AS direct_need_qty,
    ROUND(sp.dependent_need_this_year, 2) AS dependent_need_qty,
    ROUND(sp.total_need_this_year, 2) AS total_need_qty,
    ROUND(sp.current_stock, 2) AS current_stock_qty,
    ROUND(sp.safety_stock, 2) AS safety_stock_qty,
    ROUND(sp.lead_time_demand, 2) AS lead_time_demand_qty,
    ROUND(sp.stock_coverage_days, 1) AS stock_coverage_days,
    ROUND(
        CASE
            WHEN sp.total_need_this_year > 0
            THEN sp.dependent_need_this_year / sp.total_need_this_year * 100
            ELSE 0
        END,
        2
    ) AS dependent_demand_share_pct,
    CASE
        WHEN sp.is_raw_material = 1 THEN 0
        ELSE sp.suggested_qty_this_year
    END AS suggested_make_qty,
    CASE
        WHEN sp.is_raw_material = 1 THEN sp.suggested_qty_this_year
        ELSE 0
    END AS suggested_buy_qty,
    ROUND(
        GREATEST(
            sp.total_need_this_year
            + sp.safety_stock
            + CASE
                WHEN sp.is_raw_material = 1 THEN sp.lead_time_demand
                ELSE 0
              END
            - sp.current_stock,
            0
        ),
        2
    ) AS uncovered_qty_before_action,
    sp.abc_class,
    CASE
        WHEN sp.sales_history_years >= 3
         AND (
             sp.is_raw_material = 1
             OR sp.manufacture_history_years >= 2
         ) THEN 'HIGH'
        WHEN sp.sales_history_years >= 2
          OR sp.manufacture_history_years >= 1 THEN 'MEDIUM'
        ELSE 'LOW_DATA'
    END AS decision_confidence,
    CASE
        WHEN sp.suggested_qty_this_year > 0 THEN 'ACTION_REQUIRED'
        ELSE 'NO_ACTION'
    END AS decision_status,
    CASE
        WHEN sp.suggested_qty_this_year > 0
         AND sp.is_raw_material = 1 THEN CONCAT(
            'BUY ', FORMAT(sp.suggested_qty_this_year, 2),
            ': need ', FORMAT(sp.total_need_this_year, 2),
            ' + safety ', FORMAT(sp.safety_stock, 2),
            ' + lead-time ', FORMAT(sp.lead_time_demand, 2),
            ' - stock ', FORMAT(sp.current_stock, 2),
            '. Sales history ', sp.sales_history_years,
            ' year(s); dependent demand is ',
            FORMAT(sp.dependent_need_this_year, 2), '.'
        )
        WHEN sp.suggested_qty_this_year > 0 THEN CONCAT(
            'MAKE ', FORMAT(sp.suggested_qty_this_year, 2),
            ': direct need ', FORMAT(sp.direct_need_this_year, 2),
            ' + dependent need ', FORMAT(sp.dependent_need_this_year, 2),
            ' + safety ', FORMAT(sp.safety_stock, 2),
            ' - stock ', FORMAT(sp.current_stock, 2),
            '. Sales forecast is ',
            FORMAT(sp.forecast_this_year_qty, 2),
            ' versus actual ',
            FORMAT(sp.sales_actual_this_year_qty, 2),
            '; manufacturing history is ',
            sp.manufacture_history_years, ' year(s).'
        )
        ELSE CONCAT(
            'NO ACTION: stock ', FORMAT(sp.current_stock, 2),
            ' covers need ', FORMAT(sp.total_need_this_year, 2),
            ' plus safety/lead-time buffers. Forecast is ',
            FORMAT(sp.forecast_this_year_qty, 2),
            '; sales history is ', sp.sales_history_years,
            ' year(s).'
        )
    END AS decision_explanation,
    sp.next_year AS next_plan_year,
    ROUND(sp.direct_need_next_year, 2) AS next_year_direct_need_qty,
    ROUND(sp.dependent_need_next_year, 2) AS next_year_dependent_need_qty,
    ROUND(sp.total_need_next_year, 2) AS next_year_total_need_qty,
    CASE
        WHEN sp.is_raw_material = 1 THEN 0
        ELSE sp.suggested_qty_next_year
    END AS next_year_suggested_make_qty,
    CASE
        WHEN sp.is_raw_material = 1 THEN sp.suggested_qty_next_year
        ELSE 0
    END AS next_year_suggested_buy_qty
FROM ScoredPlan AS sp
ORDER BY
    CASE WHEN sp.suggested_qty_this_year > 0 THEN 0 ELSE 1 END,
    sp.is_raw_material,
    sp.suggested_qty_this_year DESC,
    sp.product_id;
