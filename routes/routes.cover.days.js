import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      classification,
      sku,
      branch,
    } = req.query;

    const sql = `
WITH stk AS (
    SELECT
        COALESCE(dmpm.classification, 'Others') AS classification,
        SUM(dsmh.qty * dsmh.trade_price) AS inv_val,
        SUM(dsmh.qty * dsmh.item_cost) AS inv_val_efp,
        SUM(dsmh.qty) as quantity
    FROM daily_stock_movement_history dsmh
    LEFT OUTER JOIN vw_items_class  dmpm
        ON dmpm.mapping_code::TEXT =
           CASE
               WHEN item_code NOT LIKE 'F%' THEN (dsmh.item_code::int)::TEXT
               ELSE dsmh.item_code
           END
    LEFT OUTER JOIN sales_inv_locations sil ON sil.inv_sloc::TEXT = subinventory_code
    WHERE dsmh.stock_closing_date = (
              SELECT MAX(stock_closing_date)
              FROM daily_stock_movement_history d
              WHERE d.stock_closing_date BETWEEN :startDate AND :endDate
              AND d.busline_code IN ('P07','P08','P12')
          )
    AND dsmh.busline_code IN ('P07','P08','P12')
    AND dsmh.subinventory_code LIKE '80%'
    ${classification ? `AND dmpm.classification::text IN (:classification)` : ""}
    ${sku ? `AND dmpm.mapping_code::text IN (:sku)` : ""}
    ${branch ? `AND sil.inv_sloc::text IN (:branch)` : ""}
    AND qty <> 0
    GROUP BY dmpm.classification
),
filtered_targets AS (
    SELECT
    COALESCE(t03.classification, 'Others') AS classification,
    SUM(t01.target_value)                  AS trg_value
    FROM mv_tscl_spl_targets t01
    LEFT OUTER JOIN vw_items_class t03 ON t03.mapping_code::TEXT = t01.item_code::TEXT
    WHERE t01.target_date >= DATE_TRUNC('month', CAST(:endDate AS date))
      AND t01.target_date < DATE_TRUNC('month', CAST(:endDate AS date)) + INTERVAL '1 month'
    ${classification ? `AND t03.classification::text IN (:classification)` : ""}
    ${sku ? `AND t03.mapping_code::text IN (:sku)` : ""}
    ${branch ? `AND t01.loc_code::text IN (:branch)` : ""}
    GROUP BY COALESCE(t03.classification, 'Others')
),
days_calc AS (
    SELECT EXTRACT(DAY FROM (
        DATE_TRUNC('month', CAST(:endDate AS date)) + INTERVAL '1 month - 1 day'
    ))::int AS total_days_in_month
)
SELECT
    ft.classification,
    s.inv_val,
    s.inv_val_efp,
    ft.trg_value,
    s.quantity,
    ROUND(ft.trg_value::numeric / NULLIF(dc.total_days_in_month, 0), 1) AS daily_target,
    ROUND(
        CASE
            WHEN ABS(COALESCE(s.inv_val, 0)) < 0.001 THEN 0
            ELSE COALESCE(s.inv_val, 0)
        END::numeric /
        NULLIF(ft.trg_value::numeric / NULLIF(dc.total_days_in_month, 0), 0)
    , 1) AS cover_days
FROM filtered_targets ft
LEFT JOIN stk s ON s.classification = ft.classification
CROSS JOIN days_calc dc
ORDER BY ft.classification;
    `;

    const replacements = { startDate, endDate };
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from cover days`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching cover days:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

router.get("/total", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      classification,
      sku,
      branch,
    } = req.query;

    const sql = `
WITH stk AS (
    select
        SUM(dsmh.qty * dsmh.trade_price)  AS inv_val,
        SUM(dsmh.qty * dsmh.item_cost) AS inv_val_efp,
        SUM(dsmh.qty) as quantity
    FROM daily_stock_movement_history dsmh
    LEFT OUTER JOIN vw_items_class  dmpm
        ON dmpm.mapping_code::TEXT =
           CASE
               WHEN item_code NOT LIKE 'F%' THEN (dsmh.item_code::int)::TEXT
               ELSE dsmh.item_code
           END
    LEFT OUTER JOIN sales_inv_locations sil ON sil.inv_sloc::TEXT = subinventory_code
    WHERE dsmh.stock_closing_date = (
            SELECT MAX(stock_closing_date)
            FROM daily_stock_movement_history d
            WHERE d.stock_closing_date BETWEEN :startDate AND :endDate
            AND d.busline_code IN ('P07','P08','P12')
        )
    AND dsmh.busline_code IN ('P07','P08','P12')
    AND dsmh.subinventory_code LIKE '80%'
    ${classification ? `AND dmpm.classification::text IN (:classification)` : ""}
    ${sku ? `AND dmpm.mapping_code::text IN (:sku)` : ""}
    ${branch ? `AND sil.inv_sloc::text IN (:branch)` : ""}
--    AND dsmh.item_code LIKE '%1013000025%'
--    and sil.inv_sloc = 8028
    AND qty <> 0
),
filtered_targets AS (
    SELECT
    SUM(t01.target_value)                                        AS trg_value
    FROM mv_tscl_spl_target t01
    LEFT OUTER JOIN vw_items_class t03 ON t03.mapping_code::TEXT = t01.item_code::TEXT
    WHERE t01.target_date >= DATE_TRUNC('month', CAST(:endDate AS date))
      AND t01.target_date < DATE_TRUNC('month', CAST(:endDate AS date)) + INTERVAL '1 month'
    ${classification ? `AND t03.classification::text IN (:classification)` : ""}
    ${sku ? `AND t03.mapping_code::text IN (:sku)` : ""}
    ${branch ? `AND t01.loc_code::text IN (:branch)` : ""}
--    and t03.sap_code = '1013000025'
--    AND t01.loc_code = '8028'
),
days_calc AS (
    SELECT EXTRACT(DAY FROM (
        DATE_TRUNC('month', CAST(:endDate AS date)) + INTERVAL '1 month - 1 day'
    ))::int AS total_days_in_month
)
select
    s.inv_val,
    ft.trg_value,
    s.quantity,
    s.inv_val_efp,
    ROUND(
        ft.trg_value::numeric /
        NULLIF(dc.total_days_in_month, 0)
    , 1)                                                                AS daily_target,
    ROUND(
        CASE
            WHEN ABS(COALESCE(s.inv_val, 0)) < 0.001 THEN 0
            ELSE COALESCE(s.inv_val, 0)
        END::numeric /
        NULLIF(
            ft.trg_value::numeric /
            NULLIF(dc.total_days_in_month, 0)
        , 0)
    , 1)                                                                AS cover_days
FROM stk s
CROSS JOIN filtered_targets ft
CROSS JOIN days_calc dc ;
    `;

    const replacements = { startDate, endDate };
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from cover days`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching cover days:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});


export default router;
