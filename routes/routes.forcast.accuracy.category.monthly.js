import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { date = new Date().toISOString().slice(0, 10) } = req.query;

    const sql = `
WITH base AS (
    SELECT
        COALESCE(NULLIF(TRIM(t02.category), ''), 'Other') AS category,
        DATE_TRUNC('month', t01.sale_trg_date)            AS month_start,
        TO_CHAR(t01.sale_trg_date, 'Mon YYYY')            AS month_label,
        SUM(CASE WHEN t01.data_flag = 'SD'  THEN t01.sale_val       ELSE 0 END) AS rd_sales,
        SUM(CASE WHEN t01.data_flag = 'OPS' THEN t01.c_oasales * -1 ELSE 0 END) AS ops_sales,
        SUM(t01.trg_val) AS trg
    FROM mv_target_sales_aggregate_25_26 t01
    INNER JOIN frg_dist_metric_prod_mapping t02
        ON t01.item_code = t02.sap_mapping_code::text
    WHERE t01.sale_trg_date >= DATE_TRUNC('month', :date::date) - INTERVAL '2 months'
      AND t01.sale_trg_date <  DATE_TRUNC('month', :date::date) + INTERVAL '1 month'
    GROUP BY
        COALESCE(NULLIF(TRIM(t02.category), ''), 'Other'),
        DATE_TRUNC('month', t01.sale_trg_date),
        TO_CHAR(t01.sale_trg_date, 'Mon YYYY')
)
SELECT
    category,
    month_start,
    month_label,
    CASE WHEN (rd_sales + ops_sales) = 0 THEN NULL
         ELSE (rd_sales + ops_sales) / NULLIF(trg, 0)
    END  AS forecast_accuracy_pct,
    rd_sales + ops_sales AS new_total_all_sales,
    trg                  AS period_sales_trg_ibl_primary
FROM base
ORDER BY month_start, category;
    `;

    const results = await db.sequelize.query(sql, {
      replacements: { date },
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from forecast accuracy category monthly`);
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
