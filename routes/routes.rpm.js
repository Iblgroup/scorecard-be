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
  //${branch ? `AND sttd.branch_code::text IN (SELECT branch_code FROM locations WHERE branch_code IN (:branch))` : ""}
  //${sku ? `AND sttd.product::text IN (SELECT sap_mapping_code::text FROM frg_dist_metric_prod_mapping WHERE sap_mapping_code::text IN (:sku))` : ""}
  //${classification ? `AND sttd.product::text IN (SELECT sap_mapping_code::text FROM frg_dist_metric_prod_mapping WHERE classification::text IN (:classification))` : ""}
    const sql = `
    SELECT
        sttd.materialname,
        sttd.producttype,
            sttd.plant,
        sttd.storagelocation ,
        COALESCE(sttd.storagelocationname, 'NA') AS storagelocationname,
        sttd.plantname,
        SUM(sttd.valuatedgrblocked)         AS gr_blocked_val,
        SUM(sttd.valueunrestricted)         AS unrestricted_val,
        SUM(sttd.valuequalityinspection)    AS quality_inspection_val,
        SUM(sttd.valuereturns)              AS returns_val,
        SUM(sttd.valuestktransferstloc)     AS storage_location_val,
        SUM(sttd.valuestocktransferplant)   AS stock_transfer_plant_val,
        SUM(sttd.valuestockintransit)       AS stock_in_transit_val,
        SUM(sttd.valueblocked)              AS blocked_val,
        SUM(sttd.valuerestricted)           AS restricted_val,
        SUM(sttd.valuetiedempties)          AS tied_empties_val,
    --    SUM(sttd.valuevaluatedgrblocked)    AS valuated_gr_blocked,
        SUM(
            sttd.valuatedgrblocked        +
            sttd.valueunrestricted        +
            sttd.valuequalityinspection   +
            sttd.valuereturns             +
            sttd.valuestktransferstloc    +
            sttd.valuestocktransferplant  +
            sttd.valuestockintransit      +
            sttd.valueblocked             +
            sttd.valuerestricted          +
            sttd.valuetiedempties         
        ) AS total_val,
        sum(sttd.unrestricted ) as unrestricted_qty,
        sum(sttd.qualityinspection ) as qualityinspection_qty,
        sum(sttd."returns" ) as return_qty,
        sum(sttd.stocktransferstoragelocation ) as stocktransferstoragelocation_qty,
        sum(sttd.stocktransferplant  ) as stocktransferplant_qty,
        sum(sttd.stockintransit ) as stockintransit_qty,
        sum(sttd."blocked" ) as blocked_qty,
        sum(sttd.restricted ) as restricted_qty,
        sum(sttd.tiedempties ) as tiedempties_qty,
        sum(sttd.unrestricted +
            sttd.qualityinspection +
            sttd."returns"+
            sttd.stocktransferstoragelocation +
            sttd.stocktransferplant +
            sttd."blocked" +
            sttd.restricted +
            sttd.tiedempties
        ) as total_qty
    FROM sap_tpkg_traw_data sttd
    WHERE sttd.executiondate = (
        SELECT MAX(sttd.executiondate)
        FROM sap_tpkg_traw_data sttd
        WHERE sttd.executiondate BETWEEN :startDate AND :endDate
    )
    GROUP BY sttd.materialname, sttd.producttype,sttd.plant, sttd.storagelocation ,  COALESCE(sttd.storagelocationname, 'NA'), sttd.plantname
    `;

    const replacements = {};
    if (startDate) replacements.startDate = startDate;
    if (endDate) replacements.endDate = endDate;
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
