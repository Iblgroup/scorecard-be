import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const {
      endDate,
      classification,
      sku,
      branch,
    } = req.query;

    const sql = `
    WITH sku_base AS (
        SELECT
            dmpm.sap_code,
            dmpm.classification
        FROM dist_metric_prod_mapping dmpm
        WHERE dmpm.classification IN ('A','B','C')
        ${classification ? `AND dmpm.classification::text IN (:classification)` : ""}
        ${sku ? `AND dmpm.sap_code::text IN (:sku)` : ""}
    ),
    inv_value AS (
        SELECT
            CASE
                WHEN dsmh.item_code NOT LIKE 'F%' THEN (dsmh.item_code::bigint)::TEXT
                ELSE dsmh.item_code
            END                                                             AS item_code_clean,
            SUM(COALESCE(dsmh.qty, 0) * COALESCE(dsmh.item_cost, 0))        AS total_inv_val
        FROM daily_stock_movement_history dsmh
        WHERE dsmh.stock_opening_date = (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
        AND dsmh.busline_code IN ('P07','P08','P12')
        AND dsmh.subinventory_code LIKE '80%'
        ${branch ? `AND dsmh.subinventory_code::text IN (:branch)` : ""}
        GROUP BY 1
    ),
    filtered_targets AS (
        SELECT
            t03.sap_code::TEXT                                              AS sap_code,
            SUM(t01.target_value)                                           AS total_trg_value
        FROM mv_tscl_spl_target t01
        LEFT OUTER JOIN dist_metric_prod_mapping t03 ON t03.sap_code::TEXT = t01.item_code::TEXT
        WHERE t01.target_date BETWEEN DATE_TRUNC('month', :endDate::date)
          AND (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
        ${branch ? `AND t01.loc_code::text IN (:branch)` : ""}
        GROUP BY 1
    ),
    days_calc AS (
        SELECT EXTRACT(DAY FROM (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date) AS total_days_in_month
    ),
    sku_summary AS (
        SELECT
            sb.sap_code,
            sb.classification,
            COALESCE(iv.total_inv_val, 0)                                   AS actual_inv,
            COALESCE(ft.total_trg_value, 0)                                 AS actual_trg,
            ROUND(
                COALESCE(iv.total_inv_val, 0)::numeric /
                NULLIF(
                    COALESCE(ft.total_trg_value, 0)::numeric /
                    NULLIF(dc.total_days_in_month, 0)
                , 0)
            , 1)                                                            AS final_cover_days
        FROM sku_base sb
        LEFT JOIN inv_value iv ON sb.sap_code = iv.item_code_clean
        LEFT JOIN filtered_targets ft ON sb.sap_code = ft.sap_code
        CROSS JOIN days_calc dc
    )
    SELECT
        classification,
        COUNT(DISTINCT CASE
            WHEN (classification = 'A' AND COALESCE(final_cover_days, 0) > 30) OR
                 (classification = 'B' AND COALESCE(final_cover_days, 0) > 20) OR
                 (classification = 'C' AND COALESCE(final_cover_days, 0) > 15)
            THEN sap_code
        END) AS "No Of SKUs > Threshold",
        COUNT(DISTINCT CASE
            WHEN (classification = 'A' AND (COALESCE(final_cover_days, 0) <= 30 OR actual_inv = 0)) OR
                 (classification = 'B' AND (COALESCE(final_cover_days, 0) <= 20 OR actual_inv = 0)) OR
                 (classification = 'C' AND (COALESCE(final_cover_days, 0) <= 15 OR actual_inv = 0))
            THEN sap_code
        END) AS "No Of SKUs < Threshold"
    FROM sku_summary
    GROUP BY classification
    ORDER BY classification;
    `;

    const replacements = { endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from above below threshold`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching above below threshold:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
