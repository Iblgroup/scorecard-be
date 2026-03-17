import express from "express";
import db from "../models/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { date = new Date().toISOString().slice(0, 10), category = 'A' } = req.query;
    const sql = `
        select swd.material_description as "item desc" ,sum(swd.total_value) as "Wip_total" from sap_wip_data swd
        group by material_description ;
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

