import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const {
      startDate = "2026-03-01",
      endDate = "2026-03-31",
      classification,
      sku,
      branch,
    } = req.query;

    const sql = `
      WITH cover_days_per_sku AS (
          SELECT
              t02.classification,
              t02.sap_mapping_code,
              CASE
                  WHEN ABS(COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS'
                      AND t01.sale_trg_date >= '2021-06-30'
                      THEN t01.inv_value END), 0)) < 0.001 THEN 0
                  ELSE COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS'
                      AND t01.sale_trg_date >= '2021-06-30'
                      THEN t01.inv_value END), 0)
              END                                                             AS closing_inventory,
              COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS'
                  AND t01.sale_trg_date BETWEEN :startDate AND :endDate
                  THEN t01.trg_val ELSE 0 END), 0)                           AS ibl_direct_target,
              COALESCE(SUM(CASE WHEN t01.data_flag = 'SD'
                  AND t01.sale_trg_date BETWEEN :startDate AND :endDate
                  THEN t01.trg_val ELSE 0 END), 0)                           AS ibl_primary_target
          FROM mv_target_sales_aggregate_25_26 t01
          INNER JOIN frg_dist_metric_prod_mapping t02
              ON t01.item_code::text = t02.sap_mapping_code::text
          WHERE t02.classification IN ('A', 'B', 'C')
          ${classification ? `AND t02.classification::text IN (:classification)` : ""}
          ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
          ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
          GROUP BY t02.classification, t02.sap_mapping_code
      ),
      cover_days_final AS (
          SELECT
              classification,
              sap_mapping_code,
              ROUND(
                  closing_inventory::numeric /
                  NULLIF((ibl_direct_target + ibl_primary_target)::numeric, 0)
              , 1)                                                            AS cover_days
          FROM cover_days_per_sku
      )
      SELECT
          classification                                                      AS "Classification",
          COUNT(DISTINCT CASE
              WHEN classification = 'A' AND cover_days > 30  AND cover_days < 9999 THEN sap_mapping_code
              WHEN classification = 'B' AND cover_days > 20  AND cover_days < 9999 THEN sap_mapping_code
              WHEN classification = 'C' AND cover_days > 15  AND cover_days < 9999 THEN sap_mapping_code
          END)                                                                AS "No Of SKUs > Threshold",
          COUNT(DISTINCT CASE
              WHEN classification = 'A' AND cover_days < 30  THEN sap_mapping_code
              WHEN classification = 'B' AND cover_days < 20  THEN sap_mapping_code
              WHEN classification = 'C' AND cover_days < 15  THEN sap_mapping_code
          END)                                                                AS "No Of SKUs < Threshold"
      FROM cover_days_final
      GROUP BY classification
      ORDER BY classification;
    `;

    const replacements = { startDate, endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

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

