import express from "express";
import db from "../models/index.js";

const router = express.Router();
// ${sku ? 'AND t01.sap_mapping_code::text IN (:sku)' : ''}
// ${classification ? 'AND t01.classification::text IN (:classification)' : ''}
router.get("/", async (req, res) => {
  try {
    const { classification, sku } = req.query;
    const sql = `
select dmpm.sap_code , dmpm.item_desc ,dmpm.classification  from dist_metric_prod_mapping dmpm ;
    `;
    const replacements = {};
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from filters`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching filters:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

router.get("/branches", async (req, res) => {
  try {
    const { classification, sku } = req.query;
    const sql = `
select distinct sil.sale_loc ,sil.sale_loc_desc  from sales_inv_locations sil ;
    `;
    const replacements = {};
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from filters`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching filters:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
