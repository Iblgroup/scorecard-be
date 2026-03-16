import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { startDate = "2025-07-01", endDate = "2025-11-30", classification } = req.query;

    const categoryFilter = classification ? `AND t02.category = '${classification}'` : "";

    const sql = `
 WITH closing_inv AS (
    SELECT
        CASE
            WHEN ABS(COALESCE(SUM(inv_value), 0)) < 0.001 THEN 0
            ELSE COALESCE(SUM(inv_value), 0)
        END                                                                                             AS Closing_Inventory_IBL
    FROM mv_target_sales_aggregate_25_26 t01
    inner JOIN frg_dist_metric_prod_mapping t02
        ON t01.item_code::text = t02.sap_mapping_code::text
    WHERE t01.data_flag = 'OPS'
    ${categoryFilter}
    AND t01.sale_trg_date >= '2021-06-30' -- this is the hard corded value
    AND t01.sale_trg_date <= '2026-02-28' --- use current date filter apply here
),
ibl_direct_target AS (
    SELECT
        COALESCE(SUM(t01.trg_val), 0)                                                                  AS IBL_Direct_Month_Target
    FROM mv_target_sales_aggregate_25_26 t01
    inner JOIN frg_dist_metric_prod_mapping t02
        ON t01.item_code::text = t02.sap_mapping_code::text
    WHERE t01.data_flag = 'OPS'
    ${categoryFilter}
    AND t01.sale_trg_date BETWEEN '2026-02-01' AND '2026-02-28' -- apply filter
),
ibl_primary_target AS (
    SELECT
        COALESCE(SUM(t01.trg_val), 0)                                                                  AS IBL_Primary_Month_Target
    FROM mv_target_sales_aggregate_25_26 t01
    inner JOIN frg_dist_metric_prod_mapping t02
        ON t01.item_code::text = t02.sap_mapping_code::text
    WHERE t01.data_flag = 'SD'
    ${categoryFilter}
    AND t01.sale_trg_date BETWEEN '2026-02-01' AND '2026-02-28' --apply filter
),
days_calc AS (
    SELECT
        EXTRACT(DAY FROM DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')    AS total_days_in_month,
        EXTRACT(DAY FROM CURRENT_DATE)                                                                  AS days_passed,
        EXTRACT(DAY FROM DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day') -
        EXTRACT(DAY FROM CURRENT_DATE)                                                                  AS remaining_days
)
SELECT
    ci.Closing_Inventory_IBL,
--    d.IBL_Direct_Month_Target,
--    p.IBL_Primary_Month_Target,
--    d.IBL_Direct_Month_Target + p.IBL_Primary_Month_Target                                             AS LatestIBLTarget,
--    dc.total_days_in_month,
--    dc.days_passed,
--    dc.remaining_days,
    ROUND(
        COALESCE(ci.Closing_Inventory_IBL, 0)::numeric /
        NULLIF((d.IBL_Direct_Month_Target + p.IBL_Primary_Month_Target)::numeric, 0) *
        dc.remaining_days
    , 1)                                                                                               AS cover_days
FROM closing_inv ci
CROSS JOIN ibl_direct_target d
CROSS JOIN ibl_primary_target p
CROSS JOIN days_calc dc;
    `;

    const results = await db.sequelize.query(sql, {
      replacements: { startDate, endDate },
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

