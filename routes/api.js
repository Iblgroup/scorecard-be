import express from 'express';
import salesSummary from './routes.sales.summary.js';

const router = express.Router();

//Mount routers
router.use('/sales-summary', salesSummary);

export default router;
