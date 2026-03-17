import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { date = new Date().toISOString().slice(0, 10), category = 'A' } = req.query;
    const sql = `
      SELECT
      --    sttd.producttype,
          sttd.materialname,
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
              sttd.valuetiedempties         +
              sttd.valuevaluatedgrblocked
          )                                 AS total_value
      FROM sap_tpkg_traw_data sttd
      GROUP BY sttd.producttype, sttd.materialname
      ORDER BY sttd.producttype, sttd.materialname;
    `;
    const results = await db.sequelize.query(sql, {
      replacements: { date, category },
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

