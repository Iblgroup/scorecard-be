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
WITH base AS (
    SELECT
        b.mapping_code                                                  AS sap_mapping_code,
        t02.classification,
        mtsa.branch_code::text,
        l.branch_desc,
        SUM(CASE WHEN mtsa.data_flag = 'OPS'
            AND mtsa.sale_trg_date <= :endDate
            THEN mtsa.inv_value ELSE 0 END)                             AS inv_value,
        SUM(CASE WHEN mtsa.data_flag = 'OPS'
            AND mtsa.sale_trg_date BETWEEN DATE_TRUNC('month', :endDate::date)
                                      AND (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
            THEN mtsa.trg_val ELSE 0 END)                               AS ibl_direct_target,
        SUM(CASE WHEN mtsa.data_flag = 'SD'
            AND mtsa.sale_trg_date BETWEEN DATE_TRUNC('month', :endDate::date)
                                      AND (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
            THEN mtsa.trg_val ELSE 0 END)                               AS ibl_primary_target
    FROM mv_target_sales_aggregate_25_26 mtsa
    INNER JOIN frg_sap_items_detail b
        ON mtsa.item_code = b.matnr
    LEFT JOIN frg_dist_metric_prod_mapping t02
        ON mtsa.item_code::text = t02.sap_code::text
    LEFT JOIN locations l
        ON mtsa.branch_code::text = l.branch_code::text
    WHERE b.busline_id IN ('P07', 'P08', 'P12')
    ${classification ? `AND t02.classification::text IN (:classification)` : `AND t02.classification::text IN ('A', 'B', 'C')`}
    ${sku ? `AND b.mapping_code::text IN (:sku)` : ""}
    ${branch ? `AND mtsa.branch_code::text IN (:branch)` : ""}
    GROUP BY b.mapping_code, t02.classification, mtsa.branch_code, l.branch_desc
),
days_calc AS (
    SELECT
        EXTRACT(DAY FROM (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date) AS total_days_in_month
),
cover_days_final AS (
    SELECT
        sap_mapping_code,
        classification,
        branch_code,
        branch_desc,
        ROUND(
            CASE
                WHEN ABS(COALESCE(inv_value, 0)) < 0.001 THEN 0
                ELSE COALESCE(inv_value, 0)
            END::numeric /
            NULLIF(
                (ibl_direct_target + ibl_primary_target)::numeric /
                NULLIF(dc.total_days_in_month, 0)
            , 0)
        , 0)                                                            AS cover_days
    FROM base
    CROSS JOIN days_calc dc
),
totals AS (
    SELECT
        branch_code,
        branch_desc,
        classification,
        COUNT(DISTINCT sap_mapping_code)                                AS total_sku,
        COUNT(DISTINCT CASE
            WHEN classification = 'A' AND COALESCE(cover_days, 0) > 30  AND COALESCE(cover_days, 0) < 9999 THEN sap_mapping_code
            WHEN classification = 'B' AND COALESCE(cover_days, 0) > 20  AND COALESCE(cover_days, 0) < 9999 THEN sap_mapping_code
            WHEN classification = 'C' AND COALESCE(cover_days, 0) > 15  AND COALESCE(cover_days, 0) < 9999 THEN sap_mapping_code
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
    ON t.branch_code::text = ba.branch_code::text
WHERE t.branch_code::text IN ('8006','8018','8019','8023','8028','8029','8035','8044','8046','8056','8059','8070','8072','8085')
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
