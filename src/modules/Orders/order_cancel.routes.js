const express = require("express");
const router = express.Router();
const orderCancelController = require("./order_cancel.controller");
const { authenticateToken } = require("../../middleware/auth.middleware");

router.post("/:orderNumber/cancel/preview", authenticateToken, orderCancelController.cancellationPreview);
router.post("/:orderNumber/cancel", authenticateToken, orderCancelController.cancelOrder);

module.exports = router;
