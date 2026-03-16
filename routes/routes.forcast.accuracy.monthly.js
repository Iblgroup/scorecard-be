import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { startDate = "2025-07-01", endDate = "2025-11-30" } = req.query;

    const sql = `
      WITH base AS (
        SELECT
            SUM(CASE WHEN t01.data_flag = 'SD'  THEN t01.sale_val      ELSE 0 END) AS rd_sales,
            SUM(CASE WHEN t01.data_flag = 'OPS' THEN t01.c_oasales * -1 ELSE 0 END) AS ops_sales,
            SUM(t01.trg_val) AS trg
        FROM mv_target_sales_aggregate_25_26 t01
        INNER JOIN frg_dist_metric_prod_mapping t02
            ON t01.item_code = t02.sap_mapping_code::text
            WHERE  
    --        t02.category = 'B'and  --- apply filter
            t01.sale_trg_date BETWEEN '2026-02-01' AND '2026-02-28' --- apply filter
    )
    SELECT
        CASE WHEN (rd_sales + ops_sales) = 0 THEN NULL
            ELSE (rd_sales + ops_sales) / NULLIF(trg, 0)
        END  AS forecast_accuracy_pct,
        rd_sales + ops_sales AS new_total_all_sales,
    --    rd_sales             AS new_total_rd_sales,
    --    ops_sales            AS new_total_ops_sales,
        trg                  AS period_sales_trg_ibl_primary
    FROM base;
    `;

    const results = await db.sequelize.query(sql, {
      replacements: { startDate, endDate },
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

