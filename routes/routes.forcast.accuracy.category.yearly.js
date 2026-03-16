import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { startDate = "2025-07-01", endDate = "2025-11-30" } = req.query;

    const sql = `
 WITH base AS (
    SELECT
        COALESCE(NULLIF(TRIM(t02.category), ''), 'Other') AS category,
        SUM(CASE WHEN t01.data_flag = 'SD'  THEN t01.sale_val       ELSE 0 END) AS rd_sales,
        SUM(CASE WHEN t01.data_flag = 'OPS' THEN t01.c_oasales * -1 ELSE 0 END) AS ops_sales
    FROM mv_target_sales_aggregate_25_26 t01
    INNER JOIN frg_dist_metric_prod_mapping t02
        ON t01.item_code = t02.sap_mapping_code::text
    WHERE t01.sale_trg_date BETWEEN '2026-02-01' AND '2026-02-28'
    GROUP BY COALESCE(NULLIF(TRIM(t02.category), ''), 'Other')
),
trg AS (
    SELECT
        COALESCE(NULLIF(TRIM(t02.category), ''), 'Other') AS category,
        SUM(t03.efp * t03.value) AS target_value
    FROM tscl_sap_targets t03
    INNER JOIN frg_dist_metric_prod_mapping t02
        ON t02.sap_mapping_code = t03.material_code
    WHERE t03.target_date BETWEEN '2026-02-01' AND '2026-02-28'
    GROUP BY COALESCE(NULLIF(TRIM(t02.category), ''), 'Other')
)
SELECT
    b.category,
    CASE WHEN (b.rd_sales + b.ops_sales) = 0 THEN NULL
         ELSE (b.rd_sales + b.ops_sales) / NULLIF(t.target_value, 0)
    END  AS forecast_accuracy_pct,
    b.rd_sales + b.ops_sales AS new_total_all_sales,
    t.target_value           AS budget
FROM base b
LEFT JOIN trg t
    ON b.category = t.category
ORDER BY b.category;
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

