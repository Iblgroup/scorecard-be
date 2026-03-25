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
              bm.branch_code,
              bm.branch_desc,
              t02.item_desc,
              CASE
                  WHEN ABS(COALESCE(SUM(t01.inv_value), 0)) < 0.001 THEN 0
                  ELSE COALESCE(SUM(t01.inv_value), 0)
              END                                                             AS closing_inventory
          FROM mv_target_sales_aggregate_25_26 t01
          INNER JOIN frg_dist_metric_prod_mapping t02
              ON t01.item_code::text = t02.sap_mapping_code::text
          INNER JOIN locations bm
              ON t01.branch_code::text = bm.branch_code
          WHERE t01.data_flag = 'OPS'
          AND t01.sale_trg_date >= '2021-06-30'
          ${classification ? `AND t02.classification::text IN (:classification)` : ""}
          ${branch ? `AND bm.branch_code::text IN (:branch)` : ""}
          ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
          GROUP BY t02.classification, bm.branch_code, bm.branch_desc, t02.item_desc
      ),
      ibl_targets AS (
          SELECT
              t02.classification,
              bm.branch_code,
              t02.item_desc,
              SUM(CASE WHEN t01.data_flag = 'OPS' THEN COALESCE(t01.trg_val, 0) ELSE 0 END) AS direct_target,
              SUM(CASE WHEN t01.data_flag = 'SD'  THEN COALESCE(t01.trg_val, 0) ELSE 0 END) AS primary_target
          FROM mv_target_sales_aggregate_25_26 t01
          INNER JOIN frg_dist_metric_prod_mapping t02
              ON t01.item_code::text = t02.sap_mapping_code::text
          INNER JOIN locations bm
              ON t01.branch_code::text = bm.branch_code
          WHERE t01.sale_trg_date BETWEEN :startDate AND :endDate
          -- AND t02.classification <> ''
          ${classification ? `AND t02.classification::text IN (:classification)` : ""}
          ${branch ? `AND bm.branch_code::text IN (:branch)` : ""}
          ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
          GROUP BY t02.classification, bm.branch_code, t02.item_desc
      ),
      cover_days_detail AS (
          SELECT
              ci.classification,
              ci.branch_code,
              ci.branch_desc,
              ci.item_desc,
              ROUND(
                  ci.closing_inventory::numeric /
                  NULLIF((it.direct_target + it.primary_target)::numeric, 0)
              , 0)                                                            AS cover_days
          FROM closing_inv ci
          INNER JOIN ibl_targets it
              ON ci.classification = it.classification
              AND ci.branch_code   = it.branch_code
              AND ci.item_desc     = it.item_desc
      )
      SELECT
          classification,
          item_desc,
          MAX(CASE WHEN branch_code = '8006' THEN cover_days END)            AS Bahawalpur,
          MAX(CASE WHEN branch_code = '8018' THEN cover_days END)            AS DSS_Korangi,
          MAX(CASE WHEN branch_code = '8019' THEN cover_days END)            AS Faisalabad,
          MAX(CASE WHEN branch_code = '8023' THEN cover_days END)            AS Gujranwala,
          MAX(CASE WHEN branch_code = '8028' THEN cover_days END)            AS Hyderabad,
          MAX(CASE WHEN branch_code = '8029' THEN cover_days END)            AS Islamabad,
          MAX(CASE WHEN branch_code = '8035' THEN cover_days END)            AS Karachi,
          MAX(CASE WHEN branch_code = '8044' THEN cover_days END)            AS Korangi,
          MAX(CASE WHEN branch_code = '8046' THEN cover_days END)            AS Lahore,
          MAX(CASE WHEN branch_code = '8056' THEN cover_days END)            AS Mingora,
          MAX(CASE WHEN branch_code = '8059' THEN cover_days END)            AS Multan,
          MAX(CASE WHEN branch_code = '8070' THEN cover_days END)            AS Peshawar,
          MAX(CASE WHEN branch_code = '8072' THEN cover_days END)            AS Quetta,
          MAX(CASE WHEN branch_code = '8085' THEN cover_days END)            AS Sukkur,
          ROUND(AVG(cover_days), 0)                                          AS Total
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
