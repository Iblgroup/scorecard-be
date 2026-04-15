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
      SELECT
      t01.material_name,
      SUM(t01.so_quantity)    AS total_order_qty,
      SUM(t01.deliverd_qty)   AS total_delivery_qty,
      ROUND(
          SUM(t01.deliverd_qty)::numeric /
          NULLIF(SUM(t01.so_quantity)::numeric, 0) * 100, 2
      ) AS delivery_pct
      FROM vw_dispatch_vs_orders t01
      INNER JOIN vw_items_class t02
          ON t02.mapping_code::text = t01.material_no::text
      WHERE t01.actual_gm_date BETWEEN :startDate AND :endDate
      ${classification ? `AND t02.classification::text IN (:classification)` : ""}
      ${sku ? `AND t02.mapping_code::text IN (:sku)` : ""}
      GROUP BY t01.material_name;
    `;

    const replacements = { startDate, endDate };
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from dispatch vs order`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching dispatch vs order:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
