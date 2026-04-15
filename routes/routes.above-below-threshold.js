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
        SELECT DISTINCT TRIM(mapping_code) AS mapping_code, classification
        FROM dist_prod_mapping_temp
        WHERE classification IN ('A','B','C')
        ${classification ? `AND classification::text IN (:classification)` : ""}
        ${sku ? `AND mapping_code::text IN (:sku)` : ""}
        ),
        inv_value AS (
        SELECT TRIM(dmpm.mapping_code) AS mapping_code,
        SUM(dsmh.qty * dsmh.trade_price) AS inv_val
        FROM daily_stock_movement_history dsmh
        LEFT JOIN dist_prod_mapping_temp dmpm
        ON TRIM(dmpm.mapping_code)=TRIM(CASE WHEN dsmh.item_code NOT LIKE 'F%' THEN (dsmh.item_code::bigint)::TEXT ELSE dsmh.item_code END)
        WHERE dsmh.stock_opening_date=(
        SELECT MAX(stock_opening_date)
        FROM daily_stock_movement_history d
        WHERE d.stock_opening_date BETWEEN :startDate AND :endDate
        AND d.busline_code IN ('P07','P08','P12')
        )
        AND dsmh.busline_code IN ('P07','P08','P12')
        AND dsmh.subinventory_code LIKE '80%'
        ${classification ? `AND dmpm.classification::text IN (:classification)` : ""}
        ${sku ? `AND dsmh.item_code::text IN (:sku)` : ""}
        ${branch ? `AND dsmh.subinventory_code::text IN (:branch)` : ""}
        --dsmh.subinventory_code = '8006'
        GROUP BY TRIM(dmpm.mapping_code)
        ),
        filtered_targets AS (
        SELECT TRIM(t03.mapping_code) AS mapping_code,
        SUM(t01.target_value) AS trg_value
        FROM mv_tscl_spl_target t01
        LEFT JOIN dist_prod_mapping_temp t03
        ON TRIM(t03.mapping_code)=TRIM(t01.item_code)
        WHERE DATE_TRUNC('month',t01.target_date)=DATE_TRUNC('month',CAST(:endDate AS date))
        ${classification ? `AND t03.classification::text IN (:classification)` : ""}
        ${sku ? `AND t01.item_code::text IN (:sku)` : ""}
        ${branch ? `AND t01.loc_code::text IN (:branch)` : ""}
        --and t01.loc_code = '8006'
        GROUP BY TRIM(t03.mapping_code)
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
