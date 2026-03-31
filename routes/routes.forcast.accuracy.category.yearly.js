import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const {
      endDate,
      classification,
      sku,
      branch,
    } = req.query;

    const sql = `
      WITH data_ AS (
          SELECT
              a.data_flag,
              a.item_code,
              b.mapping_code,
              b.matnr_desc                                                    AS item_desc,
              d.matnr_desc                                                    AS unq_item_desc,
              DATE_TRUNC('month', a.sale_trg_date)                            AS sale_month,
              SUM(a.sale_qty)                                                 AS sale_qty,
              SUM(a.sale_val)                                                 AS sale_val,
              SUM(a.inv_qty)                                                  AS inv_qty,
              SUM(a.inv_value)                                                AS inv_value,
              SUM(a.c_oasales)                                                AS c_oasales,
              SUM(a.c_asales)                                                 AS c_asales,
              SUM(a.trg_val)                                                  AS trg_val
          FROM mv_target_sales_aggregate_25_26 a
          INNER JOIN frg_sap_items_detail b
              ON a.item_code = b.matnr
          INNER JOIN frg_sap_items_detail d
              ON d.matnr = b.mapping_code
          WHERE a.sale_trg_date >= DATE_TRUNC('month', :endDate::date) - INTERVAL '2 months'
            AND a.sale_trg_date <  DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month'
            AND b.busline_id IN ('P07', 'P08', 'P12')
            ${branch ? `AND a.branch_code::text IN (:branch)` : ""}
          GROUP BY
              a.data_flag,
              a.item_code,
              b.matnr_desc,
              b.mapping_code,
              d.matnr_desc,
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
              unq_item_desc                                                   AS item_desc,
              classification,
              sale_month,
              sale_qty,
              sale_val,
              inv_qty,
              inv_value,
              c_oasales,
              c_asales,
              trg_val
          FROM data_
          LEFT OUTER JOIN itm_class a
              ON data_.mapping_code::text = a.sap_mapping_code::text
          WHERE 1=1
          ${classification ? `AND classification::text IN (:classification)` : ""}
          ${sku ? `AND mapping_code::text IN (:sku)` : ""}
      )
      SELECT
          TO_CHAR(sale_month, 'Mon YYYY')                                     AS month,
          classification,
          CASE WHEN new_total_all_sales = 0 THEN 0
               ELSE new_total_all_sales / NULLIF(trg_val, 0)
          END                                                                 AS forecast_accuracy_pct,
          new_total_all_sales,
          trg_val                                                             AS period_sales_trg_ibl_primary
      FROM (
          SELECT
              sale_month,
              classification,
              SUM(CASE WHEN data_flag = 'SD'  THEN sale_val       ELSE 0 END) +
              SUM(CASE WHEN data_flag = 'OPS' THEN c_oasales * -1 ELSE 0 END) AS new_total_all_sales,
              SUM(trg_val)                                                    AS trg_val
          FROM fdata
          GROUP BY sale_month, classification
      ) a
      ORDER BY sale_month, classification;
    `;

    const replacements = { endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from forecast accuracy category yearly`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching forecast accuracy category yearly:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
