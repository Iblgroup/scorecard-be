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
WITH ibl_target AS (
    SELECT
        COALESCE(NULLIF(TRIM(t02.classification), ''), 'Others')        AS classification,
        SUM(t01.trg_val)                                                 AS ibl_primary_target
    FROM mv_target_sales_aggregate_25_26 t01
    INNER JOIN frg_sap_items_detail b ON t01.item_code = b.matnr
    INNER JOIN frg_sap_items_detail d ON d.matnr = b.mapping_code
    LEFT JOIN frg_dist_metric_prod_mapping t02
        ON t01.item_code::text = t02.sap_code::text
    WHERE t01.sale_trg_date BETWEEN :startDate AND :endDate
      AND b.busline_id IN ('P07', 'P08', 'P12')
    ${branch ? `AND t01.branch_code::text IN (:branch)` : ''}
    ${sku ? `AND b.mapping_code::text IN (:sku)` : ''}
    ${classification ? `AND COALESCE(NULLIF(TRIM(t02.classification), ''), 'Others')::text IN (:classification)` : ''}
    GROUP BY COALESCE(NULLIF(TRIM(t02.classification), ''), 'Others')
),
tscl_target AS (
    SELECT
        COALESCE(NULLIF(TRIM(t02.classification), ''), 'Others')        AS classification,
        SUM(t03.efp * t03.value)                                         AS tscl_trg
    FROM tscl_sap_targets t03
    INNER JOIN frg_sap_items_detail b ON t03.material_code::text = b.matnr
    INNER JOIN frg_sap_items_detail d ON d.matnr = b.mapping_code
    LEFT JOIN frg_dist_metric_prod_mapping t02
        ON t03.material_code::text = t02.sap_code::text
    WHERE t03.target_date BETWEEN :startDate AND :endDate
      AND b.busline_id IN ('P07', 'P08', 'P12')
    ${sku ? `AND b.mapping_code::text IN (:sku)` : ''}
    ${classification ? `AND COALESCE(NULLIF(TRIM(t02.classification), ''), 'Others')::text IN (:classification)` : ''}
    GROUP BY COALESCE(NULLIF(TRIM(t02.classification), ''), 'Others')
),
results AS (
    SELECT
        i.classification,
        i.ibl_primary_target,
        t.tscl_trg,
        t.tscl_trg - i.ibl_primary_target                               AS ibl_vs_tscl_target_diff,
        ROUND(
            ((i.ibl_primary_target) /
            NULLIF(t.tscl_trg, 0) * 100)::numeric
        , 2)                                                             AS forecast_vs_budget_pct
    FROM ibl_target i
    LEFT JOIN tscl_target t
        ON i.classification = t.classification
),
final AS (
    SELECT * FROM results
    UNION ALL
    SELECT
        'Total'                                                         AS classification,
        SUM(ibl_primary_target)                                         AS ibl_primary_target,
        SUM(tscl_trg)                                                   AS tscl_trg,
        SUM(tscl_trg) - SUM(ibl_primary_target)                        AS ibl_vs_tscl_target_diff,
        ROUND(
            (SUM(ibl_primary_target) /
            NULLIF(SUM(tscl_trg), 0) * 100)::numeric
        , 2)                                                            AS forecast_vs_budget_pct
    FROM results
)
SELECT *
FROM final
ORDER BY
    CASE WHEN classification = 'Total' THEN 1 ELSE 0 END,
    classification;
    `;

    const replacements = { startDate, endDate };
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];


    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from vw_invoice_productmap`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching summary:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
