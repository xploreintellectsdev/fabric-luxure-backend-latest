const express = require("express");
const router = express.Router();
const ordersController = require("./orders.controller");
const { authenticateToken } = require("../../middleware/auth.middleware");
const { authenticateAdminToken } = require("../../middleware/adminAuth.middleware");

router.post("/place-order", authenticateToken, ordersController.placeOrder);
router.post("/initiate-payment", authenticateToken, ordersController.initiatePayment);
router.get("/simulate-gateway", ordersController.simulateGateway);
router.get("/payment-callback", ordersController.paymentCallback);
router.get("/user", authenticateToken, ordersController.getUserOrders);

// Admin-specific endpoints (placed above generic param routes to avoid conflicts)
router.get("/admin/dashboard", authenticateAdminToken, ordersController.getAdminDashboard);
router.get("/admin/sales-dashboard", authenticateAdminToken, ordersController.getAdminSalesDashboard);
router.get("/admin/list", authenticateAdminToken, ordersController.getAdminOrdersList);
router.get("/admin/analytics", authenticateAdminToken, ordersController.getAdminAnalytics);
router.patch("/admin/:orderId/status", authenticateAdminToken, ordersController.updateOrderStatus);
router.patch("/admin/:orderId/shipment", authenticateAdminToken, ordersController.updateOrderShipment);
router.post("/admin/:orderId/create-shipment", authenticateAdminToken, ordersController.createShipment);

router.get("/details/:orderNumber", ordersController.getOrderSuccessDetails);
router.get("/:orderId/invoice-pdf", authenticateAdminToken, ordersController.getInvoicePdf);
router.get("/:orderNumber", authenticateToken, ordersController.getSingleOrder);
router.get("/:orderNumber/timeline", authenticateToken, ordersController.getOrderTimeline);
router.get("/:orderNumber/tracking", authenticateToken, ordersController.getUserOrderTracking);
router.post("/:orderNumber/sync-tracking", authenticateToken, ordersController.manualSyncTracking);
const orderCancelRoutes = require("./order_cancel.routes");
router.use(orderCancelRoutes);

module.exports = router;
