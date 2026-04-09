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
        WITH filtered_sales AS (
        SELECT
            DATE_TRUNC('month', t01.billing_date) AS sale_month,
            t01.item_code,
            SUM(t01.gross_amount) gross_amount
        FROM mv_tscl_data_2025_26 t01
        INNER JOIN sap_items_detail t02 ON t01.item_code = t02.matnr
        LEFT OUTER JOIN dist_metric_prod_mapping t03 ON t03.sap_code = t01.item_code
        WHERE t01.billing_date >= DATE_TRUNC('month', :endDate::date) - INTERVAL '2 months'
          AND t01.billing_date <  DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month'
          ${sku ? `AND t01.material_code::text IN (:sku)` : ""}
        ${classification ? `AND t03.classification::text IN (:classification)` : ""}
        GROUP BY DATE_TRUNC('month', t01.billing_date), t01.item_code
    ),
    filtered_targets AS (
        SELECT
            DATE_TRUNC('month', t01.target_date) AS sale_month,
            t01.item_code,
            SUM(t01.target_value) trg
        FROM mv_tscl_spl_target t01
        INNER JOIN sap_items_detail t02 ON t01.item_code = t02.matnr
        LEFT OUTER JOIN dist_metric_prod_mapping t03 ON t03.sap_code = t01.item_code
        WHERE t01.target_date >= DATE_TRUNC('month', :endDate::date) - INTERVAL '2 months'
          AND t01.target_date <  DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month'
          ${sku ? `AND t01.material_code::text IN (:sku)` : ""}
        ${classification ? `AND t03.classification::text IN (:classification)` : ""}
        GROUP BY DATE_TRUNC('month', t01.target_date), t01.item_code
    )
    SELECT
        TO_CHAR(fs.sale_month, 'Mon YYYY') AS month,
        COALESCE(t03.classification, 'Others')                               classification,
        SUM(fs.gross_amount)                                                 new_total_all_sales,
        SUM(ft.trg)                                                          period_sales_trg_ibl_primary,
        ROUND((SUM(fs.gross_amount)/NULLIF(SUM(ft.trg),0)*100)::numeric,2)  forecast_accuracy_pct
    FROM filtered_sales fs
    LEFT JOIN sap_items_detail t02 ON fs.item_code = t02.matnr
    LEFT JOIN dist_metric_prod_mapping t03 ON t03.sap_code = fs.item_code
    LEFT JOIN filtered_targets ft ON fs.item_code = ft.item_code AND fs.sale_month = ft.sale_month
    WHERE 1=1
    ${branch ? `AND a.branch_code::text IN (:branch)` : ""}
    GROUP BY fs.sale_month, t03.classification
    ORDER BY fs.sale_month, t03.classification;
    `;

    const replacements = { endDate };
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
