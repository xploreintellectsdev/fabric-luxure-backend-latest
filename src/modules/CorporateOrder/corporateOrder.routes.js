const express = require('express');
const router = express.Router();
const corporateOrderController = require('./corporateOrder.controller');
const { authenticateTokenOptional } = require('../../middleware/auth.middleware');

router.post('/', authenticateTokenOptional, corporateOrderController.createCorporateOrder);

module.exports = router;
