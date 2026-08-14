const walletService = require("./wallet.service");
const IciciPaymentService = require("../../services/iciciPayment.service");

// GET /wallet
const getWallet = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const details = await walletService.getWalletDetails(userId);
    return res.status(200).json({
      success: true,
      data: details
    });
  } catch (error) {
    console.error("❌ Get Wallet Controller Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve wallet details."
    });
  }
};

// GET /wallet/transactions
const getTransactions = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const { page = 1, limit = 10, transaction_type, date } = req.query;

    const history = await walletService.getTransactionHistory(userId, {
      page,
      limit,
      type: transaction_type,
      date
    });

    return res.status(200).json({
      success: true,
      data: history.transactions,
      pagination: history.pagination
    });
  } catch (error) {
    console.error("❌ Get Wallet Transactions Controller Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve transactions."
    });
  }
};

// POST /wallet/add-money
const addMoney = async (req, res) => {
  let topup = null;
  try {
    const userId = req.user.userId || req.user.user_id;
    const { amount, gateway = "ICICI" } = req.body;

    const ConnectDB = require("../../config/db");
    const checkConn = await ConnectDB.getConnection();
    try {
      const [gRows] = await checkConn.query(
        "SELECT is_enabled FROM payment_gateway_settings WHERE gateway_name = ?",
        [gateway]
      );
      if (gRows.length === 0 || gRows[0].is_enabled !== 1) {
        return res.status(400).json({ success: false, error: `${gateway} payment gateway is currently disabled.` });
      }
    } finally {
      checkConn.release();
    }

    topup = await walletService.initiateRecharge(userId, amount, gateway);
    console.log(`[WALLET] Topup initiated: user_id=${userId}, amount=${amount}, gateway=${gateway}`);

    let initiateResult = null;

    if (gateway === "CASHFREE") {
      const connection = await ConnectDB.getConnection();
      try {
        const [userRows] = await connection.query("SELECT name, email, mobile FROM users WHERE user_id = ?", [userId]);
        const dbUser = userRows[0] || {};
        
        const CashfreePaymentService = require("../../services/cashfreePayment.service");
        const cfResult = await CashfreePaymentService.createOrder({
          merchantOrderId: topup.merchant_txn_no,
          amount: parseFloat(amount),
          customerPhone: dbUser.mobile || req.user.mobile || "9999999999",
          customerName: dbUser.name || req.user.name || "Customer",
          customerEmail: dbUser.email || req.user.email || "test@test.com",
          returnUrl: `${process.env.API_URL || "http://localhost:5000"}/api/payment/cashfree/callback?order_id={order_id}`
        });
        if (cfResult && cfResult.payment_link) {
          initiateResult = {
            success: true,
            payment_url: cfResult.payment_link
          };
        }
      } finally {
        connection.release();
      }
    } else if (gateway === "INSTAMOJO") {
      const connection = await ConnectDB.getConnection();
      try {
        const [userRows] = await connection.query("SELECT name, email, mobile FROM users WHERE user_id = ?", [userId]);
        const dbUser = userRows[0] || {};
        
        const InstamojoPaymentService = require("../../services/instamojoPayment.service");
        const imResult = await InstamojoPaymentService.createPayment({
          merchantOrderId: topup.merchant_txn_no,
          amount: parseFloat(amount),
          customerPhone: dbUser.mobile || req.user.mobile || "9999999999",
          customerName: dbUser.name || req.user.name || "Customer",
          customerEmail: dbUser.email || req.user.email || "test@test.com",
          purpose: `Wallet Recharge ${topup.merchant_txn_no}`
        });
        if (imResult && imResult.payment_url) {
          await connection.query(
            "UPDATE wallet_topups SET gateway_payment_id = ? WHERE topup_id = ?",
            [imResult.payment_request_id, topup.topup_id]
          );

          initiateResult = {
            success: true,
            payment_url: imResult.payment_url
          };
        }
      } finally {
        connection.release();
      }
    } else {
      const IciciPaymentService = require("../../services/iciciPayment.service");
      // Call ICICI initiateSale flow by passing the topup's merchant txn number
      initiateResult = await IciciPaymentService.initiateSale({
        merchantOrderId: topup.merchant_txn_no,
        amount: parseFloat(amount),
        paymentMethod: "upi", // default payment method
        userId,
        addressId: null,
        customerEmail: req.user.email,
        customerMobile: req.user.mobile,
        customerName: req.user.name
      });
    }

    if (initiateResult && initiateResult.success && initiateResult.payment_url) {
      return res.status(200).json({
        success: true,
        message: "Wallet recharge initiated successfully.",
        payment_url: initiateResult.payment_url,
        data: topup
      });
    }

    return res.status(500).json({
      success: false,
      error: "Gateway failed to initialize payment redirection."
    });
  } catch (error) {
    console.error("❌ Add Money Controller Error:", error.message);

    // Detect gateway connectivity / 5xx errors — return a clean message
    const isGatewayDown =
      error.message.includes("502") ||
      error.message.includes("503") ||
      error.message.includes("504") ||
      error.message.includes("Bad Gateway") ||
      error.message.includes("Service Unavailable") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("ETIMEDOUT") ||
      error.message.includes("TimeoutError") ||
      error.message.includes("abort");

    if (isGatewayDown) {
      return res.status(503).json({
        success: false,
        error: "The payment gateway is temporarily unavailable. Please try again in a few minutes."
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to initiate recharge."
    });
  }
};

// POST /wallet/add-money/success
const addMoneySuccess = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const { topup_id } = req.body;

    if (!topup_id) {
      return res.status(400).json({ success: false, error: "Topup ID is required." });
    }

    const result = await walletService.completeRecharge(userId, topup_id);
    console.log(`[WALLET] Topup success: user_id=${userId}, topup_id=${topup_id}`);

    return res.status(200).json({
      success: true,
      message: result.message,
      balance: result.balance
    });
  } catch (error) {
    console.error("❌ Add Money Success Controller Error:", error.message);
    return res.status(400).json({
      success: false,
      error: error.message || "Failed to process recharge completion."
    });
  }
};

// POST /wallet/payment
const payment = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const { amount, order_id } = req.body;

    const result = await walletService.debitPayment(userId, amount, order_id);
    console.log(`[WALLET] Payment debit: user_id=${userId}, amount=${amount}, order_id=${order_id}`);

    return res.status(200).json({
      success: true,
      message: result.message,
      balance: result.balance
    });
  } catch (error) {
    console.error("❌ Wallet Payment Controller Error:", error.message);
    return res.status(400).json({
      success: false,
      error: error.message || "Wallet payment failed."
    });
  }
};

// POST /wallet/refund
const refund = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const {
      order_id,
      payment_id,
      cancellation_id,
      refund_method,
      refund_amount,
      wallet_refund_amount,
      gateway_refund_amount
    } = req.body;

    const result = await walletService.processRefund(userId, {
      order_id,
      payment_id,
      cancellation_id,
      refund_method,
      refund_amount,
      wallet_refund_amount,
      gateway_refund_amount
    });

    console.log(`[WALLET] Refund processed: user_id=${userId}, order_id=${order_id}, method=${refund_method}`);

    return res.status(200).json({
      success: true,
      message: result.message,
      refunded_to_wallet: result.refunded_to_wallet,
      balance: result.balance
    });
  } catch (error) {
    console.error("❌ Wallet Refund Controller Error:", error.message);
    return res.status(400).json({
      success: false,
      error: error.message || "Wallet refund processing failed."
    });
  }
};

module.exports = {
  getWallet,
  getTransactions,
  addMoney,
  addMoneySuccess,
  payment,
  refund
};
