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
    select  t01.material_type_description ,t02."PRD" as "Material Name",sum(wip_value) as "WIP Value" , sum(t01.wip )
      as "Quantity" from sap_wip_data t01
      left outer join vw_items_class t02
      on t01.item_code = t02.mapping_code
      WHERE t01.record_created_date = (
              SELECT MAX(t01.record_created_date) t01
              FROM sap_wip_data t01
              WHERE t01.record_created_date::date BETWEEN :startDate AND :endDate
          )
      and t01.item_code = t01.item_code and t02.classification = t02.classification
      ${classification ? `AND t02.classification::text IN (:classification)` : ""}
      ${sku ? `AND t02.mapping_code::text IN (:sku)` : ""}
      group by t02."PRD",t01.material_type_description;
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
