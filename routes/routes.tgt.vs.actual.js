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
            SUM(dsmh.qty * dsmh.item_cost)                                  AS inv_val
        FROM daily_stock_movement_history dsmh
        LEFT OUTER JOIN dist_metric_prod_mapping dmpm
            ON dmpm.sap_code::TEXT =
               CASE
                   WHEN dsmh.item_code NOT LIKE 'F%' THEN (dsmh.item_code::bigint)::TEXT
                   ELSE dsmh.item_code
               END
        WHERE dsmh.stock_opening_date = (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
        AND dsmh.busline_code IN ('P07','P08','P12')
        AND dsmh.subinventory_code LIKE '80%'
        AND dsmh.qty <> 0
        ${sku ? `AND dmpm.sap_code::text IN (:sku)` : ""}
        ${branch ? `AND dsmh.subinventory_code::text IN (:branch)` : ""}
        ${classification ? `AND dmpm.classification::text IN (:classification)` : ""}
        GROUP BY dmpm.classification
    ),
    filtered_targets AS (
        SELECT
            t03.classification,
            SUM(t01.target_value)                                           AS trg_value
        FROM mv_tscl_spl_target t01
        LEFT OUTER JOIN dist_metric_prod_mapping t03 ON t03.sap_code::TEXT = t01.item_code::TEXT
        WHERE t01.target_date BETWEEN DATE_TRUNC('month', :endDate::date)
          AND (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
        ${sku ? `AND t01.item_code::text IN (:sku)` : ""}
        ${branch ? `AND t01.loc_code::text IN (:branch)` : ""}
        ${classification ? `AND t03.classification::text IN (:classification)` : ""}
        GROUP BY t03.classification
    ),
    days_calc AS (
        SELECT EXTRACT(DAY FROM (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date) AS total_days_in_month
    )
    SELECT
        ft.classification,
        CASE
            WHEN ft.classification = 'A' THEN 30
            WHEN ft.classification = 'B' THEN 20
            WHEN ft.classification = 'C' THEN 15
        END                                                                 AS cover_days_tgt,
        ROUND(
            COALESCE(s.inv_val, 0)::numeric /
            NULLIF(
                ft.trg_value::numeric /
                NULLIF(dc.total_days_in_month, 0)
            , 0)
        , 1)                                                                AS actual_cover_days
    FROM filtered_targets ft
    LEFT JOIN stk s ON ft.classification = s.classification
    CROSS JOIN days_calc dc
    WHERE ft.classification IN ('A','B','C')
    ORDER BY ft.classification;
    `;

    const replacements = { endDate };
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from tgt vs actual`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching tgt vs actual:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
