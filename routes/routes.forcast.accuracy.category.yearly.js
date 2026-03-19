import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const {
      date = new Date().toISOString().slice(0, 10),
      classification,
      sku,
      branch,
    } = req.query;

    const sql = `
      WITH base AS (
          SELECT
              COALESCE(NULLIF(TRIM(t02.category), ''), 'Other') AS category,
              DATE_TRUNC('month', t01.sale_trg_date)            AS month_start,
              TO_CHAR(t01.sale_trg_date, 'Mon YYYY')            AS month_label,
              SUM(CASE WHEN t01.data_flag = 'SD'  THEN t01.sale_val       ELSE 0 END) AS rd_sales,
              SUM(CASE WHEN t01.data_flag = 'OPS' THEN t01.c_oasales * -1 ELSE 0 END) AS ops_sales
          FROM mv_target_sales_aggregate_25_26 t01
          INNER JOIN frg_dist_metric_prod_mapping t02
              ON t01.item_code = t02.sap_mapping_code::text
          WHERE
              t01.sale_trg_date >= DATE_TRUNC('month', :date::date) - INTERVAL '2 months'
              AND t01.sale_trg_date < DATE_TRUNC('month', :date::date) + INTERVAL '1 month'
              ${classification ? `AND t02.classification::text IN (:classification)` : ""}
              ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
              ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
          GROUP BY
              COALESCE(NULLIF(TRIM(t02.category), ''), 'Other'),
              DATE_TRUNC('month', t01.sale_trg_date),
              TO_CHAR(t01.sale_trg_date, 'Mon YYYY')
      ),
      trg AS (
          SELECT
              COALESCE(NULLIF(TRIM(t02.category), ''), 'Other') AS category,
              DATE_TRUNC('month', t03.target_date)              AS month_start,
              SUM(t03.efp * t03.value) AS target_value
          FROM tscl_sap_targets t03
          INNER JOIN frg_dist_metric_prod_mapping t02
              ON t02.sap_mapping_code = t03.material_code
          WHERE t03.target_date >= DATE_TRUNC('month', :date::date) - INTERVAL '2 months'
            AND t03.target_date < DATE_TRUNC('month', :date::date) + INTERVAL '1 month'
          GROUP BY
              COALESCE(NULLIF(TRIM(t02.category), ''), 'Other'),
              DATE_TRUNC('month', t03.target_date)
      )
      SELECT
          b.category,
          b.month_start,
          b.month_label,
          CASE WHEN (b.rd_sales + b.ops_sales) = 0 THEN NULL
              ELSE (b.rd_sales + b.ops_sales) / NULLIF(t.target_value, 0)
          END  AS forecast_accuracy_pct,
          b.rd_sales + b.ops_sales AS new_total_all_sales,
          t.target_value           AS budget
      FROM base b
      LEFT JOIN trg t
          ON b.category = t.category AND b.month_start = t.month_start
      ORDER BY b.month_start, b.category;
    `;

    const replacements = { date };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from forecast accuracy category yearly`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching forecast accuracy category yearly:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
