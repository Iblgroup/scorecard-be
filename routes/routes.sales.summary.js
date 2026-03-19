import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const {
      startDate = "2026-03-01",
      endDate = "2026-03-31",
      classification,
      sku,
      branch,
    } = req.query;

    const sql = `
        WITH mapping AS (
            SELECT DISTINCT
                sap_mapping_code,
                item_desc,
                classification
            FROM frg_dist_metric_prod_mapping
            WHERE 1=1
            ${classification ? `AND classification::text IN (:classification)` : ""}
            ${sku ? `AND sap_mapping_code::text IN (:sku)` : ""}
        ),
        sd_sales AS (
            SELECT
                t01.item_code,
                t01.branch_code,
                SUM(t01.sale_val) AS rd_sales
            FROM mv_target_sales_aggregate_25_26 t01
            WHERE t01.data_flag = 'SD'
            AND t01.sale_trg_date BETWEEN :startDate AND :endDate
            ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
            GROUP BY t01.item_code, t01.branch_code
        ),
        ops_sales AS (
            SELECT
                t01.item_code,
                t01.branch_code,
                COALESCE(SUM(t01.c_oasales), 0) * -1 AS ops_sales
            FROM mv_target_sales_aggregate_25_26 t01
            WHERE t01.data_flag = 'OPS'
            AND t01.sale_trg_date BETWEEN :startDate AND :endDate
            ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
            GROUP BY t01.item_code, t01.branch_code
        )
        SELECT
            CASE
                WHEN m.classification IS NULL OR m.classification = '' THEN 'Other'
                ELSE m.classification
            END                                                                 AS classification,
            COUNT(DISTINCT m.item_desc)                                         AS sku,
            SUM(COALESCE(s.rd_sales, 0))                                        AS rd_sales,
            SUM(COALESCE(o.ops_sales, 0))                                       AS ops_sales,
            SUM(COALESCE(s.rd_sales, 0)) + SUM(COALESCE(o.ops_sales, 0))       AS new_total_all_sales
        FROM mapping m
        LEFT JOIN sd_sales  s ON s.item_code::text = m.sap_mapping_code::text
        LEFT JOIN ops_sales o ON o.item_code::text = m.sap_mapping_code::text
                              AND o.branch_code = s.branch_code
        GROUP BY
            CASE
                WHEN m.classification IS NULL OR m.classification = '' THEN 'Other'
                ELSE m.classification
            END
        ORDER BY classification;
    `;

    const replacements = { startDate, endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from sales summary`);
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
