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
    WITH ibl_target AS (
        SELECT COALESCE(t03.classification,'Other') AS classification, SUM(t01.target_value) AS ibl_trg
        FROM mv_tscl_spl_target t01
        INNER JOIN sap_items_detail t02 ON t01.item_code = t02.matnr
        LEFT JOIN dist_metric_prod_mapping t03 ON t03.sap_code = t01.item_code
        WHERE t01.target_date BETWEEN :startDate AND :endDate
        ${sku ? `AND t01.item_code::text IN (:sku)` : ""}
        ${classification ? `AND t03.classification::text IN (:classification)` : ""}
        ${branch ? `AND t01.loc_code::text IN (:branch)` : ""}
        GROUP BY 1
    ),
    tscl_target AS (
        SELECT COALESCE(t03.classification,'Other') AS classification, SUM(t01.efp*t01.value) AS tscl_trg
        FROM tscl_sap_targets t01
        INNER JOIN sap_items_detail t02 ON t01.material_code::text = t02.matnr::text
        LEFT JOIN dist_metric_prod_mapping t03 ON t03.sap_code::text = t01.material_code::text
        WHERE t01.target_date BETWEEN :startDate AND :endDate
        ${sku ? `AND t01.material_code::text IN (:sku)` : ""}
        ${classification ? `AND t03.classification::text IN (:classification)` : ""}
        GROUP BY 1
    ),
    final AS (
        SELECT COALESCE(i.classification, t.classification) AS classification,
        COALESCE(i.ibl_trg, 0) AS ibl_primary_target,
        COALESCE(t.tscl_trg, 0) AS tscl_trg,
        COALESCE(t.tscl_trg, 0) - COALESCE(i.ibl_trg, 0) AS ibl_vs_tscl_target_diff,
        ROUND((COALESCE(i.ibl_trg, 0)*100.0/NULLIF(COALESCE(t.tscl_trg, 0), 0))::numeric, 2) AS forecast_vs_budget_pct
        FROM ibl_target i
        FULL OUTER JOIN tscl_target t ON i.classification = t.classification
    )
    SELECT * FROM final
    UNION ALL
    SELECT 'Total',
    SUM(ibl_primary_target),
    SUM(tscl_trg),
    SUM(ibl_vs_tscl_target_diff),
    ROUND((SUM(ibl_primary_target)*100.0/NULLIF(SUM(tscl_trg), 0))::numeric, 2)
    FROM final;
    `;

    const replacements = { startDate, endDate };
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from ibl vs tscl`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching ibl vs tscl:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
