import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { startDate = "2026-03-01", endDate = "2026-03-31", classification } = req.query;
    const sql = `
      WITH cover_days_per_sku AS (
          SELECT
              t02.category,
              t02.sap_mapping_code,
              l.branch_code::text,
              l.branch_desc::text,
              DATE_TRUNC('month', t01.sale_trg_date)::date                    AS sale_month,
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
              , 0)                                                            AS cover_days
          FROM mv_target_sales_aggregate_25_26 t01
          INNER JOIN frg_dist_metric_prod_mapping t02
              ON t01.item_code::text = t02.sap_mapping_code::text
          INNER JOIN locations l
              ON t01.branch_code::text = l.branch_code::text
          WHERE t02.category IN ('A', 'B', 'C')
          ${classification ? `AND t02.category = :classification` : ""}
          AND t01.sale_trg_date BETWEEN :startDate AND :endDate
          GROUP BY t02.category, t02.sap_mapping_code, l.branch_code, l.branch_desc, DATE_TRUNC('month', t01.sale_trg_date)
      ),
      totals AS (
          SELECT
              sale_month,
              branch_code,
              branch_desc,
              category,
              COUNT(DISTINCT sap_mapping_code)                                AS total_sku,
              COUNT(DISTINCT CASE
                  WHEN category = 'A' AND cover_days > 30  AND cover_days < 9999 THEN sap_mapping_code
                  WHEN category = 'B' AND cover_days > 20  AND cover_days < 9999 THEN sap_mapping_code
                  WHEN category = 'C' AND cover_days > 15  AND cover_days < 9999 THEN sap_mapping_code
              END)                                                            AS sku_above_threshold
          FROM cover_days_per_sku
          GROUP BY sale_month, branch_code, branch_desc, category
      )
      SELECT
      --    sale_month,
      --    branch_code,
          branch_desc,
          MAX(CASE WHEN category = 'A' THEN
              ROUND(sku_above_threshold::numeric / NULLIF(total_sku::numeric, 0) * 100, 2)
          END)                                                                AS "SKU-A%",
          MAX(CASE WHEN category = 'B' THEN
              ROUND(sku_above_threshold::numeric / NULLIF(total_sku::numeric, 0) * 100, 2)
          END)                                                                AS "SKU-B%",
          MAX(CASE WHEN category = 'C' THEN
              ROUND(sku_above_threshold::numeric / NULLIF(total_sku::numeric, 0) * 100, 2)
          END)                                                                AS "SKU-C%"
      FROM totals
      GROUP BY sale_month, branch_code, branch_desc
      ORDER BY sale_month, branch_desc;
    `;
    const replacements = { startDate, endDate };
    if (classification) replacements.classification = classification;

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

