import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const {
      startDate = "2026-03-01",
      endDate = "2026-03-31",
      classification,
      sku,
      branch,
    } = req.query;

    const sql = `


WITH filtered_sales AS (
    SELECT item_code, SUM(gross_amount) gross_amount
    FROM mv_tscl_data_2025_26 t01
    inner join sap_items_detail t02 on (t01.item_code = t02.matnr)
	left outer join dist_metric_prod_mapping t03 on (t03.sap_code = t01.item_code)
    WHERE billing_date between :startDate and :endDate
            ${branch ? `AND a.branch_code::text IN (:branch)` : ""}
        ${classification ? `AND classification::text IN (:classification)` : ""}
    ${sku ? `AND item_code::text IN (:sku)` : ""}
    GROUP BY item_code
),
filtered_targets AS (
    SELECT item_code, SUM(target_value) trg
    FROM mv_tscl_spl_target t01
    inner join sap_items_detail t02 on (t01.item_code = t02.matnr)
	left outer join dist_metric_prod_mapping t03 on (t03.sap_code = t01.item_code)
    WHERE target_date between :startDate and :endDate
            ${branch ? `AND a.branch_code::text IN (:branch)` : ""}
        ${classification ? `AND classification::text IN (:classification)` : ""}
    ${sku ? `AND item_code::text IN (:sku)` : ""}
    GROUP BY item_code
)
SELECT SUM(fs.gross_amount) new_total_all_sales , SUM(ft.trg) period_sales_trg_ibl_primary,
ROUND((SUM(fs.gross_amount)/NULLIF(SUM(ft.trg),0)*100)::numeric,2) forecast_accuracy_pct
FROM filtered_sales fs
left JOIN sap_items_detail t02 ON fs.item_code=t02.matnr
LEFT JOIN dist_metric_prod_mapping t03 ON t03.sap_code=fs.item_code
LEFT JOIN filtered_targets ft ON fs.item_code=ft.item_code;
    `;

    const replacements = { startDate, endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from forecast accuracy monthly`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching forecast accuracy monthly:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
