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
      WITH base AS (
          SELECT
              SUM(CASE WHEN t01.data_flag = 'SD'  THEN t01.sale_val       ELSE 0 END) AS rd_sales,
              SUM(CASE WHEN t01.data_flag = 'OPS' THEN t01.c_oasales * -1 ELSE 0 END) AS ops_sales
          FROM mv_target_sales_aggregate_25_26 t01
          INNER JOIN frg_dist_metric_prod_mapping t02
              ON t01.item_code = t02.sap_mapping_code::text
          WHERE t01.sale_trg_date BETWEEN :startDate AND :endDate
          ${classification ? `AND t02.classification::text IN (:classification)` : ""}
          ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
          ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
      ),
      trg AS (
          SELECT SUM(t03.efp * value) AS target_value
          FROM tscl_sap_targets t03
          INNER JOIN frg_dist_metric_prod_mapping t02
              ON t03.material_code::text = t02.sap_mapping_code::text
          WHERE t03.target_date BETWEEN :startDate AND :endDate
          ${classification ? `AND t02.classification::text IN (:classification)` : ""}
          ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
      )
      SELECT
          CASE WHEN (b.rd_sales + b.ops_sales) = 0 THEN NULL
               ELSE (b.rd_sales + b.ops_sales) / NULLIF(t.target_value, 0)
          END  AS forecast_accuracy_pct,
          b.rd_sales + b.ops_sales AS new_total_all_sales,
          t.target_value           AS budget
      FROM base b
      CROSS JOIN trg t;
    `;

    const replacements = { startDate, endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from forecast accuracy yearly`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching forecast accuracy yearly:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
