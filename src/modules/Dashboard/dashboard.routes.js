const express = require("express");
const router = express.Router();
const dashboardController = require("./dashboard.controller");
const { authenticateAdminToken } = require("../../middleware/adminAuth.middleware");

router.get("/stats", authenticateAdminToken, dashboardController.getDashboardStats);

module.exports = router;
