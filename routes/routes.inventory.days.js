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
   WITH inv_value AS (
    SELECT
        COALESCE(dmpm.classification, 'Others') AS classification,
        dmpm."PRD",
        sil.inv_sloc                            AS branch_code,
        SUM(dsmh.qty * dsmh.trade_price )        AS inv_val,
       	dmpm.mapping_code
    FROM daily_stock_movement_history dsmh
    LEFT OUTER JOIN dist_prod_mapping_temp dmpm
        ON dmpm.mapping_code::TEXT =
           CASE
               WHEN dsmh.item_code NOT LIKE 'F%' THEN (dsmh.item_code::bigint)::TEXT
               ELSE dsmh.item_code
           END
    LEFT OUTER JOIN sales_inv_locations sil ON sil.inv_sloc::TEXT = dsmh.subinventory_code
    WHERE dsmh.stock_opening_date = (
        SELECT MAX(stock_opening_date)          -- ✅ dynamic latest date
        FROM daily_stock_movement_history d
       WHERE d.stock_opening_date BETWEEN :startDate AND :endDate  -- dates separated
		AND d.busline_code IN ('P07','P08','P12')
    )
    AND dsmh.busline_code IN ('P07','P08','P12')
    AND dsmh.subinventory_code LIKE '80%'
    ${classification ? `AND dmpm.classification::text IN (:classification)` : ""}
    ${sku ? `AND dsmh.item_code::text IN (:sku)` : ""}
    ${branch ? `AND sil.inv_sloc::text IN (:branch)` : ""}
    GROUP BY sil.inv_sloc, dmpm.classification, dmpm."PRD",dmpm.mapping_code
),
filtered_targets AS (
    SELECT
        t01.loc_code                            AS branch_code,
        t03.classification,
        t03.mapping_code,
        t03."PRD",                              -- ✅ bring PRD here for correct join
        SUM(t01.target_value)                   AS trg_value
    FROM mv_tscl_spl_target t01
    LEFT OUTER JOIN dist_prod_mapping_temp t03 ON t03.mapping_code::TEXT = t01.item_code::TEXT
    WHERE DATE_TRUNC('month', t01.target_date) = DATE_TRUNC('month', CAST(:endDate AS date))
    ${classification ? `AND t03.classification::text IN (:classification)` : ""}
    ${sku ? `AND t01.item_code::text IN (:sku)` : ""}
    ${branch ? `AND t01.loc_code::text IN (:branch)` : ""}
    GROUP BY t01.loc_code, t03.classification, t03.mapping_code, t03."PRD"
),
days_calc AS (
    SELECT EXTRACT(DAY FROM (
        DATE_TRUNC('month', CAST(:endDate AS date)) + INTERVAL '1 month - 1 day'
    ))::int AS total_days_in_month
),
aggregated AS (
    SELECT
        iv.classification,
        iv."PRD",
        iv.branch_code,
        iv.inv_val,
        ft.trg_value
    FROM inv_value iv
    LEFT JOIN filtered_targets ft ON iv.branch_code::TEXT = ft.branch_code::TEXT
                                  AND iv.classification   = ft.classification
                                  AND iv.mapping_code            = ft.mapping_code   -- ✅ correct join key
),
cover_days_detail AS (
    SELECT
        a.classification,
        a."PRD",
        a.branch_code,
        a.inv_val,
        a.trg_value,
        ROUND(a.trg_value::numeric / NULLIF(dc.total_days_in_month, 0), 1) AS daily_target,
        ROUND(
            CASE
                WHEN ABS(COALESCE(a.inv_val, 0)) < 0.001 THEN 0
                ELSE COALESCE(a.inv_val, 0)
            END::numeric /
            NULLIF(a.trg_value::numeric / NULLIF(dc.total_days_in_month, 0), 0)
        , 1) AS cover_days
    FROM aggregated a
    CROSS JOIN days_calc dc
)
SELECT
    COALESCE(classification, 'Others')                                AS classification,
    COALESCE("PRD", 'Unknown')                                        AS item_desc,
    MAX(CASE WHEN branch_code::TEXT = '8006' THEN cover_days END)     AS Bahawalpur,
    MAX(CASE WHEN branch_code::TEXT = '8018' THEN cover_days END)     AS DSS_Korangi,
    MAX(CASE WHEN branch_code::TEXT = '8019' THEN cover_days END)     AS Faisalabad,
    MAX(CASE WHEN branch_code::TEXT = '8023' THEN cover_days END)     AS Gujranwala,
    MAX(CASE WHEN branch_code::TEXT = '8028' THEN cover_days END)     AS Hyderabad,
    MAX(CASE WHEN branch_code::TEXT = '8029' THEN cover_days END)     AS Islamabad,
    MAX(CASE WHEN branch_code::TEXT = '8035' THEN cover_days END)     AS Karachi,
    MAX(CASE WHEN branch_code::TEXT = '8044' THEN cover_days END)     AS Korangi,
    MAX(CASE WHEN branch_code::TEXT = '8046' THEN cover_days END)     AS Lahore,
    MAX(CASE WHEN branch_code::TEXT = '8056' THEN cover_days END)     AS Mingora,
    MAX(CASE WHEN branch_code::TEXT = '8059' THEN cover_days END)     AS Multan,
    MAX(CASE WHEN branch_code::TEXT = '8070' THEN cover_days END)     AS Peshawar,
    MAX(CASE WHEN branch_code::TEXT = '8072' THEN cover_days END)     AS Quetta,
    MAX(CASE WHEN branch_code::TEXT = '8085' THEN cover_days END)     AS Sukkur,
    ROUND(AVG(cover_days), 1)                                         AS Total
FROM cover_days_detail
GROUP BY classification, "PRD"
ORDER BY classification, "PRD";
    `;

    const replacements = { startDate, endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from inventory days`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching inventory days:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
