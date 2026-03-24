import express from "express";
import db from "../models/index.js";

const router = express.Router();
// ${branch ? `AND sttd.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
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
          sttd.materialname,
          SUM(
              sttd.valuatedgrblocked        +
              sttd.valueunrestricted        +
              sttd.valuequalityinspection   +
              sttd.valuereturns             +
              sttd.valuestktransferstloc    +
              sttd.valuestocktransferplant  +
              sttd.valuestockintransit      +
              sttd.valueblocked             +
              sttd.valuerestricted          +
              sttd.valuetiedempties         +
              sttd.valuevaluatedgrblocked
          )                                 AS total_value
      FROM vw_sap_tpkg_traw_data sttd
      LEFT JOIN frg_dist_metric_prod_mapping t02
          ON t02.sap_mapping_code::text = sttd.product::text
      WHERE 1=1
      ${startDate && endDate ? `AND sttd.recorddate BETWEEN :startDate AND :endDate` : ""}
      ${classification ? `AND t02.classification::text IN (:classification)` : ""}
      ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
      GROUP BY sttd.materialname;
    `;

    const replacements = {};
    if (startDate) replacements.startDate = startDate;
    if (endDate) replacements.endDate = endDate;
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
