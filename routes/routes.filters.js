import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { date = new Date().toISOString().slice(0, 10) } = req.query;
    const sql = `
      SELECT DISTINCT
          l.branch_desc,
          t02.classification,
          t02.uniqueproductname as sku
      FROM mv_target_sales_aggregate_25_26 t01
      INNER JOIN frg_dist_metric_prod_mapping t02
          ON t01.item_code::text = t02.sap_mapping_code::text
      INNER JOIN locations l
          ON l.branch_code = t01.branch_code::text
      WHERE t02.classification IS NOT NULL
      AND TRIM(t02.classification) <> '';
    `;
    const results = await db.sequelize.query(sql, {
      replacements: { date },
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

