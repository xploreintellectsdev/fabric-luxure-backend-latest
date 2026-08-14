const walletRepository = require("./wallet.repository");
const ConnectDB = require("../../config/db");
const emailService = require("../../services/email.service");
const NotificationService = require("../../services/notification.service");

// Get or create user wallet details
const getWalletDetails = async (userId) => {
  let wallet = await walletRepository.findWalletByUserId(userId);
  if (!wallet) {
    wallet = await walletRepository.createWallet(userId);
  }

  const summary = await walletRepository.getTransactionsSummary(wallet.wallet_id);

  return {
    wallet_id: wallet.wallet_id,
    balance: parseFloat(wallet.balance),

    status: wallet.status,
    total_credits: summary.totalCredits,
    total_debits: summary.totalDebits,
    recent_transactions_count: summary.recentTransactionCount
  };
};

// Get transaction logs with filter and pagination
const getTransactionHistory = async (userId, filters) => {
  let wallet = await walletRepository.findWalletByUserId(userId);
  if (!wallet) {
    wallet = await walletRepository.createWallet(userId);
  }

  const transactions = await walletRepository.findTransactions(wallet.wallet_id, filters);
  const totalRecords = await walletRepository.countTransactions(wallet.wallet_id, filters);
  
  return {
    transactions,
    pagination: {
      total: totalRecords,
      page: parseInt(filters.page || 1),
      limit: parseInt(filters.limit || 10),
      totalPages: Math.ceil(totalRecords / parseInt(filters.limit || 10))
    }
  };
};

// Create a recharge topup request
const initiateRecharge = async (userId, amount, gateway = "ICICI_PREVIEW") => {
  let wallet = await walletRepository.findWalletByUserId(userId);
  if (!wallet) {
    wallet = await walletRepository.createWallet(userId);
  }

  if (wallet.status !== "ACTIVE") {
    throw new Error("Wallet is inactive or blocked.");
  }

  // Generate unique merchant transaction number
  const merchantTxnNo = `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const topup = await walletRepository.createTopup({
    wallet_id: wallet.wallet_id,
    user_id: userId,
    amount: parseFloat(amount),
    merchant_txn_no: merchantTxnNo,
    gateway_name: gateway
  });

  return topup;
};

// Complete recharge successfully
const completeRecharge = async (userId, topupId, transactionId = null, gatewayPaymentId = null, extraData = {}, conn = null) => {
  // Gracefully handle if callers omit extraData and pass connection as 5th argument
  let connection = conn;
  let data = extraData;
  if (!conn && extraData && typeof extraData.execute === 'function') {
    connection = extraData;
    data = {};
  } else if (!connection) {
    connection = await ConnectDB.getConnection();
  }

  const shouldManageTransaction = (!conn && !(extraData && typeof extraData.execute === 'function'));

  try {
    if (shouldManageTransaction) {
      await connection.beginTransaction();
    }

    const topup = await walletRepository.findTopupById(topupId, connection);
    if (!topup) {
      throw new Error("Topup request not found.");
    }

    if (topup.user_id !== userId) {
      throw new Error("Unauthorized recharge request.");
    }

    if (topup.status === "SUCCESS") {
      if (shouldManageTransaction) await connection.rollback();
      return { success: true, message: "Recharge already processed." };
    }

    const wallet = await walletRepository.findWalletById(topup.wallet_id, connection);
    if (!wallet) {
      throw new Error("Associated wallet not found.");
    }

    if (wallet.status !== "ACTIVE") {
      throw new Error("Wallet is currently inactive.");
    }

    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter = balanceBefore + parseFloat(topup.amount);

    // Update topup record
    await walletRepository.updateTopupStatus(topupId, "SUCCESS", transactionId, gatewayPaymentId, data, connection);

    // Update wallet balance
    await walletRepository.updateBalance(wallet.wallet_id, balanceAfter, connection);

    console.log(`[WALLET] Wallet recharge successful! Topup ID: ${topupId}, User ID: ${userId}, Amount: ${topup.amount}, Gateway: ${data.gateway_name || 'ICICI_PREVIEW'}`);

    // Create transaction log
    await walletRepository.createTransaction({
      wallet_id: wallet.wallet_id,
      user_id: userId,
      transaction_type: "CREDIT",
      transaction_source: "WALLET_TOPUP",
      transaction_status: "SUCCESS",
      amount: topup.amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      remarks: `Wallet recharged successfully with transaction ref: ${topup.merchant_txn_no}`
    }, connection);

    if (shouldManageTransaction) {
      await connection.commit();
    }

    // Send Notification and Email AFTER commit
    try {
      const [userRows] = await ConnectDB.query("SELECT email, name FROM users WHERE user_id = ?", [userId]);
      if (userRows.length > 0) {
        const user = userRows[0];
        
        // Email
        emailService.sendWalletRechargeEmail({
          name: user.name,
          email: user.email,
          amount: topup.amount,
          gateway: gatewayPaymentId ? (gatewayPaymentId.includes("cf_") ? "Cashfree" : "ICICI") : "Gateway",
          transactionId: transactionId || topup.merchant_txn_no,
          balanceBefore,
          balanceAfter,
          date: new Date()
        }).catch(err => console.error("Error sending wallet recharge email:", err.message));

        // Notification
        NotificationService.createNotification({
          userId,
          title: "Wallet Recharge Successful",
          description: `₹${topup.amount} has been successfully added to your wallet.`,
          actionUrl: "/wallet"
        }).catch(err => console.error("Error creating wallet recharge notification:", err.message));
      }
    } catch (postEventErr) {
      console.error("Error in post-recharge events:", postEventErr);
    }

    return {
      success: true,
      balance: balanceAfter,
      message: "Wallet recharge completed successfully."
    };
  } catch (error) {
    if (shouldManageTransaction) {
      await connection.rollback();
    }
    console.error("❌ Complete Recharge Service Error:", error.message);
    throw error;
  } finally {
    if (shouldManageTransaction) {
      connection.release();
    }
  }
};

// Deduct wallet balance during checkout
const debitPayment = async (userId, amount, orderId = null, conn = null) => {
  const connection = conn || await ConnectDB.getConnection();
  const shouldManageTransaction = !conn;
  try {
    if (shouldManageTransaction) {
      await connection.beginTransaction();
    }

    const wallet = await walletRepository.findWalletByUserId(userId, connection);
    if (!wallet) {
      throw new Error("Wallet not found.");
    }

    if (wallet.status !== "ACTIVE") {
      throw new Error("Wallet is inactive or blocked.");
    }

    const currentBalance = parseFloat(wallet.balance);
    const debitAmount = parseFloat(amount);

    if (currentBalance < debitAmount) {
      throw new Error("Insufficient wallet balance.");
    }

    const balanceBefore = currentBalance;
    const balanceAfter = balanceBefore - debitAmount;

    // Update balance
    await walletRepository.updateBalance(wallet.wallet_id, balanceAfter, connection);

    // Log transaction
    await walletRepository.createTransaction({
      wallet_id: wallet.wallet_id,
      user_id: userId,
      order_id: orderId,
      transaction_type: "DEBIT",
      transaction_source: "ORDER_PAYMENT",
      transaction_status: "SUCCESS",
      amount: debitAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      remarks: orderId ? `Payment debited for Order ID: ${orderId}` : "Payment debited for checkout"
    }, connection);

    if (shouldManageTransaction) {
      await connection.commit();
    }

    // Send Notification and Email AFTER commit
    try {
      const [userRows] = await ConnectDB.query("SELECT email, name FROM users WHERE user_id = ?", [userId]);
      if (userRows.length > 0) {
        const user = userRows[0];
        
        // Email
        emailService.sendWalletPaymentEmail({
          name: user.name,
          email: user.email,
          orderNumber: orderId || "Checkout",
          amount: debitAmount,
          balanceBefore,
          balanceAfter,
          date: new Date()
        }).catch(err => console.error("Error sending wallet debit email:", err.message));

        // Notification
        let desc = `₹${debitAmount} was deducted from your wallet for payment.`;
        if (orderId) desc = `₹${debitAmount} was deducted from your wallet for Order ${orderId}.`;
        
        NotificationService.createNotification({
          userId,
          title: "Wallet Payment Successful",
          description: desc,
          actionUrl: "/wallet"
        }).catch(err => console.error("Error creating wallet debit notification:", err.message));
      }
    } catch (postEventErr) {
      console.error("Error in post-debit events:", postEventErr);
    }

    return {
      success: true,
      balance: balanceAfter,
      message: "Wallet payment debited successfully."
    };
  } catch (error) {
    if (shouldManageTransaction) {
      await connection.rollback();
    }
    console.error("❌ Debit Payment Service Error:", error.message);
    throw error;
  } finally {
    if (shouldManageTransaction) {
      connection.release();
    }
  }
};

// Handle wallet refunds for Order cancellations
const processRefund = async (userId, refundData, conn = null) => {
  const connection = conn || await ConnectDB.getConnection();
  const shouldManageTransaction = !conn;
  try {
    if (shouldManageTransaction) {
      await connection.beginTransaction();
    }

    const { 
      order_id, 
      payment_id, 
      cancellation_id, 
      refund_method, 
      refund_amount, 
      wallet_refund_amount = 0,
      gateway_refund_amount = 0
    } = refundData;

    // Prevent duplicate refunds checking
    const [existingTx] = await connection.execute(
      "SELECT * FROM wallet_transactions WHERE cancellation_id = ? AND transaction_type = 'CREDIT' AND transaction_source = 'ORDER_REFUND'",
      [cancellation_id]
    );

    if (existingTx.length > 0) {
      throw new Error("Refund already processed for this cancellation.");
    }

    let wallet = await walletRepository.findWalletByUserId(userId, connection);
    if (!wallet) {
      wallet = await walletRepository.createWallet(userId, connection);
    }

    if (wallet.status !== "ACTIVE") {
      throw new Error("Wallet is currently inactive. Cannot process refund.");
    }

    const currentBalance = parseFloat(wallet.balance);
    let amountToCredit = 0;
    let remarks = "";

    if (refund_method === "WALLET") {
      amountToCredit = parseFloat(refund_amount);
      remarks = `Full refund credited to wallet for Order ID: ${order_id}`;
    } else if (refund_method === "SPLIT") {
      // Split payments credit wallet portion back to wallet
      amountToCredit = parseFloat(wallet_refund_amount);
      remarks = `Split payment refund. Wallet portion of ₹${amountToCredit} credited back. Bank portion: ₹${gateway_refund_amount}`;
    } else if (refund_method === "ORIGINAL_PAYMENT" && wallet_refund_amount > 0) {
      // If gateway order was requested as wallet refund option
      amountToCredit = parseFloat(wallet_refund_amount);
      remarks = `Consolidated Gateway order refund credited to store wallet for Order ID: ${order_id}`;
    } else {
      // If original payment method option (e.g. gateway only), credit goes to bank. We simulate a placeholder success.
      if (shouldManageTransaction) {
        await connection.commit();
      }
      return {
        success: true,
        refunded_to_wallet: false,
        message: "Bank refund successfully initiated. No wallet transaction processed."
      };
    }

    if (amountToCredit <= 0) {
      if (shouldManageTransaction) {
        await connection.commit();
      }
      return {
        success: true,
        refunded_to_wallet: false,
        message: "No wallet contribution to refund."
      };
    }

    const balanceBefore = currentBalance;
    const balanceAfter = balanceBefore + amountToCredit;

    // Update wallet balance
    await walletRepository.updateBalance(wallet.wallet_id, balanceAfter, connection);

    // Create transaction log
    await walletRepository.createTransaction({
      wallet_id: wallet.wallet_id,
      user_id: userId,
      order_id: order_id,
      payment_id: payment_id,
      cancellation_id: cancellation_id,
      transaction_type: "CREDIT",
      transaction_source: "ORDER_REFUND",
      transaction_status: "SUCCESS",
      amount: amountToCredit,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      remarks: remarks
    }, connection);

    if (shouldManageTransaction) {
      await connection.commit();
    }

    // Send Notification and Email AFTER commit
    try {
      const [userRows] = await ConnectDB.query("SELECT email, name FROM users WHERE user_id = ?", [userId]);
      if (userRows.length > 0) {
        const user = userRows[0];
        
        // Email
        emailService.sendWalletRefundEmail({
          name: user.name,
          email: user.email,
          orderNumber: order_id || "Cancellation",
          amount: amountToCredit,
          balanceBefore,
          balanceAfter,
          date: new Date()
        }).catch(err => console.error("Error sending wallet refund email:", err.message));

        // Notification
        NotificationService.createNotification({
          userId,
          title: "Wallet Refund Processed",
          description: `₹${amountToCredit} refund was credited to your wallet for Order ${order_id}.`,
          actionUrl: "/wallet"
        }).catch(err => console.error("Error creating wallet refund notification:", err.message));
      }
    } catch (postEventErr) {
      console.error("Error in post-refund events:", postEventErr);
    }

    return {
      success: true,
      refunded_to_wallet: true,
      balance: balanceAfter,
      message: "Refund credited to wallet successfully."
    };
  } catch (error) {
    if (shouldManageTransaction) {
      await connection.rollback();
    }
    console.error("❌ Process Refund Service Error:", error.message);
    throw error;
  } finally {
    if (shouldManageTransaction) {
      connection.release();
    }
  }
};

/**
 * Admin: Credit user wallet manually
 */
const creditAdminWallet = async ({ userId, adminId, amount, reason, remarks }) => {
  const connection = await ConnectDB.getConnection();
  try {
    await connection.beginTransaction();

    const wallet = await walletRepository.findWalletByUserId(userId, connection);
    if (!wallet) {
      throw new Error("Wallet not found for this user.");
    }

    const amountToCredit = parseFloat(amount);
    if (isNaN(amountToCredit) || amountToCredit <= 0) {
      throw new Error("Invalid credit amount.");
    }

    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter = balanceBefore + amountToCredit;

    // Update Wallet Balance
    await walletRepository.updateBalance(wallet.wallet_id, balanceAfter, connection);

    // Insert Wallet Transaction
    await walletRepository.createTransaction({
      wallet_id: wallet.wallet_id,
      user_id: userId,
      transaction_type: "CREDIT",
      transaction_source: "ADMIN_CREDIT",
      transaction_status: "SUCCESS",
      amount: amountToCredit,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      admin_id: adminId,
      reason: reason,
      remarks: remarks
    }, connection);

    await connection.commit();

    // Send Notification and Email AFTER commit
    try {
      const [userRows] = await ConnectDB.query("SELECT email, name FROM users WHERE user_id = ?", [userId]);
      if (userRows.length > 0) {
        const user = userRows[0];
        
        // Email
        emailService.sendWalletAdminCreditEmail({
          name: user.name,
          email: user.email,
          amount: amountToCredit,
          reason,
          remarks,
          balanceBefore,
          balanceAfter,
          date: new Date()
        }).catch(err => console.error("Error sending wallet admin credit email:", err.message));

        // Notification
        NotificationService.createNotification({
          userId,
          title: "Wallet Credited",
          description: `₹${amountToCredit} has been credited to your wallet by our team.`,
          actionUrl: "/wallet"
        }).catch(err => console.error("Error creating wallet admin credit notification:", err.message));
      }
    } catch (postEventErr) {
      console.error("Error in post-admin-credit events:", postEventErr);
    }

    return {
      success: true,
      wallet_id: wallet.wallet_id,
      balance: balanceAfter,
      credited_amount: amountToCredit
    };
  } catch (error) {
    await connection.rollback();
    console.error("❌ Admin Wallet Credit Error:", error.message);
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  getWalletDetails,
  getTransactionHistory,
  initiateRecharge,
  completeRecharge,
  debitPayment,
  processRefund,
  creditAdminWallet
};
