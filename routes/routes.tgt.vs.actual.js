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
      WITH closing_inv AS (
          SELECT
              t02.classification,
              MAX(t02.tgt)                                                    AS tgt,
              CASE
                  WHEN ABS(COALESCE(SUM(inv_value), 0)) < 0.001 THEN 0
                  ELSE COALESCE(SUM(inv_value), 0)
              END                                                             AS Closing_Inventory_IBL
          FROM mv_target_sales_aggregate_25_26 t01
          INNER JOIN frg_dist_metric_prod_mapping t02
              ON t01.item_code::text = t02.sap_mapping_code::text
          WHERE t01.data_flag = 'OPS'
          AND t02.category IN ('A', 'B', 'C')
          AND t01.sale_trg_date >= '2021-06-30'
          ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
          ${classification ? `AND t02.classification::text IN (:classification)` : ""}
          ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
          GROUP BY t02.classification
      ),
      ibl_direct_target AS (
          SELECT
              t02.classification,
              COALESCE(SUM(t01.trg_val), 0)                                  AS IBL_Direct_Month_Target
          FROM mv_target_sales_aggregate_25_26 t01
          INNER JOIN frg_dist_metric_prod_mapping t02
              ON t01.item_code::text = t02.sap_mapping_code::text
          WHERE t01.data_flag = 'OPS'
          AND t02.category IN ('A', 'B', 'C')
          AND t01.sale_trg_date BETWEEN :startDate AND :endDate
          ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
          ${classification ? `AND t02.classification::text IN (:classification)` : ""}
          ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
          GROUP BY t02.classification
      ),
      ibl_primary_target AS (
          SELECT
              t02.classification,
              COALESCE(SUM(t01.trg_val), 0)                                  AS IBL_Primary_Month_Target
          FROM mv_target_sales_aggregate_25_26 t01
          INNER JOIN frg_dist_metric_prod_mapping t02
              ON t01.item_code::text = t02.sap_mapping_code::text
          WHERE t01.data_flag = 'SD'
          AND t02.category IN ('A', 'B', 'C')
          AND t01.sale_trg_date BETWEEN :startDate AND :endDate
          ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
          ${classification ? `AND t02.classification::text IN (:classification)` : ""}
          ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
          GROUP BY t02.classification
      )
      SELECT
          ci.classification,
          ci.tgt                                                              AS cover_days_tgt,
          ROUND(
              COALESCE(ci.Closing_Inventory_IBL, 0)::numeric /
              NULLIF((d.IBL_Direct_Month_Target + p.IBL_Primary_Month_Target)::numeric, 0)
          , 1)                                                                AS actual_cover_days
      FROM closing_inv ci
      LEFT JOIN ibl_direct_target d   ON ci.classification = d.classification
      LEFT JOIN ibl_primary_target p  ON ci.classification = p.classification
      ORDER BY ci.classification;
    `;

    const replacements = { startDate, endDate };
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from tgt_vs_actual`);
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
