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
      WITH sku_base AS (
      SELECT DISTINCT (mapping_code) AS mapping_code, classification
      FROM vw_items_class
      WHERE 1=1
      ${classification ? `AND classification::text IN (:classification)` : ""}
      ),
      inv_value AS
      (
      SELECT
              dmpm.mapping_code,
              SUM(dsmh.qty * dsmh.trade_price)        AS inv_val
          FROM daily_stock_movement_history dsmh
          LEFT OUTER JOIN vw_items_class dmpm
              ON dmpm.mapping_code::TEXT =
                CASE
                    WHEN dsmh.item_code NOT LIKE 'F%' THEN (dsmh.item_code::bigint)::TEXT
                    ELSE dsmh.item_code
                END
          LEFT OUTER JOIN sales_inv_locations sil ON sil.inv_sloc::TEXT = dsmh.subinventory_code
          WHERE dsmh.stock_closing_date = (
              SELECT MAX(stock_closing_date)
              FROM daily_stock_movement_history d
              WHERE d.stock_closing_date BETWEEN :startDate AND :endDate
              AND d.busline_code IN ('P07','P08','P12')
          )
          AND dsmh.busline_code IN ('P07','P08','P12')
          AND dsmh.subinventory_code LIKE '80%'
        ${sku ? `AND dmpm.mapping_code::text IN (:sku)` : ""}
        ${branch ? `AND dsmh.subinventory_code::text IN (:branch)` : ""}
          GROUP BY  dmpm.mapping_code
      ),
      filtered_targets AS (
      SELECT (t03.mapping_code) AS mapping_code,
      SUM(t01.target_value) AS trg_value
      FROM mv_tscl_spl_target t01
      LEFT JOIN vw_items_class t03
      ON t03.mapping_code::text= t01.item_code::text
   WHERE DATE_TRUNC('month',t01.target_date)=DATE_TRUNC('month',CAST(:endDate AS date))
        ${sku ? `AND t03.mapping_code::text IN (:sku)` : ""}
        ${branch ? `AND t01.loc_code::text IN (:branch)` : ""}
      --and t01.loc_code = '8006'
      GROUP BY (t03.mapping_code)
      ),
  days_calc AS (
        SELECT EXTRACT(DAY FROM (DATE_TRUNC('month',CAST(:endDate AS date))+INTERVAL '1 month - 1 day'))::int AS total_days
        ),
      sku_summary AS (
      SELECT sb.mapping_code,sb.classification,
      COALESCE(iv.inv_val,0) AS total_inv,
      COALESCE(ft.trg_value,0) AS total_trg,
      ROUND(COALESCE(iv.inv_val,0)::numeric/NULLIF(COALESCE(ft.trg_value,0)::numeric/dc.total_days,0),1) AS cover_days
      FROM sku_base sb
      LEFT JOIN inv_value iv ON sb.mapping_code=iv.mapping_code
      LEFT JOIN filtered_targets ft ON sb.mapping_code=ft.mapping_code
      CROSS JOIN days_calc dc
      )
      SELECT classification,
      COUNT(CASE WHEN classification='A' AND cover_days>30 THEN 1
      WHEN classification='B' AND cover_days>20 THEN 1
      WHEN classification='C' AND cover_days>15 THEN 1 END) AS "No Of SKUs > Threshold",
      COUNT(CASE WHEN classification='A' AND cover_days<=30 THEN 1
      WHEN classification='B' AND cover_days<=20 THEN 1
      WHEN classification='C' AND cover_days<=15 THEN 1 END) AS "No Of SKUs < Threshold"
      FROM sku_summary
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
    console.log(`Fetched ${results.length} records from above below threshold`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching above below threshold:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
