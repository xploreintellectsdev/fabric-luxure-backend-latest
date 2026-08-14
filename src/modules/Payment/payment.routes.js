const express = require("express");
const router = express.Router();
const paymentController = require("./payment.controller");
const { authenticateToken, authenticateTokenOptional } = require("../../middleware/auth.middleware");

router.post("/initiate", authenticateTokenOptional, paymentController.initiatePayment);
router.post("/cashfree/initiate", authenticateTokenOptional, paymentController.initiateCashfreePayment);
router.get("/simulate-gateway", paymentController.simulateGateway);
router.get("/status/:transactionId", authenticateToken, paymentController.getTransactionStatus);

router
    .route("/callback")
    .get(paymentController.paymentCallback)
    .post(paymentController.paymentCallback);

router.get("/cashfree/callback", paymentController.cashfreeCallback);

router.post("/cashfree/webhook", express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}), paymentController.cashfreeWebhook);

router.post("/instamojo/initiate", authenticateTokenOptional, paymentController.initiateInstamojoPayment);
router.get("/instamojo/callback", paymentController.instamojoCallback);
router.post("/instamojo/webhook", express.urlencoded({
  extended: true,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}), paymentController.instamojoWebhook);

module.exports = router;
