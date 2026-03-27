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
        t02.classification,
        t02.sap_mapping_code,
        l.branch_code::text,
        l.branch_desc::text,
        CASE
            WHEN ABS(COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS'
                AND t01.sale_trg_date >= '2021-06-30'
                THEN t01.inv_value END), 0)) < 0.001 THEN 0
            ELSE ABS(COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS'
                AND t01.sale_trg_date >= '2021-06-30'
                THEN t01.inv_value END), 0))
        END                                                             AS closing_inventory,
        COALESCE(SUM(CASE WHEN t01.data_flag = 'OPS'
            AND t01.sale_trg_date BETWEEN :startDate AND :endDate
            THEN t01.trg_val ELSE 0 END), 0)                           AS ibl_direct_target,
        COALESCE(SUM(CASE WHEN t01.data_flag = 'SD'
            AND t01.sale_trg_date BETWEEN :startDate AND :endDate
            THEN t01.trg_val ELSE 0 END), 0)                           AS ibl_primary_target
    FROM mv_target_sales_aggregate_25_26 t01
    LEFT JOIN frg_dist_metric_prod_mapping t02
        ON t01.item_code::text = t02.sap_mapping_code::text
    LEFT JOIN locations l
        ON t01.branch_code::text = l.branch_code::text
            WHERE t02.classification IN ('A', 'B', 'C')
                ${classification ? `AND t02.classification::text IN (:classification)` : ""}
                ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
                ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
            GROUP BY t02.classification, t02.sap_mapping_code, l.branch_code, l.branch_desc
        ),
        cover_days_final AS (
            SELECT
                classification,
                sap_mapping_code,
                branch_code,
                branch_desc,
                ROUND(
                    COALESCE(closing_inventory, 0)::numeric /
                    NULLIF((ibl_direct_target + ibl_primary_target)::numeric, 0)
                , 0)                                                            AS cover_days
            FROM cover_days_per_sku
        ),
        totals AS (
            SELECT
                branch_code,
                branch_desc,
                classification,
                COUNT(DISTINCT sap_mapping_code)                                AS total_sku,
                COUNT(DISTINCT CASE
                    WHEN classification = 'A' AND cover_days > 30  AND cover_days < 9999 THEN sap_mapping_code
                    WHEN classification = 'B' AND cover_days > 20  AND cover_days < 9999 THEN sap_mapping_code
                    WHEN classification = 'C' AND cover_days > 15  AND cover_days < 9999 THEN sap_mapping_code
                END)                                                            AS sku_above_threshold
            FROM cover_days_final
            GROUP BY branch_code, branch_desc, classification
        )
        SELECT
            ba.branch_abbr                                                      AS branch,
            MAX(CASE WHEN classification = 'A' THEN
                ROUND(sku_above_threshold::numeric / NULLIF(total_sku::numeric, 0) * 100, 2)
            END)                                                                AS "SKU-A%",
            MAX(CASE WHEN classification = 'B' THEN
                ROUND(sku_above_threshold::numeric / NULLIF(total_sku::numeric, 0) * 100, 2)
            END)                                                                AS "SKU-B%",
            MAX(CASE WHEN classification = 'C' THEN
                ROUND(sku_above_threshold::numeric / NULLIF(total_sku::numeric, 0) * 100, 2)
            END)                                                                AS "SKU-C%"
        FROM totals t
        LEFT JOIN sap_locations_abr ba
            ON t.branch_code = ba.branch_code::text
        WHERE t.branch_code IN ('8006','8018','8019','8023','8028','8029','8035','8044','8046','8056','8059','8070','8072','8085')
        GROUP BY t.branch_code, ba.branch_abbr
        ORDER BY ba.branch_abbr;
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
