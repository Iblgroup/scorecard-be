import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { startDate = new Date().toISOString().slice(0, 10), classification } = req.query;
    const sql = `
      WITH cover_days_per_sku AS (
    SELECT
        t02.category,
        t02.sap_mapping_code,
        t02.tgt,
        t02.classification,
        ROUND(
            -- Inventory: OPS from 2021-06-30 up to startDate
            ABS(COALESCE(
                SUM(
                    CASE
                        WHEN t01.data_flag = 'OPS'
                         AND t01.sale_trg_date >= '2021-06-30'
                         AND t01.sale_trg_date <= :startDate
                        THEN t01.inv_value
                        ELSE 0
                    END
                ), 0
            ))::numeric
            /
            -- Target: OPS + SD for the month of startDate
            NULLIF(
                (
                    SUM(
                        CASE
                            WHEN t01.data_flag = 'OPS'
                             AND t01.sale_trg_date >= DATE_TRUNC('month', :startDate::date)::date
                             AND t01.sale_trg_date < (DATE_TRUNC('month', :startDate::date) + INTERVAL '1 month')::date
                            THEN COALESCE(t01.trg_val, 0)
                            ELSE 0
                        END
                    ) +
                    SUM(
                        CASE
                            WHEN t01.data_flag = 'SD'
                             AND t01.sale_trg_date >= DATE_TRUNC('month', :startDate::date)::date
                             AND t01.sale_trg_date < (DATE_TRUNC('month', :startDate::date) + INTERVAL '1 month')::date
                            THEN COALESCE(t01.trg_val, 0)
                            ELSE 0
                        END
                    )
                )::numeric, 0
            )
            *
            -- Remaining days in the month of startDate
            (
                EXTRACT(DAY FROM DATE_TRUNC('month', :startDate::date) + INTERVAL '1 month - 1 day') -
                EXTRACT(DAY FROM :startDate::date)
            )
        , 0) AS cover_days
    FROM mv_target_sales_aggregate_25_26 t01
    INNER JOIN frg_dist_metric_prod_mapping t02
        ON t01.item_code::text = t02.sap_mapping_code::text
    WHERE t02.category IN ('A', 'B', 'C')
    ${classification ? `AND t02.category = :classification` : ""}
    GROUP BY t02.category, t02.sap_mapping_code, t02.tgt, t02.classification
)
SELECT
    classification,
    MAX(tgt) AS cover_days_tgt,
    ROUND(AVG(cover_days), 0) AS actual_cover_days
FROM cover_days_per_sku
GROUP BY classification
ORDER BY classification;
    `;
    const replacements = { startDate };
    if (classification) replacements.classification = classification;

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

