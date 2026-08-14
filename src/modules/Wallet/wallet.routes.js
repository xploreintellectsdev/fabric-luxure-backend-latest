const express = require("express");
const router = express.Router();
const walletController = require("./wallet.controller");
const walletValidation = require("./wallet.validation");
const { authenticateToken } = require("../../middleware/auth.middleware");

// Get wallet details
router.get("/", authenticateToken, walletController.getWallet);

// Get paginated wallet transactions
router.get("/transactions", authenticateToken, walletController.getTransactions);

// Initiate wallet recharge request
router.post("/add-money", authenticateToken, walletValidation.validateRecharge, walletController.addMoney);

// Complete wallet recharge successfully
router.post("/add-money/success", authenticateToken, walletController.addMoneySuccess);

// Deduct wallet balance for payment
router.post("/payment", authenticateToken, walletValidation.validateDebit, walletController.payment);

// Process wallet refunds on cancellations
router.post("/refund", authenticateToken, walletValidation.validateRefund, walletController.refund);

module.exports = router;
