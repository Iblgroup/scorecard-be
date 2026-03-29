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
     WITH invval AS (
    SELECT
        b.mapping_code                                                  AS item_code,
        d.matnr_desc                                                    AS item_desc,
        t02.classification,
        t02.sap_mapping_code,
        SUM(mtsa.inv_value)                                             AS inv_value,
        0                                                               AS trg_value
    FROM mv_target_sales_aggregate_25_26 mtsa
    INNER JOIN frg_sap_items_detail b ON mtsa.item_code = b.matnr
    INNER JOIN frg_sap_items_detail d ON d.matnr = b.mapping_code
    LEFT JOIN frg_dist_metric_prod_mapping t02
        ON mtsa.item_code::text = t02.sap_code::text
    WHERE mtsa.sale_trg_date <= :endDate
    AND mtsa.data_flag = 'OPS'
    AND b.busline_id IN ('P07', 'P08', 'P12')
    ${sku ? `AND b.mapping_code::text IN (:sku)` : ""}
    ${branch ? `AND mtsa.branch_code::text IN (:branch)` : ""}
    ${classification ? `AND t02.classification::text IN (:classification)` : ""}
    GROUP BY b.mapping_code, d.matnr_desc, t02.classification, t02.sap_mapping_code
    UNION ALL
    SELECT
        b.mapping_code                                                  AS item_code,
        d.matnr_desc                                                    AS item_desc,
        t02.classification,
        t02.sap_mapping_code,
        0                                                               AS inv_value,
        SUM(mtsa.trg_val)                                               AS trg_value
    FROM mv_target_sales_aggregate_25_26 mtsa
    INNER JOIN frg_sap_items_detail b ON mtsa.item_code = b.matnr
    INNER JOIN frg_sap_items_detail d ON d.matnr = b.mapping_code
    LEFT JOIN frg_dist_metric_prod_mapping t02
        ON mtsa.item_code::text = t02.sap_code::text
    WHERE mtsa.sale_trg_date BETWEEN DATE_TRUNC('month', :endDate::date)
                                 AND (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
    AND b.busline_id IN ('P07', 'P08', 'P12')
    ${sku ? `AND b.mapping_code::text IN (:sku)` : ""}
    ${branch ? `AND mtsa.branch_code::text IN (:branch)` : ""}
    ${classification ? `AND t02.classification::text IN (:classification)` : ""}
    GROUP BY b.mapping_code, d.matnr_desc, t02.classification, t02.sap_mapping_code
),
days_calc AS (
    SELECT
        EXTRACT(DAY FROM (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date) AS total_days_in_month
),
aggregated AS (
    SELECT
        item_code,
        item_desc,
        classification,
        sap_mapping_code,
        SUM(inv_value)                                                  AS inv_value,
        SUM(trg_value)                                                  AS trg_value
    FROM invval
    GROUP BY item_code, item_desc, classification, sap_mapping_code
),
cover_days_detail AS (
    SELECT
        item_code,
        item_desc,
        classification,
        sap_mapping_code,
        inv_value,
        trg_value,
        ROUND(
            a.trg_value::numeric /
            NULLIF(dc.total_days_in_month, 0)
        , 1)                                                            AS daily_target,
        ROUND(
            a.inv_value::numeric /
            NULLIF(
                a.trg_value::numeric /
                NULLIF(dc.total_days_in_month, 0)
            , 0)
        , 1)                                                            AS cover_days
    FROM aggregated a
    CROSS JOIN days_calc dc
)
SELECT
    classification                                                      AS "Classification",
COUNT(DISTINCT CASE
    WHEN classification = 'A' AND COALESCE(cover_days, 0) > 30  AND COALESCE(cover_days, 0) < 9999 THEN sap_mapping_code
    WHEN classification = 'B' AND COALESCE(cover_days, 0) > 20  AND COALESCE(cover_days, 0) < 9999 THEN sap_mapping_code
    WHEN classification = 'C' AND COALESCE(cover_days, 0) > 15  AND COALESCE(cover_days, 0) < 9999 THEN sap_mapping_code
END)                                                                AS "No Of SKUs > Threshold",
COUNT(DISTINCT CASE
    WHEN classification = 'A' AND COALESCE(cover_days, 0) <= 30  THEN sap_mapping_code
    WHEN classification = 'B' AND COALESCE(cover_days, 0) <= 20  THEN sap_mapping_code
    WHEN classification = 'C' AND COALESCE(cover_days, 0) <= 15  THEN sap_mapping_code
END)                                                                AS "No Of SKUs < Threshold"
FROM cover_days_detail
GROUP BY classification
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

