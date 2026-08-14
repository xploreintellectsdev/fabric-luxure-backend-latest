const ConnectDB = require("../../config/db");

const getExecutor = (connection) => {
  return connection || ConnectDB;
};

// Find wallet by user ID
const findWalletByUserId = async (userId, conn = null) => {
  const executor = getExecutor(conn);
  const [rows] = await executor.execute("SELECT * FROM wallets WHERE user_id = ?", [userId]);
  return rows[0] || null;
};

// Find wallet by wallet ID
const findWalletById = async (walletId, conn = null) => {
  const executor = getExecutor(conn);
  const [rows] = await executor.execute("SELECT * FROM wallets WHERE wallet_id = ?", [walletId]);
  return rows[0] || null;
};

// Create a new wallet for a user
const createWallet = async (userId, conn = null) => {
  const executor = getExecutor(conn);
  const query = "INSERT INTO wallets (user_id, balance, status, created_at, updated_at) VALUES (?, 0.00, 'ACTIVE', NOW(), NOW())";
  const [result] = await executor.execute(query, [userId]);
  return { wallet_id: result.insertId, user_id: userId, balance: 0.00, status: "ACTIVE" };
};

// Update wallet balance
const updateBalance = async (walletId, newBalance, conn = null) => {
  const executor = getExecutor(conn);
  const query = "UPDATE wallets SET balance = ?, updated_at = NOW() WHERE wallet_id = ?";
  await executor.execute(query, [newBalance, walletId]);
  return true;
};

// Create a transaction record
const createTransaction = async (txData, conn = null) => {
  const executor = getExecutor(conn);
  const query = `
    INSERT INTO wallet_transactions (
      wallet_id, user_id, order_id, payment_id, cancellation_id,
      transaction_type, transaction_source, transaction_status, amount,
      balance_before, balance_after, remarks, created_at, reference_no,
      admin_id, reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)
  `;
  const params = [
    txData.wallet_id,
    txData.user_id,
    txData.order_id || null,
    txData.payment_id || null,
    txData.cancellation_id || null,
    txData.transaction_type, // 'CREDIT' or 'DEBIT'
    txData.transaction_source, // 'ORDER_PAYMENT', 'ORDER_REFUND', 'WALLET_TOPUP', etc.
    txData.transaction_status || "SUCCESS", // 'PENDING', 'SUCCESS', 'FAILED'
    txData.amount,
    txData.balance_before,
    txData.balance_after,
    txData.remarks || null,
    txData.reference_no || null,
    txData.admin_id || null,
    txData.reason || null
  ];
  const [result] = await executor.execute(query, params);
  return { transaction_id: result.insertId, ...txData };
};

// Find transaction history with pagination, type, and date filters
const findTransactions = async (walletId, filters = {}, conn = null) => {
  const executor = getExecutor(conn);
  const { page = 1, limit = 10, type, date } = filters;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = "SELECT * FROM wallet_transactions WHERE wallet_id = ?";
  const params = [walletId];

  if (type) {
    query += " AND transaction_type = ?";
    params.push(type.toUpperCase());
  }

  if (date) {
    query += " AND DATE(created_at) = DATE(?)";
    params.push(date);
  }

  query += " ORDER BY created_at DESC, transaction_id DESC LIMIT ? OFFSET ?";
  params.push(parseInt(limit), offset);

  const [rows] = await executor.query(query, params);
  return rows;
};

// Get transaction count for pagination
const countTransactions = async (walletId, filters = {}, conn = null) => {
  const executor = getExecutor(conn);
  const { type, date } = filters;

  let query = "SELECT COUNT(*) as total FROM wallet_transactions WHERE wallet_id = ?";
  const params = [walletId];

  if (type) {
    query += " AND transaction_type = ?";
    params.push(type.toUpperCase());
  }

  if (date) {
    query += " AND DATE(created_at) = DATE(?)";
    params.push(date);
  }

  const [rows] = await executor.query(query, params);
  return rows[0].total;
};

// Create a wallet topup request
const createTopup = async (topupData, conn = null) => {
  const executor = getExecutor(conn);
  const query = `
    INSERT INTO wallet_topups (
      wallet_id, user_id, amount, status, gateway_name, transaction_id, 
      gateway_payment_id, merchant_txn_no, created_at
    ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, NOW())
  `;
  const params = [
    topupData.wallet_id,
    topupData.user_id,
    topupData.amount,
    topupData.gateway_name || null,
    topupData.transaction_id || null,
    topupData.gateway_payment_id || null,
    topupData.merchant_txn_no || null
  ];
  const [result] = await executor.execute(query, params);
  return { topup_id: result.insertId, ...topupData, status: "PENDING" };
};

// Find topup by ID
const findTopupById = async (topupId, conn = null) => {
  const executor = getExecutor(conn);
  const [rows] = await executor.execute("SELECT * FROM wallet_topups WHERE topup_id = ?", [topupId]);
  return rows[0] || null;
};

// Update topup status
const updateTopupStatus = async (topupId, status, transactionId = null, gatewayPaymentId = null, data = {}, conn = null) => {
  // Gracefully handle if callers omit extraData and pass connection as 5th argument
  let connection = conn;
  let extraData = data;
  if (!conn && data && typeof data.execute === 'function') {
    connection = data;
    extraData = {};
  }
  
  const executor = getExecutor(connection);
  
  const updates = [
    "status = ?", 
    "transaction_id = ?", 
    "gateway_payment_id = ?"
  ];
  const params = [status, transactionId, gatewayPaymentId];

  if (extraData.gateway_name) {
    updates.push("gateway_name = ?");
    params.push(extraData.gateway_name);
  }
  if (extraData.gateway_order_id) {
    updates.push("gateway_order_id = ?");
    params.push(extraData.gateway_order_id);
  }
  if (extraData.payment_method) {
    updates.push("payment_method = ?");
    params.push(extraData.payment_method);
  }

  params.push(topupId);

  const query = `
    UPDATE wallet_topups 
    SET ${updates.join(', ')}
    WHERE topup_id = ?
  `;
  await executor.execute(query, params);
  return true;
};

// Get wallet transaction summary details
const getTransactionsSummary = async (walletId, conn = null) => {
  const executor = getExecutor(conn);

  const [credits] = await executor.execute(
    "SELECT SUM(amount) as total FROM wallet_transactions WHERE wallet_id = ? AND transaction_type = 'CREDIT' AND transaction_status = 'SUCCESS'",
    [walletId]
  );

  const [debits] = await executor.execute(
    "SELECT SUM(amount) as total FROM wallet_transactions WHERE wallet_id = ? AND transaction_type = 'DEBIT' AND transaction_status = 'SUCCESS'",
    [walletId]
  );

  const [count] = await executor.execute(
    "SELECT COUNT(*) as total FROM wallet_transactions WHERE wallet_id = ?",
    [walletId]
  );

  return {
    totalCredits: parseFloat(credits[0].total || 0),
    totalDebits: parseFloat(debits[0].total || 0),
    recentTransactionCount: count[0].total
  };
};


module.exports = {
  findWalletByUserId,
  findWalletById,
  createWallet,
  updateBalance,
  createTransaction,
  findTransactions,
  countTransactions,
  createTopup,
  findTopupById,
  updateTopupStatus,
  getTransactionsSummary
};
