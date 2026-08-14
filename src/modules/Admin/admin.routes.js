const express = require("express");
const router = express.Router();
const adminController = require("./admin.controller");
const ordersController = require("../Orders/orders.controller");
const contactController = require("../Contact/contact.controller");
const reviewsController = require("../Reviews/reviews.controller");
const corporateOrderController = require("../CorporateOrder/corporateOrder.controller");
const { authenticateAdminToken, requireSuperAdmin } = require("../../middleware/adminAuth.middleware");

// Public endpoints
router.post("/login", adminController.login);
router.get("/payment-gateway", adminController.getPaymentGateways);

// Protected endpoints
router.get("/me", authenticateAdminToken, adminController.me);
router.post("/logout", authenticateAdminToken, adminController.logout);

router.post("/administrators/password/verify-current", authenticateAdminToken, adminController.requestPasswordChangeOtp);
router.post("/administrators/password/verify-otp", authenticateAdminToken, adminController.verifyPasswordChangeOtp);

router.put("/payment-gateway", authenticateAdminToken, adminController.updatePaymentGateway);

// Superadmin strictly protected endpoints for Admin Management
router.get("/administrators", requireSuperAdmin, adminController.getAdministrators);
router.post("/administrators", requireSuperAdmin, adminController.createAdministrator);
router.put("/administrators/:id", requireSuperAdmin, adminController.updateAdministrator);
router.delete("/administrators/:id", requireSuperAdmin, adminController.deleteAdministrator);

router.get("/orders-export/list", authenticateAdminToken, ordersController.exportAdminOrders);
router.get("/orders/:orderNumber", authenticateAdminToken, ordersController.getAdminOrderDetails);
router.get("/wallets", authenticateAdminToken, adminController.getAdminWallets);
router.get("/wallets/:userId", authenticateAdminToken, adminController.getAdminWalletDetails);
router.post("/wallets/:userId/credit", authenticateAdminToken, adminController.creditUserWallet);

router.get("/contacts", authenticateAdminToken, contactController.getAdminContacts);
router.put("/contacts/:id/status", authenticateAdminToken, contactController.updateContactStatus);
router.delete("/contacts/:id", authenticateAdminToken, contactController.deleteContact);

router.get("/review-products", authenticateAdminToken, reviewsController.getAdminReviewProducts);
router.get("/reviews/product/:productId", authenticateAdminToken, reviewsController.getAdminProductReviews);
router.delete("/reviews/:reviewId", authenticateAdminToken, reviewsController.deleteReview);

router.get("/corporate-orders", authenticateAdminToken, corporateOrderController.getAdminCorporateOrders);
router.get("/corporate-orders/:id", authenticateAdminToken, corporateOrderController.getAdminCorporateOrderDetails);
router.put("/corporate-orders/:id/status", authenticateAdminToken, corporateOrderController.updateCorporateOrderStatus);

module.exports = router;
