import express from 'express';
import salesSummary from './routes.sales.summary.js';
import coverDays from './routes.cover.days.js';
import forcastAccuracyMonthly from './routes.forcast.accuracy.monthly.js';
import forcastAccuracyYearly from './routes.forcast.accuracy.yearly.js';
import inventoryDays from './routes.inventory.days.js';
import aboveBelowThreshold from './routes.above-below-threshold.js';
import forcastAccuracyCategoryMonthly from './routes.forcast.accuracy.category.monthly.js';
import forcastAccuracyCategoryYearly from './routes.forcast.accuracy.category.yearly.js';
import iblVsTscl from './routes.ibl.vs.tscl.js';
import dispatchVsOrder from './routes.dispatch.vs.order.js';

const router = express.Router();

//Mount routers
router.use('/sales-summary', salesSummary);
router.use('/cover-days', coverDays);
router.use('/forecast-accuracy-monthly', forcastAccuracyMonthly);
router.use('/forecast-accuracy-yearly', forcastAccuracyYearly);
router.use('/inventory-days', inventoryDays);
router.use('/above-below-threshold', aboveBelowThreshold);
router.use('/forecast-accuracy-category-monthly', forcastAccuracyCategoryMonthly);
router.use('/forecast-accuracy-category-yearly', forcastAccuracyCategoryYearly);
router.use('/ibl-vs-tscl', iblVsTscl);
router.use('/dispatch-vs-order', dispatchVsOrder);

export default router;
