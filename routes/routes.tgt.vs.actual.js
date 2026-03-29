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
     WITH closing_inv AS (
    SELECT
        t02.classification,
        CASE
            WHEN ABS(COALESCE(SUM(mtsa.inv_value), 0)) < 0.001 THEN 0
            ELSE COALESCE(SUM(mtsa.inv_value), 0)
        END                                                             AS Closing_Inventory_IBL
    FROM mv_target_sales_aggregate_25_26 mtsa
    INNER JOIN frg_sap_items_detail b ON mtsa.item_code = b.matnr
    INNER JOIN frg_sap_items_detail d ON d.matnr = b.mapping_code
    LEFT JOIN frg_dist_metric_prod_mapping t02
        ON mtsa.item_code::text = t02.sap_code::text
    WHERE mtsa.data_flag = 'OPS'
    AND mtsa.sale_trg_date <= :endDate
    AND b.busline_id IN ('P07', 'P08', 'P12')
    ${classification ? `AND t02.classification::text IN (:classification)` : `AND t02.category IN ('A', 'B', 'C')`}
    ${sku ? `AND b.mapping_code::text IN (:sku)` : ""}
    ${branch ? `AND mtsa.branch_code::text IN (:branch)` : ""}
    GROUP BY t02.classification
),
ibl_direct_target AS (
    SELECT
        t02.classification,
        COALESCE(SUM(mtsa.trg_val), 0)                                  AS IBL_Direct_Month_Target
    FROM mv_target_sales_aggregate_25_26 mtsa
    INNER JOIN frg_sap_items_detail b ON mtsa.item_code = b.matnr
    INNER JOIN frg_sap_items_detail d ON d.matnr = b.mapping_code
    LEFT JOIN frg_dist_metric_prod_mapping t02
        ON mtsa.item_code::text = t02.sap_code::text
    WHERE mtsa.data_flag = 'OPS'
    AND mtsa.sale_trg_date BETWEEN DATE_TRUNC('month', :endDate::date)
                                AND (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
    AND b.busline_id IN ('P07', 'P08', 'P12')
    ${classification ? `AND t02.classification::text IN (:classification)` : `AND t02.category IN ('A', 'B', 'C')`}
    ${sku ? `AND b.mapping_code::text IN (:sku)` : ""}
    ${branch ? `AND mtsa.branch_code::text IN (:branch)` : ""}
    GROUP BY t02.classification
),
ibl_primary_target AS (
    SELECT
        t02.classification,
        COALESCE(SUM(mtsa.trg_val), 0)                                  AS IBL_Primary_Month_Target
    FROM mv_target_sales_aggregate_25_26 mtsa
    INNER JOIN frg_sap_items_detail b ON mtsa.item_code = b.matnr
    INNER JOIN frg_sap_items_detail d ON d.matnr = b.mapping_code
    LEFT JOIN frg_dist_metric_prod_mapping t02
        ON mtsa.item_code::text = t02.sap_code::text
    WHERE mtsa.data_flag = 'SD'
    AND mtsa.sale_trg_date BETWEEN DATE_TRUNC('month', :endDate::date)
                                AND (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
    AND b.busline_id IN ('P07', 'P08', 'P12')
    ${classification ? `AND t02.classification::text IN (:classification)` : `AND t02.category IN ('A', 'B', 'C')`}
    ${sku ? `AND b.mapping_code::text IN (:sku)` : ""}
    ${branch ? `AND mtsa.branch_code::text IN (:branch)` : ""}
    GROUP BY t02.classification
),
days_calc AS (
    SELECT
        EXTRACT(DAY FROM (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date) AS total_days_in_month
)
SELECT
    ci.classification,
    CASE
        WHEN ci.classification = 'A' THEN 30
        WHEN ci.classification = 'B' THEN 20
        WHEN ci.classification = 'C' THEN 15
    END                                                                 AS cover_days_tgt,
    ROUND(
        COALESCE(ci.Closing_Inventory_IBL, 0)::numeric /
        NULLIF(
            (d.IBL_Direct_Month_Target + p.IBL_Primary_Month_Target)::numeric /
            NULLIF(dc.total_days_in_month, 0)
        , 0)
    , 1)                                                                AS actual_cover_days
FROM closing_inv ci
LEFT JOIN ibl_direct_target d   ON ci.classification = d.classification
LEFT JOIN ibl_primary_target p  ON ci.classification = p.classification
CROSS JOIN days_calc dc
ORDER BY ci.classification;
    `;

    const replacements = { startDate, endDate };
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from tgt_vs_actual`);
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
