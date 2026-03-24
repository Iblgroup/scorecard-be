import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      classification,
      sku,
      branch,
    } = req.query;

    const sql = `
        WITH cover_days_per_sku AS (
            SELECT
                t02.category,
                t02.sap_mapping_code,
                t02.tgt,
                t02.classification,
                -- Closing Inventory (2021 to selected end date)
                CASE
                    WHEN ABS(COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS'
                        AND t01.sale_trg_date BETWEEN '2021-06-30' AND :endDate
                        THEN t01.inv_value END), 0)) < 0.001 THEN 0
                    ELSE ABS(COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS'
                        AND t01.sale_trg_date BETWEEN '2021-06-30' AND :endDate
                        THEN t01.inv_value END), 0))
                END AS closing_inventory,
                -- IBL Direct Target (OPS) - current month only
                COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS'
                    AND t01.sale_trg_date BETWEEN :startDate AND :endDate
                    THEN t01.trg_val ELSE 0 END), 0) AS ibl_direct_target,
                -- IBL Primary Target (SD) - current month only
                COALESCE(SUM(CASE WHEN t01.data_flag = 'SD'
                    AND t01.sale_trg_date BETWEEN :startDate AND :endDate
                    THEN t01.trg_val ELSE 0 END), 0) AS ibl_primary_target,
                -- Remaining Days
                EXTRACT(DAY FROM DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day') -
                EXTRACT(DAY FROM CURRENT_DATE) AS remaining_days
            FROM mv_target_sales_aggregate_25_26 t01
            INNER JOIN frg_dist_metric_prod_mapping t02
                ON t01.item_code::text = t02.sap_mapping_code::text
            WHERE t02.category IN ('A', 'B', 'C')
            ${classification ? `AND t02.classification::text IN (:classification)` : ""}
            ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
            ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
            GROUP BY t02.category, t02.sap_mapping_code, t02.tgt, t02.classification
        ),
        cover_days_final AS (
            SELECT
                category,
                sap_mapping_code,
                tgt,
                classification,
                ROUND(
                    COALESCE(closing_inventory, 0)::numeric /
                    NULLIF((ibl_direct_target + ibl_primary_target)::numeric, 0) *
                    remaining_days
                , 0) AS cover_days
            FROM cover_days_per_sku
        )
        SELECT
            classification,
            MAX(tgt)                        AS cover_days_tgt,
            ROUND(AVG(cover_days), 0)       AS actual_cover_days
        FROM cover_days_final
        GROUP BY classification
        ORDER BY classification;
    `;

    const replacements = { startDate, endDate };
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];

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
