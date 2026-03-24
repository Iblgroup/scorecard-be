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
                COALESCE(NULLIF(TRIM(t02.category), ''), 'Other') AS category,
                SUM(t01.trg_val) AS ibl_primary_target
            FROM mv_target_sales_aggregate_25_26 t01
            INNER JOIN frg_dist_metric_prod_mapping t02
                ON t01.item_code = t02.sap_mapping_code::text
            WHERE t01.sale_trg_date BETWEEN :startDate AND :endDate
            AND t02.category IN ('A', 'B', 'C')
            ${classification ? `AND t02.category::text IN (:classification)` : ""}
            ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
            ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
            GROUP BY COALESCE(NULLIF(TRIM(t02.category), ''), 'Other')
        ),
        tscl_target AS (
            SELECT
                COALESCE(NULLIF(TRIM(t02.category), ''), 'Other') AS category,
                SUM(t03.efp * t03.value) AS tscl_trg
            FROM tscl_sap_targets t03
            INNER JOIN frg_dist_metric_prod_mapping t02
                ON t02.sap_mapping_code = t03.material_code
            WHERE t03.target_date BETWEEN :startDate AND :endDate
            AND t02.category IN ('A', 'B', 'C')
            ${classification ? `AND t02.category::text IN (:classification)` : ""}
            ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
            GROUP BY COALESCE(NULLIF(TRIM(t02.category), ''), 'Other')
        )
        SELECT
            i.category,
            i.ibl_primary_target,
            t.tscl_trg,
            t.tscl_trg - i.ibl_primary_target                AS ibl_vs_tscl_target_diff,
            ROUND(
                ((i.ibl_primary_target) /
                NULLIF(t.tscl_trg, 0) * 100)::numeric
            , 2)                                              AS forecast_vs_budget_pct
        FROM ibl_target i
        LEFT JOIN tscl_target t
            ON i.category = t.category
        ORDER BY i.category;
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
