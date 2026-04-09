import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const {
      endDate,
      classification,
      sku,
      branch,
    } = req.query;

    const sql = `
    WITH inv_value AS (
        SELECT
            CASE
                WHEN dsmh.item_code NOT LIKE 'F%' THEN (dsmh.item_code::bigint)::TEXT
                ELSE dsmh.item_code
            END                                                             AS item_code_clean,
            dmpm.classification,
            dmpm.item_desc,
            sil.sale_loc::TEXT                                              AS branch_code,
            sil.sale_loc_desc                                               AS branch_desc,
            SUM(dsmh.qty * dsmh.item_cost)                                  AS inv_val
        FROM daily_stock_movement_history dsmh
        LEFT OUTER JOIN dist_metric_prod_mapping dmpm
            ON dmpm.sap_code::TEXT =
               CASE
                   WHEN dsmh.item_code NOT LIKE 'F%' THEN (dsmh.item_code::bigint)::TEXT
                   ELSE dsmh.item_code
               END
        LEFT OUTER JOIN sales_inv_locations sil ON sil.inv_sloc::TEXT = dsmh.subinventory_code
        WHERE dsmh.stock_opening_date = (
            SELECT MAX(stock_opening_date)
            FROM daily_stock_movement_history
            WHERE stock_opening_date = (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
            AND busline_code IN ('P07','P08','P12')
        )
        AND dsmh.busline_code IN ('P07','P08','P12')
        AND dsmh.subinventory_code LIKE '80%'
        ${sku ? `AND dmpm.sap_code::text IN (:sku)` : ""}
        ${branch ? `AND sil.sale_loc::text IN (:branch)` : ""}
        ${classification ? `AND dmpm.classification::text IN (:classification)` : ""}
        GROUP BY
            CASE
                WHEN dsmh.item_code NOT LIKE 'F%' THEN (dsmh.item_code::bigint)::TEXT
                ELSE dsmh.item_code
            END,
            sil.sale_loc,
            sil.sale_loc_desc,
            dmpm.classification,
            dmpm.item_desc
    ),
    filtered_targets AS (
        SELECT
            t01.loc_code::TEXT                                              AS branch_code,
            t03.classification,
            t03.item_desc,
            SUM(t01.target_value)                                           AS trg_value
        FROM mv_tscl_spl_target t01
        LEFT OUTER JOIN dist_metric_prod_mapping t03 ON t03.sap_code::TEXT = t01.item_code::TEXT
        WHERE t01.target_date BETWEEN DATE_TRUNC('month', :endDate::date)
          AND (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date
        ${sku ? `AND t01.item_code::text IN (:sku)` : ""}
        ${branch ? `AND t01.loc_code::text IN (:branch)` : ""}
        ${classification ? `AND t03.classification::text IN (:classification)` : ""}
        GROUP BY t01.loc_code, t03.classification, t03.item_desc
    ),
    days_calc AS (
        SELECT EXTRACT(DAY FROM (DATE_TRUNC('month', :endDate::date) + INTERVAL '1 month' - INTERVAL '1 day')::date) AS total_days_in_month
    ),
    aggregated AS (
        SELECT
            iv.item_code_clean,
            iv.classification,
            iv.item_desc,
            iv.branch_code,
            iv.branch_desc,
            iv.inv_val,
            ft.trg_value
        FROM inv_value iv
        LEFT JOIN filtered_targets ft ON iv.branch_code = ft.branch_code
                                      AND iv.classification = ft.classification
                                      AND iv.item_desc = ft.item_desc
    ),
    cover_days_detail AS (
        SELECT
            a.item_code_clean,
            a.classification,
            a.item_desc,
            a.branch_code,
            a.branch_desc,
            a.inv_val,
            a.trg_value,
            ROUND(
                a.trg_value::numeric /
                NULLIF(dc.total_days_in_month, 0)
            , 1)                                                            AS daily_target,
            ROUND(
                CASE
                    WHEN ABS(COALESCE(a.inv_val, 0)) < 0.001 THEN 0
                    ELSE COALESCE(a.inv_val, 0)
                END::numeric /
                NULLIF(
                    a.trg_value::numeric /
                    NULLIF(dc.total_days_in_month, 0)
                , 0)
            , 1)                                                            AS cover_days
        FROM aggregated a
        CROSS JOIN days_calc dc
    ),
    totals AS (
        SELECT
            branch_code,
            branch_desc,
            classification,
            COUNT(DISTINCT item_code_clean)                                 AS total_sku,
            COUNT(DISTINCT CASE
                WHEN classification = 'A' AND COALESCE(cover_days, 0) > 30  AND COALESCE(cover_days, 0) < 9999 THEN item_code_clean
                WHEN classification = 'B' AND COALESCE(cover_days, 0) > 20  AND COALESCE(cover_days, 0) < 9999 THEN item_code_clean
                WHEN classification = 'C' AND COALESCE(cover_days, 0) > 15  AND COALESCE(cover_days, 0) < 9999 THEN item_code_clean
            END)                                                            AS sku_above_threshold
        FROM cover_days_detail
        GROUP BY branch_code, branch_desc, classification
    )
    SELECT
        t.branch_desc                                                       AS branch,
        MAX(CASE WHEN classification = 'A' THEN
            ROUND(sku_above_threshold::numeric / NULLIF(total_sku::numeric, 0) * 100, 2)
        END)                                                                AS "SKU-A%",
        MAX(CASE WHEN classification = 'B' THEN
            ROUND(sku_above_threshold::numeric / NULLIF(total_sku::numeric, 0) * 100, 2)
        END)                                                                AS "SKU-B%",
        MAX(CASE WHEN classification = 'C' THEN
            ROUND(sku_above_threshold::numeric / NULLIF(total_sku::numeric, 0) * 100, 2)
        END)                                                                AS "SKU-C%"
    FROM totals t
    WHERE t.branch_code IN ('8006','8018','8019','8023','8028','8029','8035','8044','8046','8056','8059','8070','8072','8085')
    GROUP BY t.branch_code, t.branch_desc
    ORDER BY t.branch_desc;
    `;

    const replacements = { endDate };
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from service measure`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching service measure:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
