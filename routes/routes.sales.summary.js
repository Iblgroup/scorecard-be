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
      with sale as (
      select
        count(distinct a.item_code) sku,
        a.classification ,
      --    a.data_flag,billing_date, item_code,
      --    a.branch_id,
          SUM(amount) AS amount,0 target_value
      FROM vw_mv_tscl_data_ a
      WHERE a.billing_date BETWEEN :startDate AND :endDate
      and a.classification = a.classification and
      a.branch_id = a.branch_id and  item_code = item_code
      group by a.classification
      --    AND a.item_code = '1013000071'
      --    AND a.branch_id = '8001'
      --    AND a.data_flag = 'Secondary Sales'
      )
      select
      a.classification,
      a.sku
      ,sum(amount)amount
      from sale a
      group by a.classification,a.sku
      ;
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
