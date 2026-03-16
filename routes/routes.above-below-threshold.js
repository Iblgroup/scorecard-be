import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { startDate = "2025-07-01", endDate = "2025-11-30" } = req.query;

    const sql = `
 WITH cover_days_per_sku AS (
    SELECT
        t02.category,
        t02.sap_mapping_code,
        ROUND(
            ABS(COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS' THEN t01.inv_value END), 0))::numeric /
            NULLIF((
                SUM(CASE WHEN t01.data_flag = 'OPS' THEN COALESCE(t01.trg_val, 0) ELSE 0 END) +
                SUM(CASE WHEN t01.data_flag = 'SD'  THEN COALESCE(t01.trg_val, 0) ELSE 0 END)
            )::numeric, 0) *
            (
                EXTRACT(DAY FROM DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day') -
                EXTRACT(DAY FROM CURRENT_DATE)
            )
        , 0) AS cover_days
    FROM mv_target_sales_aggregate_25_26 t01
    INNER JOIN frg_dist_metric_prod_mapping t02
        ON t01.item_code::text = t02.sap_mapping_code::text
    WHERE t01.sale_trg_date BETWEEN '2026-02-01' AND '2026-02-28' and t02.category = 'A'
    AND t02.category IN ('A', 'B', 'C')
    GROUP BY t02.category, t02.sap_mapping_code
)
SELECT
    category                                                                             AS "Classification",
    COUNT(DISTINCT CASE
        WHEN category = 'A' AND cover_days > 30  AND cover_days < 9999 THEN sap_mapping_code
        WHEN category = 'B' AND cover_days > 20  AND cover_days < 9999 THEN sap_mapping_code
        WHEN category = 'C' AND cover_days > 15 AND cover_days < 9999 THEN sap_mapping_code
    END)                                                                                 AS "No Of SKUs > Threshold",
    COUNT(DISTINCT CASE
        WHEN category = 'A' AND cover_days < 30  THEN sap_mapping_code
        WHEN category = 'B' AND cover_days < 20  THEN sap_mapping_code
        WHEN category = 'C' AND cover_days < 15  THEN sap_mapping_code
    END)                                                                                 AS "No Of SKUs < Threshold"
FROM cover_days_per_sku
GROUP BY category
ORDER BY category;
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

