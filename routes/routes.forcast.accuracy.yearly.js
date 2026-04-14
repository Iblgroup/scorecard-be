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
      WITH sale AS (
          SELECT
              SUM(amount) AS amount,
              0           AS target_value
          FROM vw_mv_tscl_data_ a
          WHERE a.billing_date BETWEEN :startDate AND :endDate
          GROUP BY a.classification
          UNION ALL
          SELECT
              0                   AS amount,
              SUM(value)   AS target_value
          FROM mv_tscl_budget b
          WHERE b.target_date::date BETWEEN :startDate AND :endDate
              and COALESCE(b.classification, 'Others')  = COALESCE(b.classification, 'Others')  
        and  b.item_code = b.item_code
      )
      SELECT
          SUM(amount)                                 AS amount,
          SUM(target_value)                           AS target_value,
          CASE
              WHEN SUM(amount)       <> 0
              AND SUM(target_value) <> 0
              THEN ROUND(
                      (SUM(amount) / SUM(target_value))::numeric
                  , 2)
              ELSE 0
          END AS pct
      FROM sale a;
    `;

    const replacements = { startDate, endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from forecast accuracy yearly`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching forecast accuracy yearly:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
