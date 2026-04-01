import express from "express";
import db from "../models/index.js";

const router = express.Router();
//${branch ? `AND sttd.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
//  ${sku ? `AND sttd.product::text IN (SELECT sap_mapping_code::text FROM frg_dist_metric_prod_mapping WHERE sap_mapping_code::text IN (:sku))` : ""}
// ${classification ? `AND sttd.product::text IN (SELECT sap_mapping_code::text FROM frg_dist_metric_prod_mapping WHERE classification::text IN (:classification))` : ""}
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
          sttd.producttype,
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
          ) AS total_value
      FROM vw_sap_tpkg_traw_data sttd
      WHERE sttd.executiondate = (SELECT MAX(sttd.executiondate) FROM vw_sap_tpkg_traw_data sttd
      WHERE sttd.executiondate BETWEEN :startDate AND :endDate)
      GROUP BY sttd.materialname,sttd.producttype;
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
