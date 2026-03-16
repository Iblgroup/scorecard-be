import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { startDate = "2025-07-01", endDate = "2025-11-30" } = req.query;

    const sql = `
 WITH mapping AS (
    SELECT DISTINCT
        sap_mapping_code,
        item_desc,
        classification
    FROM frg_dist_metric_prod_mapping
    WHERE 1=1
--  AND classification = 'A'
--  AND item_desc = 'ACTINIB 5MG TAB 10''s(PAK)'
),
sd_sales AS (
    SELECT
        t01.item_code,
        t01.branch_code,
        SUM(t01.sale_val)                                                                               AS rd_sales
    FROM mv_target_sales_aggregate_25_26 t01
    WHERE t01.data_flag = 'SD'
    AND t01.sale_trg_date BETWEEN '2026-03-01' AND '2026-03-31'
--  AND t01.branch_code::text = 'KARACHI'
    GROUP BY t01.item_code, t01.branch_code
),
ops_sales AS (
    SELECT
        t01.item_code,
        t01.branch_code,
        COALESCE(SUM(t01.c_oasales), 0) * -1                                                           AS ops_sales
    FROM mv_target_sales_aggregate_25_26 t01
    WHERE t01.data_flag = 'OPS'
    AND t01.sale_trg_date BETWEEN '2026-03-01' AND '2026-03-31'
--  AND t01.branch_code::text = 'KARACHI'
    GROUP BY t01.item_code, t01.branch_code
)
SELECT
    CASE
        WHEN m.classification IS NULL OR m.classification = '' THEN 'Other'
        ELSE m.classification
    END                                                                                                 AS Classification,
    COUNT(DISTINCT m.item_desc)                                                                         AS SKU,
    SUM(COALESCE(s.rd_sales, 0))                                                                       AS RD_Sales,
    SUM(COALESCE(o.ops_sales, 0))                                                                      AS OPS_Sales,
    SUM(COALESCE(s.rd_sales, 0)) + SUM(COALESCE(o.ops_sales, 0))                                      AS New_Total_All_Sales
FROM mapping m
INNER JOIN sd_sales  s ON s.item_code = m.sap_mapping_code::text
INNER JOIN ops_sales o ON o.item_code = m.sap_mapping_code::text
GROUP BY
    CASE
        WHEN m.classification IS NULL OR m.classification = '' THEN 'Other'
        ELSE m.classification
    END
ORDER BY Classification;
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

