import express from "express";
import db from "../models/index.js";

const router = express.Router();
// ${branch ? `AND t01.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
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
      select
          t01.material_name,
          SUM(t01.deliverd_qty) AS total_delivery_qty,
          SUM(t01.so_quantity) AS total_order_qty,
          ROUND(
              SUM(t01.deliverd_qty)::numeric /
              NULLIF(SUM(t01.so_quantity)::numeric, 0) * 100, 2) AS delivery_pct
      FROM vw_dispatch_vs_orders t01
      inner JOIN frg_dist_metric_prod_mapping t02
          ON t02.sap_mapping_code::text = t01.material_no::text
      WHERE
      t02.category IN ('A', 'B', 'C') AND
      t01.order_date BETWEEN :startDate AND :endDate
      ${classification ? `AND t02.classification::text IN (:classification)` : ""}
      ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
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
