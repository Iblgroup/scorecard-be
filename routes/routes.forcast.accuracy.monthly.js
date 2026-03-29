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
with data_ as (
select 
data_flag
,a.item_code
,b.mapping_code 
,b.matnr_desc item_desc,d.matnr_desc unq_item_desc
,sum(a.sale_qty)sale_qty,sum(a.sale_val )sale_val
,sum(a.inv_qty )inv_qty,sum(a.inv_value )inv_value
,sum(a.c_oasales )c_oasales,sum(a.c_asales )c_asales
,sum(a.trg_val )trg_val
from mv_target_sales_aggregate_25_26 a
inner join frg_sap_items_detail b on (a.item_code=b.matnr)
inner join frg_sap_items_detail d on (d.matnr=b.mapping_code)
where a.sale_trg_date between :startDate and :endDate
and b.busline_id in ('P07','P08','P12')
${branch ? `AND a.branch_code::text IN (:branch)` : ""}
group by 
a.item_code
,b.matnr_desc ,b.mapping_code 
,d.matnr_desc ,data_flag
),itm_class as (select distinct sap_mapping_code,classification from frg_dist_metric_prod_mapping fdmpm )
, fdata as (select 
data_flag,
mapping_code item_code
,unq_item_desc item_desc,classification
,sale_qty,sale_val,inv_qty,inv_value,c_oasales,c_asales,trg_val
from data_
left outer join itm_class a on (data_.mapping_code::text=a.sap_mapping_code::text)
)
select 
case when new_total_all_sales=0 then 0 
    else new_total_all_sales/trg_val end forecast_accuracy_pct
,new_total_all_sales
,trg_val period_sales_trg_ibl_primary
from (
select 
(sum(case when data_flag='SD' then (sale_val) else 0 end) +
sum(
	case when data_flag='OPS'  then (c_oasales*-1) 
	   else 0 end))new_total_all_sales	 
	   ,sum(trg_val)trg_val 
from fdata
where 1=1
${classification ? `AND classification::text IN (:classification)` : ""}
${sku ? `AND item_code::text IN (:sku)` : ""}
)a
;
    `;

    const replacements = { startDate, endDate };
    if (classification) replacements.classification = Array.isArray(classification) ? classification : [classification];
    if (sku) replacements.sku = Array.isArray(sku) ? sku : [sku];
    if (branch) replacements.branch = Array.isArray(branch) ? branch : [branch];

    const results = await db.sequelize.query(sql, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    console.log(`Fetched ${results.length} records from forecast accuracy monthly`);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Error fetching forecast accuracy monthly:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
});

export default router;
