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
            ${classification ? `AND COALESCE(NULLIF(TRIM(t02.classification), ''), 'Others')::text IN (:classification)` : ""}
            GROUP BY t02.classification
            UNION ALL
            SELECT
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
            ${classification ? `AND COALESCE(NULLIF(TRIM(t02.classification), ''), 'Others')::text IN (:classification)` : ""}
            GROUP BY t02.classification
        ),
        days_calc AS (
            SELECT
                EXTRACT(DAY FROM (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date) AS total_days_in_month
        ),
        aggregated AS (
            SELECT
                a.classification,
                SUM(inv_value)                                                  AS inv_value,
                SUM(trg_value)                                                  AS trg_value
            FROM invval a
            GROUP BY a.classification
        )
        SELECT
            COALESCE(a.classification, 'Others')                                AS classification,
            a.inv_value,
            a.trg_value,
            ROUND(
                a.trg_value::numeric /
                NULLIF(dc.total_days_in_month, 0)
            , 1)                                                                AS daily_target,
            ROUND(
                a.inv_value::numeric /
                NULLIF(
                    a.trg_value::numeric /
                    NULLIF(dc.total_days_in_month, 0)
                , 0)
            , 1)                                                                AS cover_days
        FROM aggregated a
        CROSS JOIN days_calc dc
        ORDER BY a.classification;
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
