import express from "express";
import db from "../models/index.js";

const router = express.Router();
// ${sku ? 'AND t01.sap_mapping_code::text IN (:sku)' : ''}
// ${classification ? 'AND t01.classification::text IN (:classification)' : ''}
router.get("/", async (req, res) => {
  try {
    const { classification, sku } = req.query;
    const sql = `
select t01.classification ,count(*) from frg_dist_metric_prod_mapping t01
group by t01.classification;
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
