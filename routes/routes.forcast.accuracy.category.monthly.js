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
WITH month_series AS (
    SELECT
        DATE_TRUNC('month', :endDate::date) - (n || ' month')::interval AS month_start
    FROM generate_series(0, 2) AS n
),
data_ AS (
    SELECT
        a.data_flag,
        a.item_code,
        b.mapping_code,
        DATE_TRUNC('month', a.sale_trg_date)                            AS month_start,
        SUM(a.sale_val)                                                 AS sale_val,
        SUM(a.c_oasales)                                                AS c_oasales,
        SUM(a.trg_val)                                                  AS trg_val
    FROM mv_target_sales_aggregate_25_26 a
    INNER JOIN frg_sap_items_detail b
        ON a.item_code = b.matnr
    INNER JOIN frg_sap_items_detail d
        ON d.matnr = b.mapping_code
    WHERE a.sale_trg_date >= DATE_TRUNC('month', :endDate::date) - INTERVAL '2 months'
      AND a.sale_trg_date < DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month'
    AND b.busline_id IN ('P07', 'P08', 'P12')
    ${branch ? `AND a.branch_code::text IN (:branch)` : ""}
    GROUP BY
        a.data_flag,
        a.item_code,
        b.mapping_code,
        DATE_TRUNC('month', a.sale_trg_date)
),
itm_class AS (
    SELECT DISTINCT
        sap_mapping_code,
        classification
    FROM frg_dist_metric_prod_mapping
),
fdata AS (
    SELECT
        data_flag,
        mapping_code                                                    AS item_code,
        classification,
        month_start,
        sale_val,
        c_oasales,
        trg_val
    FROM data_
    LEFT OUTER JOIN itm_class a
        ON data_.mapping_code::text = a.sap_mapping_code::text
)
SELECT
    TO_CHAR(ms.month_start, 'Mon YYYY')                                AS month,
    f.classification,
    CASE WHEN SUM(CASE WHEN f.data_flag = 'SD'  THEN f.sale_val       ELSE 0 END) +
              SUM(CASE WHEN f.data_flag = 'OPS' THEN f.c_oasales * -1 ELSE 0 END) = 0 THEN 0
         ELSE (SUM(CASE WHEN f.data_flag = 'SD'  THEN f.sale_val       ELSE 0 END) +
               SUM(CASE WHEN f.data_flag = 'OPS' THEN f.c_oasales * -1 ELSE 0 END)) /
              NULLIF(SUM(CASE WHEN f.data_flag = 'SD' THEN f.trg_val ELSE 0 END), 0)
    END                                                                 AS forecast_accuracy_pct,
    SUM(CASE WHEN f.data_flag = 'SD'  THEN f.sale_val       ELSE 0 END) +
    SUM(CASE WHEN f.data_flag = 'OPS' THEN f.c_oasales * -1 ELSE 0 END) AS new_total_all_sales,
    SUM(CASE WHEN f.data_flag = 'SD'  THEN f.trg_val        ELSE 0 END) AS trg_val
FROM month_series ms
LEFT JOIN fdata f ON f.month_start = ms.month_start
WHERE 1=1
${classification ? `AND f.classification::text IN (:classification)` : ""}
${sku ? `AND f.item_code::text IN (:sku)` : ""}
GROUP BY ms.month_start, f.classification
ORDER BY ms.month_start, f.classification;
    `;

    const replacements = { startDate, endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from forecast accuracy category monthly`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching forecast accuracy category monthly:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
