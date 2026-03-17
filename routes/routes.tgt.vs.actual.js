import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { date = new Date().toISOString().slice(0, 10), category = 'A' } = req.query;
    const sql = `
      WITH cover_days_per_sku AS (
    SELECT
        t02.category,
        t02.sap_mapping_code,
        t02.tgt,
        t02.classification,
        ROUND(
            -- INVENTORY: from 2021 (same as closing_inv CTE)
            ABS(COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS' THEN t01.inv_value END), 0))::numeric /
            -- TARGET: only Feb 2026 (same as ibl_direct + ibl_primary CTEs)
            NULLIF((
                SUM(CASE WHEN t01.data_flag = 'OPS' AND t01.sale_trg_date BETWEEN '2026-02-01' AND '2026-02-28' THEN COALESCE(t01.trg_val, 0) ELSE 0 END) +
                SUM(CASE WHEN t01.data_flag = 'SD'  AND t01.sale_trg_date BETWEEN '2026-02-01' AND '2026-02-28' THEN COALESCE(t01.trg_val, 0) ELSE 0 END)
            )::numeric, 0) *
            (
                EXTRACT(DAY FROM DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day') -
                EXTRACT(DAY FROM CURRENT_DATE)
            )
        , 0)                                                            AS cover_days
    FROM mv_target_sales_aggregate_25_26 t01
    INNER JOIN frg_dist_metric_prod_mapping t02
        ON t01.item_code::text = t02.sap_mapping_code::text
    WHERE t02.category IN ('A', 'B', 'C')
    AND t01.sale_trg_date >= '2021-06-30'
    AND t01.sale_trg_date <= '2026-02-28'
    GROUP BY t02.category, t02.sap_mapping_code, t02.tgt, t02.classification
)
SELECT
    classification,
    MAX(tgt)                                                            AS cover_days_tgt,
    ROUND(AVG(cover_days), 0)                                          AS actual_cover_days
FROM cover_days_per_sku
GROUP BY classification
ORDER BY classification;
    `;
    const results = await db.sequelize.query(sql, {
      replacements: { date, category },
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

