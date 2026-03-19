import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { classification, sku } = req.query;
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
      )
      SELECT DISTINCT
          l.branch_desc,
          bm.hub_branch_code AS branch_code,
          t02.classification,
          t02.item_desc AS sku,
          t02.sap_mapping_code
      FROM mv_target_sales_aggregate_25_26 t01
      INNER JOIN frg_dist_metric_prod_mapping t02
          ON t01.item_code::text = t02.sap_mapping_code::text
      INNER JOIN branch_mapping bm
          ON t01.branch_code::text = bm.storage_location_code
      INNER JOIN locations l
          ON l.branch_code = bm.hub_branch_code
      WHERE t02.classification IS NOT NULL
        AND TRIM(t02.classification) <> ''
        ${classification ? 'AND t02.classification::text IN (:classification)' : ''}
        ${sku ? 'AND t02.sap_mapping_code::text IN (:sku)' : ''}
    `;
    const replacements = {};
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from filters`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching filters:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
