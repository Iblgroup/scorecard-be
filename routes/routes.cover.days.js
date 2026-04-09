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
    WITH stk AS (
        SELECT
            dmpm.classification,
            SUM(dsmh.qty * dsmh.item_cost) AS inv_val
        FROM daily_stock_movement_history dsmh
        LEFT JOIN dist_metric_prod_mapping dmpm
            ON dmpm.sap_code::TEXT =
               CASE
                   WHEN item_code NOT LIKE 'F%' THEN (dsmh.item_code::int)::TEXT
                   ELSE dsmh.item_code
               END
        LEFT JOIN sales_inv_locations sil
            ON sil.inv_sloc::TEXT = subinventory_code
        WHERE dsmh.stock_opening_date = (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
        AND dsmh.busline_code IN ('P07','P08','P12')
        AND dsmh.subinventory_code LIKE '80%'
        AND qty <> 0
        ${sku ? `AND dsmh.item_code::text IN (:sku)` : ""}
        ${branch ? `AND dsmh.subinventory_code::text IN (:branch)` : ""}
        ${classification ? `AND dmpm.classification::text IN (:classification)` : ""}
        GROUP BY dmpm.classification
    ),
    filtered_targets AS (
        SELECT
            t03.classification,
            SUM(t01.target_value) AS trg_value
        FROM mv_tscl_spl_target t01
        LEFT JOIN dist_metric_prod_mapping t03
            ON t03.sap_code::text = t01.item_code::text
        WHERE t01.target_date BETWEEN DATE_TRUNC('month', :endDate::date)
          AND (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
        ${sku ? `AND t01.item_code::text IN (:sku)` : ""}
        ${classification ? `AND t03.classification::text IN (:classification)` : ""}
        GROUP BY t03.classification
    ),
    days_calc AS (
        SELECT EXTRACT(DAY FROM (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date) AS total_days_in_month
    )
    SELECT
        COALESCE(s.classification, 'Others') AS classification,
        s.inv_val,
        ft.trg_value,
        ROUND(ft.trg_value::numeric / NULLIF(dc.total_days_in_month, 0), 1) AS daily_target,
        ROUND(
            CASE
                WHEN ABS(COALESCE(s.inv_val, 0)) < 0.001 THEN 0
                ELSE COALESCE(s.inv_val, 0)
            END::numeric /
            NULLIF(
                ft.trg_value::numeric /
                NULLIF(dc.total_days_in_month, 0)
            , 0)
        , 1) AS cover_days
    FROM stk s
    LEFT JOIN filtered_targets ft ON s.classification = ft.classification
    CROSS JOIN days_calc dc
    ORDER BY s.classification;
    `;

    const replacements = { endDate };
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
