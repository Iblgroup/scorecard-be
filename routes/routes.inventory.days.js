import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const {
      startDate = "2026-03-01",
      endDate = "2026-03-31",
      classification,
      sku,
      branch,
    } = req.query;

    const sql = `
        WITH branch_mapping AS (
            SELECT * FROM (VALUES
                ('8005','8006'), ('8006','8006'), ('8026','8006'), ('8027','8006'),
                ('8039','8006'), ('8073','8006'), ('8075','8006'),
                ('8018','8018'),
                ('8010','8019'), ('8019','8019'), ('8032','8019'), ('8042','8019'),
                ('8055','8019'), ('8077','8019'), ('8078','8019'), ('8080','8019'), ('8089','8019'),
                ('8023','8023'), ('8024','8023'), ('8025','8023'), ('8041','8023'),
                ('8050','8023'), ('8063','8023'), ('8083','8023'),
                ('8004','8028'), ('8017','8028'), ('8028','8028'), ('8201','8028'),
                ('8058','8028'), ('8067','8028'), ('8064','8028'), ('8086','8028'),
                ('8087','8028'), ('8090','8028'),
                ('8001','8029'), ('8003','8029'), ('8013','8029'), ('8021','8029'),
                ('8022','8029'), ('8094','8029'), ('8029','8029'), ('8202','8029'),
                ('8033','8029'), ('8045','8029'), ('8051','8029'), ('8057','8029'),
                ('8061','8029'), ('8074','8029'), ('8092','8029'),
                ('8035','8035'), ('8203','8035'), ('8095','8035'), ('8036','8035'),
                ('8065','8035'), ('8084','8035'),
                ('8034','8044'), ('8044','8044'), ('8211','8044'),
                ('8014','8046'), ('8037','8046'), ('8046','8046'), ('8204','8046'),
                ('8097','8046'), ('8060','8046'), ('8068','8046'), ('8069','8046'),
                ('8071','8046'), ('8076','8046'), ('8081','8046'),
                ('8008','8056'), ('8011','8056'), ('8056','8056'), ('8088','8056'),
                ('8002','8059'), ('8012','8059'), ('8016','8059'), ('8031','8059'),
                ('8040','8059'), ('8048','8059'), ('8054','8059'), ('8059','8059'),
                ('8205','8059'), ('8062','8059'), ('8091','8059'),
                ('8007','8070'), ('8009','8070'), ('8015','8070'), ('8043','8070'),
                ('8052','8070'), ('8066','8070'), ('8070','8070'), ('8207','8070'),
                ('8079','8070'),
                ('8049','8072'), ('8072','8072'),
                ('8020','8085'), ('8030','8085'), ('8038','8085'), ('8047','8085'),
                ('8053','8085'), ('8082','8085'), ('8085','8085'),
                ('8096','8096'),
                ('8212','8206'), ('8206','8206'), ('8208','8206'), ('8209','8206'),
                ('8210','8210')
            ) AS t(storage_location_code, hub_branch_code)
        ),
        closing_inv AS (
            SELECT
                t02.category,
                bm.hub_branch_code AS branch_code,
                t02.item_desc,
                SUM(COALESCE(t01.inv_value, 0)) AS closing_inventory
            FROM mv_target_sales_aggregate_25_26 t01
            INNER JOIN frg_dist_metric_prod_mapping t02
                ON t01.item_code::text = t02.sap_mapping_code::text
            INNER JOIN branch_mapping bm
                ON t01.branch_code::text = bm.storage_location_code
            WHERE t01.data_flag = 'OPS'
            AND t01.sale_trg_date BETWEEN :startDate AND :endDate
            ${classification ? `AND t02.classification::text IN (:classification)` : ""}
            ${branch ? `AND bm.hub_branch_code::text IN (:branch)` : ""}
            ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
            GROUP BY t02.category, bm.hub_branch_code, t02.item_desc
        ),
        ibl_targets AS (
            SELECT
                t02.category,
                bm.hub_branch_code AS branch_code,
                t02.item_desc,
                SUM(CASE WHEN t01.data_flag = 'OPS' THEN COALESCE(t01.trg_val, 0) ELSE 0 END) AS direct_target,
                SUM(CASE WHEN t01.data_flag = 'SD'  THEN COALESCE(t01.trg_val, 0) ELSE 0 END) AS primary_target
            FROM mv_target_sales_aggregate_25_26 t01
            INNER JOIN frg_dist_metric_prod_mapping t02
                ON t01.item_code::text = t02.sap_mapping_code::text
            INNER JOIN branch_mapping bm
                ON t01.branch_code::text = bm.storage_location_code
            WHERE t01.sale_trg_date BETWEEN :startDate AND :endDate
            ${classification ? `AND t02.classification::text IN (:classification)` : ""}
            ${sku ? `AND t02.sap_mapping_code::text IN (:sku)` : ""}
            ${branch ? `AND bm.hub_branch_code::text IN (:branch)` : ""}
            GROUP BY t02.category, bm.hub_branch_code, t02.item_desc
        ),
        days_calc AS (
            SELECT
                EXTRACT(DAY FROM DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day') -
                EXTRACT(DAY FROM CURRENT_DATE) AS remaining_days
        ),
        cover_days_detail AS (
            SELECT
                ci.category,
                ci.branch_code,
                ci.item_desc,
                ROUND(
                    ci.closing_inventory::numeric /
                    NULLIF((it.direct_target + it.primary_target)::numeric, 0) *
                    dc.remaining_days
                , 0) AS cover_days
            FROM closing_inv ci
            INNER JOIN ibl_targets it
                ON ci.category = it.category
                AND ci.branch_code = it.branch_code
                AND ci.item_desc = it.item_desc
            CROSS JOIN days_calc dc
        )
        SELECT
            category,
            item_desc,
            MAX(CASE WHEN branch_code = '8006' THEN cover_days END) AS Bahawalpur,
            MAX(CASE WHEN branch_code = '8018' THEN cover_days END) AS DSS_Korangi,
            MAX(CASE WHEN branch_code = '8019' THEN cover_days END) AS Faisalabad,
            MAX(CASE WHEN branch_code = '8023' THEN cover_days END) AS Gujranwala,
            MAX(CASE WHEN branch_code = '8028' THEN cover_days END) AS Hyderabad,
            MAX(CASE WHEN branch_code = '8029' THEN cover_days END) AS Islamabad,
            MAX(CASE WHEN branch_code = '8035' THEN cover_days END) AS Karachi,
            MAX(CASE WHEN branch_code = '8044' THEN cover_days END) AS Korangi,
            MAX(CASE WHEN branch_code = '8046' THEN cover_days END) AS Lahore,
            MAX(CASE WHEN branch_code = '8056' THEN cover_days END) AS Mingora,
            MAX(CASE WHEN branch_code = '8059' THEN cover_days END) AS Multan,
            MAX(CASE WHEN branch_code = '8070' THEN cover_days END) AS Peshawar,
            MAX(CASE WHEN branch_code = '8072' THEN cover_days END) AS Quetta,
            MAX(CASE WHEN branch_code = '8085' THEN cover_days END) AS Sukkur,
            ROUND(AVG(cover_days), 0) AS Total
        FROM cover_days_detail
        GROUP BY category, item_desc
        ORDER BY category, item_desc;
    `;

    const replacements = { startDate, endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from inventory days`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching inventory days:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
