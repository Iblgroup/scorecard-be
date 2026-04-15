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
      SELECT t02."PRD" AS "item desc", SUM(t01.wip_value) AS "Wip_total"
      FROM sap_wip_data t01
      LEFT OUTER JOIN vw_items_class t02 ON t02.mapping_code::TEXT = t01.item_code::TEXT
      WHERE t01.record_created_date = (
          SELECT MAX(d.record_created_date)
          FROM sap_wip_data d
          WHERE d.record_created_date::date BETWEEN :startDate AND :endDate
      )
      ${classification ? `AND t02.classification::text IN (:classification)` : ""}
      ${sku ? `AND t02.mapping_code::text IN (:sku)` : ""}
      GROUP BY t02."PRD"
      ORDER BY t02."PRD";
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
