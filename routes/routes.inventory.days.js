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
        mtsa.branch_code,
        t02.classification,
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
    GROUP BY b.mapping_code, d.matnr_desc, mtsa.branch_code, t02.classification
    UNION ALL
    SELECT
        b.mapping_code                                                  AS item_code,
        d.matnr_desc                                                    AS item_desc,
        mtsa.branch_code,
        t02.classification,
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
    GROUP BY b.mapping_code, d.matnr_desc, mtsa.branch_code, t02.classification
),
days_calc AS (
    SELECT
        EXTRACT(DAY FROM (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date) AS total_days_in_month
),
aggregated AS (
    SELECT
        item_code,
        item_desc,
        branch_code,
        classification,
        SUM(inv_value)                                                  AS inv_value,
        SUM(trg_value)                                                  AS trg_value
    FROM invval
    GROUP BY item_code, item_desc, branch_code, classification
),
cover_days_detail AS (
    SELECT
        item_code,
        item_desc,
        branch_code,
        classification,
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
    classification,
    item_desc,
    MAX(CASE WHEN branch_code = '8006' THEN cover_days END)             AS Bahawalpur,
    MAX(CASE WHEN branch_code = '8018' THEN cover_days END)             AS DSS_Korangi,
    MAX(CASE WHEN branch_code = '8019' THEN cover_days END)             AS Faisalabad,
    MAX(CASE WHEN branch_code = '8023' THEN cover_days END)             AS Gujranwala,
    MAX(CASE WHEN branch_code = '8028' THEN cover_days END)             AS Hyderabad,
    MAX(CASE WHEN branch_code = '8029' THEN cover_days END)             AS Islamabad,
    MAX(CASE WHEN branch_code = '8035' THEN cover_days END)             AS Karachi,
    MAX(CASE WHEN branch_code = '8044' THEN cover_days END)             AS Korangi,
    MAX(CASE WHEN branch_code = '8046' THEN cover_days END)             AS Lahore,
    MAX(CASE WHEN branch_code = '8056' THEN cover_days END)             AS Mingora,
    MAX(CASE WHEN branch_code = '8059' THEN cover_days END)             AS Multan,
    MAX(CASE WHEN branch_code = '8070' THEN cover_days END)             AS Peshawar,
    MAX(CASE WHEN branch_code = '8072' THEN cover_days END)             AS Quetta,
    MAX(CASE WHEN branch_code = '8085' THEN cover_days END)             AS Sukkur,
    ROUND(AVG(cover_days), 1)                                           AS Total
FROM cover_days_detail
GROUP BY classification, item_desc
ORDER BY classification, item_desc;
    `;

    const replacements = { startDate, endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from inventory days`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching inventory days:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
