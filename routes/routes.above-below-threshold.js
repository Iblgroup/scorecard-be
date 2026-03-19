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
        WITH cover_days_per_sku AS (
            SELECT
                t02.category,
                t02.sap_mapping_code,
                -- Closing Inventory (from 2021 to selected end date)
                CASE
                    WHEN ABS(COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS' AND t01.sale_trg_date BETWEEN '2021-06-30' AND :endDate THEN t01.inv_value END), 0)) < 0.001 THEN 0
                    ELSE COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS' AND t01.sale_trg_date BETWEEN '2021-06-30' AND :endDate THEN t01.inv_value END), 0)
                END AS closing_inventory,
                -- IBL Direct Target (OPS) - current month only
                COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS' AND t01.sale_trg_date BETWEEN :startDate AND :endDate THEN t01.trg_val ELSE 0 END), 0) AS ibl_direct_target,
                -- IBL Primary Target (SD) - current month only
                COALESCE(SUM(CASE WHEN t01.data_flag = 'SD'  AND t01.sale_trg_date BETWEEN :startDate AND :endDate THEN t01.trg_val ELSE 0 END), 0) AS ibl_primary_target,
                -- Remaining Days
                EXTRACT(DAY FROM DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day') -
                EXTRACT(DAY FROM CURRENT_DATE) AS remaining_days
            FROM mv_target_sales_aggregate_25_26 t01
            INNER JOIN frg_dist_metric_prod_mapping t02
                ON t01.item_code::text = t02.sap_mapping_code::text
            WHERE t02.category IN ('A', 'B', 'C')
            ${classification ? `AND t02.category::text IN (:classification)` : ""}
            ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
            ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
            GROUP BY t02.category, t02.sap_mapping_code
        ),
        cover_days_final AS (
            SELECT
                category,
                sap_mapping_code,
                ROUND(
                    COALESCE(closing_inventory, 0)::numeric /
                    NULLIF((ibl_direct_target + ibl_primary_target)::numeric, 0) *
                    remaining_days
                , 0) AS cover_days
            FROM cover_days_per_sku
        )
        SELECT
            category                                                                AS "Classification",
            COUNT(DISTINCT CASE
                WHEN category = 'A' AND cover_days > 30  AND cover_days < 9999 THEN sap_mapping_code
                WHEN category = 'B' AND cover_days > 20  AND cover_days < 9999 THEN sap_mapping_code
                WHEN category = 'C' AND cover_days > 15  AND cover_days < 9999 THEN sap_mapping_code
            END)                                                                    AS "No Of SKUs > Threshold",
            COUNT(DISTINCT CASE
                WHEN category = 'A' AND cover_days < 30  THEN sap_mapping_code
                WHEN category = 'B' AND cover_days < 20  THEN sap_mapping_code
                WHEN category = 'C' AND cover_days < 15  THEN sap_mapping_code
            END)                                                                    AS "No Of SKUs < Threshold"
        FROM cover_days_final
        GROUP BY category
        ORDER BY category;
    `;

    const replacements = { startDate, endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

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

