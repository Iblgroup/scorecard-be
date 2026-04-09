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
    select coalesce(t03.classification,'Others') classification ,count(distinct item_code) sku ,sum(gross_amount) new_total_all_sales
    from mv_tscl_data_2025_26 t01
    inner join sap_items_detail t02 on (t01.item_code = t02.matnr)
    left outer join dist_metric_prod_mapping t03 on (t03.sap_code = t01.item_code)
    where billing_date BETWEEN :startDate AND :endDate
    ${branch ? `AND a.branch_code::text IN (:branch)` : ""}
    ${classification ? `AND classification::text IN (:classification)` : ""}
    ${sku ? `AND item_code::text IN (:sku)` : ""}
    group by classification ;
    `;

    const replacements = { startDate, endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from sales summary`);
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
