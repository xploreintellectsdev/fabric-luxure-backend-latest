const ConnectDB = require("../../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const walletService = require("../Wallet/wallet.service");
const emailService = require("../../services/email.service");

/**
 * Admin Login Handler
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required.",
      });
    }

    // Query admin table
    const [rows] = await ConnectDB.execute("SELECT * FROM admin WHERE email = ?", [email]);
    const admin = rows[0];

    if (!admin) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password.",
      });
    }

    if (admin.is_active === 0) {
      return res.status(403).json({
        success: false,
        error: "Your administrator account has been disabled.",
      });
    }

    // Compare bcrypt passwords
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password.",
      });
    }

    const ipAddress = req.headers["x-forwarded-for"] || req.connection.remoteAddress || "127.0.0.1";
    
    // Update last_login
    await ConnectDB.execute(
      "UPDATE admin SET last_login = NOW(), last_login_ip = ? WHERE id = ?",
      [ipAddress, admin.id]
    );

    // Generate JWT token with admin role
    const payload = {
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
      full_name: admin.full_name,
      is_active: admin.is_active,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });


    return res.status(200).json({
      success: true,
      message: "Admin login successful",
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        role: admin.role,
        is_active: admin.is_active,
      },
    });
  } catch (error) {
    console.error("❌ Admin Login Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};

/**
 * Get Authenticated Admin Profile Handler
 */
const me = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        error: "Not authenticated.",
      });
    }

    return res.status(200).json({
      success: true,
      admin: {
        id: req.admin.adminId,
        email: req.admin.email,
        full_name: req.admin.full_name,
        role: req.admin.role,
        is_active: req.admin.is_active,
      },
    });
  } catch (error) {
    console.error("❌ Admin Me Fetch Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};

/**
 * Admin Logout Handler
 */
const logout = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Admin logged out successfully",
  });
};

const getAdminWallets = async (req, res) => {
  try {
    const { search = "", status = "All", sort = "balance_desc", page = 1, limit = 10 } = req.query;
    const limitNum = parseInt(limit, 10) || 10;
    const pageNum = parseInt(page, 10) || 1;
    const offsetNum = (pageNum - 1) * limitNum;

    let queryParams = [];
    let whereClauses = [];

    if (search) {
      whereClauses.push("(u.name LIKE ? OR u.email LIKE ?)");
      const searchVal = `%${search}%`;
      queryParams.push(searchVal, searchVal);
    }

    if (status !== "All") {
      whereClauses.push("w.status = ?");
      queryParams.push(status);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const [countRows] = await ConnectDB.query(`
      SELECT COUNT(DISTINCT w.wallet_id) AS total
      FROM wallets w
      INNER JOIN users u ON w.user_id = u.user_id
      ${whereSql}
    `, queryParams);
    const total = countRows[0]?.total || 0;

    let orderBySql = "ORDER BY w.balance DESC";
    if (sort === "balance_asc") {
      orderBySql = "ORDER BY w.balance ASC";
    } else if (sort === "balance_desc") {
      orderBySql = "ORDER BY w.balance DESC";
    }

    const listQuery = `
      SELECT 
        u.user_id,
        u.name,
        u.email,
        w.wallet_id,
        w.balance,
        w.status,
        (SELECT MAX(created_at) FROM wallet_transactions WHERE wallet_id = w.wallet_id) AS last_txn_date
      FROM wallets w
      INNER JOIN users u ON w.user_id = u.user_id
      ${whereSql}
      ${orderBySql}
      LIMIT ? OFFSET ?
    `;

    const [listRows] = await ConnectDB.query(listQuery, [...queryParams, limitNum, offsetNum]);

    const [totalBalRow] = await ConnectDB.query("SELECT SUM(balance) AS total_balance FROM wallets");
    const totalWalletBalance = parseFloat(totalBalRow[0]?.total_balance || 0);

    const [totalRechargeRow] = await ConnectDB.query("SELECT SUM(amount) AS total_recharges FROM wallet_topups WHERE status = 'SUCCESS'");
    const totalWalletRecharges = parseFloat(totalRechargeRow[0]?.total_recharges || 0);

    const [totalRefundRow] = await ConnectDB.query(`
      SELECT SUM(amount) AS total_refunds 
      FROM wallet_transactions 
      WHERE transaction_source = 'ORDER_REFUND' AND transaction_status = 'SUCCESS'
    `);
    const totalWalletRefunds = parseFloat(totalRefundRow[0]?.total_refunds || 0);

    const [totalPaymentRow] = await ConnectDB.query(`
      SELECT SUM(amount) AS total_payments 
      FROM wallet_transactions 
      WHERE transaction_source = 'ORDER_PAYMENT' AND transaction_status = 'SUCCESS'
    `);
    const totalWalletPayments = parseFloat(totalPaymentRow[0]?.total_payments || 0);

    console.log("========================================");
    console.log("ADMIN WALLET LIST");
    console.log("========================================");
    console.log(`Total Wallet Users : ${total}`);
    console.log("Wallets Loaded Successfully");
    console.log("========================================");

    return res.status(200).json({
      success: true,
      data: {
        wallets: listRows,
        summary: {
          totalWalletBalance,
          totalWalletRecharges,
          totalWalletRefunds,
          totalWalletPayments
        },
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error("❌ Admin Wallets fetch error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getAdminWalletDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const [userRows] = await ConnectDB.query("SELECT user_id, name, email, mobile FROM users WHERE user_id = ?", [userId]);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, error: "User not found." });
    }
    const user = userRows[0];

    const [walletRows] = await ConnectDB.query("SELECT * FROM wallets WHERE user_id = ?", [userId]);
    if (walletRows.length === 0) {
      return res.status(404).json({ success: false, error: "Wallet not found for this user." });
    }
    const wallet = walletRows[0];

    const [rechargeStat] = await ConnectDB.query("SELECT SUM(amount) AS total FROM wallet_topups WHERE user_id = ? AND status = 'SUCCESS'", [userId]);
    const totalRechargeAmount = parseFloat(rechargeStat[0]?.total || 0);

    const [refundStat] = await ConnectDB.query(`
      SELECT SUM(amount) AS total 
      FROM wallet_transactions 
      WHERE user_id = ? AND transaction_source = 'ORDER_REFUND' AND transaction_status = 'SUCCESS'
    `, [userId]);
    const totalRefundAmount = parseFloat(refundStat[0]?.total || 0);

    const [paymentStat] = await ConnectDB.query(`
      SELECT SUM(amount) AS total 
      FROM wallet_transactions 
      WHERE user_id = ? AND transaction_source = 'ORDER_PAYMENT' AND transaction_status = 'SUCCESS'
    `, [userId]);
    const totalWalletPayments = parseFloat(paymentStat[0]?.total || 0);

    const [transactions] = await ConnectDB.query(`
      SELECT * 
      FROM wallet_transactions 
      WHERE wallet_id = ? 
      ORDER BY created_at DESC
    `, [wallet.wallet_id]);

    const [recharges] = await ConnectDB.query(`
      SELECT * 
      FROM wallet_topups 
      WHERE wallet_id = ? 
      ORDER BY created_at DESC
    `, [wallet.wallet_id]);

    console.log("========================================");
    console.log("ADMIN WALLET DETAILS");
    console.log("========================================");
    console.log(`User ID : ${userId}`);
    console.log(`Wallet Balance : ${parseFloat(wallet.balance).toFixed(2)}`);
    console.log(`Transactions Loaded : ${transactions.length}`);
    console.log(`Recharge Records : ${recharges.length}`);
    console.log("========================================");

    console.log("========================================");
    console.log("ADMIN WALLET TRANSACTIONS");
    console.log("========================================");
    console.log(`Transaction Count : ${transactions.length}`);
    console.log(`Latest Transaction : ${transactions.length > 0 ? JSON.stringify(transactions[0]) : "None"}`);
    console.log("========================================");

    console.log("========================================");
    console.log("ADMIN RECHARGE HISTORY");
    console.log("========================================");
    console.log(`Recharge Count : ${recharges.length}`);
    console.log(`Latest Recharge : ${recharges.length > 0 ? JSON.stringify(recharges[0]) : "None"}`);
    console.log("========================================");

    return res.status(200).json({
      success: true,
      data: {
        user: {
          user_id: user.user_id,
          name: user.name,
          email: user.email,
          mobile: user.mobile
        },
        wallet: {
          wallet_id: wallet.wallet_id,
          balance: parseFloat(wallet.balance),
          status: wallet.status,
          totalRechargeAmount,
          totalRefundAmount,
          totalWalletPayments
        },
        transactions,
        recharges
      }
    });
  } catch (error) {
    console.error("❌ Admin Wallet details fetch error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const creditUserWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, reason, remarks } = req.body;
    
    // admin object is attached to req by authenticateAdminToken middleware
    const adminId = req.admin.adminId; 

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "Valid amount is required." });
    }
    if (!reason) {
      return res.status(400).json({ success: false, error: "Reason is required." });
    }

    // Call Wallet Service
    const creditResult = await walletService.creditAdminWallet({
      userId,
      adminId,
      amount,
      reason,
      remarks
    });

    // Fetch user details for email
    const [userRows] = await ConnectDB.query("SELECT name, email FROM users WHERE user_id = ?", [userId]);
    if (userRows.length > 0 && userRows[0].email) {
      const user = userRows[0];
      try {
        await emailService.sendWalletCreditEmail({
          name: user.name,
          email: user.email,
          amount: creditResult.credited_amount,
          reason,
          currentBalance: creditResult.balance
        });
      } catch (emailErr) {
        console.error("❌ Failed to send wallet credit email:", emailErr.message);
        // Do not rollback successful credit if email fails
      }
    }

    return res.status(200).json({
      success: true,
      message: "Wallet credited successfully.",
      data: creditResult
    });
  } catch (error) {
    console.error("❌ Admin Wallet Credit error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getPaymentGateways = async (req, res) => {
  try {
    const [rows] = await ConnectDB.execute("SELECT gateway_name, display_name, is_enabled FROM payment_gateway_settings ORDER BY display_order ASC");
    return res.status(200).json(rows);
  } catch (error) {
    console.error("❌ Error fetching payment gateways:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

const updatePaymentGateway = async (req, res) => {
  try {
    const { gateways } = req.body;
    const adminId = (req.admin && req.admin.adminId) || (req.user && req.user.adminId) || 1;
    
    if (!Array.isArray(gateways)) {
      return res.status(400).json({ success: false, error: "gateways must be an array" });
    }

    const [prevRows] = await ConnectDB.execute("SELECT gateway_name FROM payment_gateway_settings WHERE is_enabled = 1");
    const prevGateways = prevRows.map(r => r.gateway_name).join(', ') || 'NONE';

    // First disable all
    await ConnectDB.execute("UPDATE payment_gateway_settings SET is_enabled = 0, updated_by = ?, updated_at = NOW()", [adminId]);
    
    // Enable the selected ones
    for (const g of gateways) {
      if (g === 'ICICI' || g === 'CASHFREE' || g === 'INSTAMOJO') {
        await ConnectDB.execute("UPDATE payment_gateway_settings SET is_enabled = 1, updated_by = ?, updated_at = NOW() WHERE gateway_name = ?", [adminId, g]);
      }
    }

    console.log(`
====================================
PAYMENT GATEWAY UPDATED
====================================
Admin: ${adminId}
Selected Gateways: ${gateways.join(', ')}
Previous Gateways: ${prevGateways}
Time: ${new Date().toLocaleString()}
====================================`);

    return res.status(200).json({ success: true, message: "Gateway Preference Updated Successfully" });
  } catch (error) {
    console.error("❌ Error updating payment gateway:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get all administrators (SUPERADMIN only)
 */
const getAdministrators = async (req, res) => {
  try {
    const [rows] = await ConnectDB.execute("SELECT id, full_name, email, role, is_active, created_at, last_login FROM admin ORDER BY created_at DESC");
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error("❌ Error fetching administrators:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

/**
 * Create a new administrator (SUPERADMIN only)
 */
const createAdministrator = async (req, res) => {
  try {
    const { full_name, email, password, role } = req.body;
    
    if (!full_name || !email || !password || !role) {
      return res.status(400).json({ success: false, error: "All fields are required." });
    }

    if (role !== "ADMIN") {
      return res.status(400).json({ success: false, error: "You can only create ADMIN roles." });
    }

    const [existing] = await ConnectDB.execute("SELECT id FROM admin WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: "An administrator with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const createdBy = req.admin.adminId;

    await ConnectDB.execute(
      "INSERT INTO admin (full_name, email, password, role, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, NOW(), NOW())",
      [full_name, email, hashedPassword, role, createdBy]
    );

    await ConnectDB.execute(
      "INSERT INTO activity_logs (admin_id, action, target, details) VALUES (?, ?, ?, ?)",
      [createdBy, "CREATE", "Administrator", `Created Administrator: ${full_name}`]
    ).catch(e => console.error("Activity Log Error:", e));

    return res.status(201).json({ success: true, message: "Administrator created successfully." });
  } catch (error) {
    console.error("❌ Error creating administrator:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

/**
 * Update administrator (SUPERADMIN only)
 */
const updateAdministrator = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, is_active, password } = req.body;
    
    if (!full_name || !email) {
      return res.status(400).json({ success: false, error: "Full Name and Email are required." });
    }

    const [existing] = await ConnectDB.execute("SELECT id FROM admin WHERE email = ? AND id != ?", [email, id]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: "Email is already in use by another administrator." });
    }

    let query = "UPDATE admin SET full_name = ?, email = ?, is_active = ?, updated_at = NOW() WHERE id = ?";
    let params = [full_name, email, is_active, id];

    let isSelfPasswordChange = false;

    if (password) {
      if (Number(id) === req.admin.adminId) {
        // Enforce OTP verification
        const [otpRows] = await ConnectDB.execute(
          "SELECT * FROM admin_otp_verifications WHERE admin_id = ? AND verified = 1 AND purpose = 'PASSWORD_CHANGE' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
          [req.admin.adminId]
        );
        if (otpRows.length === 0) {
          return res.status(403).json({ success: false, error: "OTP verification required for self password change." });
        }
        
        const otpRecord = otpRows[0];
        // Invalidate OTP immediately
        await ConnectDB.execute("UPDATE admin_otp_verifications SET expires_at = NOW() WHERE otp_id = ?", [otpRecord.otp_id]);
        
        isSelfPasswordChange = true;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      query = "UPDATE admin SET full_name = ?, email = ?, is_active = ?, password = ?, updated_at = NOW() WHERE id = ?";
      params = [full_name, email, is_active, hashedPassword, id];
    }

    await ConnectDB.execute(query, params);

    const ipAddress = req.headers["x-forwarded-for"] || req.connection.remoteAddress || "127.0.0.1";
    await ConnectDB.execute(
      "INSERT INTO admin_audit_logs (admin_id, performed_by, action, ip_address) VALUES (?, ?, ?, ?)",
      [id, req.admin.adminId, "Admin Profile Updated", ipAddress]
    ).catch(e => console.error("Admin Audit Log Error:", e));

    if (password) {
      await ConnectDB.execute(
        "INSERT INTO admin_audit_logs (admin_id, performed_by, action, ip_address) VALUES (?, ?, ?, ?)",
        [id, req.admin.adminId, "Password Changed", ipAddress]
      ).catch(e => console.error("Admin Audit Log Error:", e));

      if (isSelfPasswordChange) {
        await ConnectDB.execute(
          "INSERT INTO admin_audit_logs (admin_id, performed_by, action, ip_address) VALUES (?, ?, ?, ?)",
          [id, req.admin.adminId, "Logout After Password Change", ipAddress]
        ).catch(e => console.error("Admin Audit Log Error:", e));
      }
    }

    return res.status(200).json({ success: true, message: "Administrator updated successfully." });
  } catch (error) {
    console.error("❌ Error updating administrator:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

/**
 * Delete administrator (SUPERADMIN only)
 */
const deleteAdministrator = async (req, res) => {
  try {
    const { id } = req.params;
    const currentAdminId = req.admin.adminId;

    if (parseInt(id) === parseInt(currentAdminId)) {
      return res.status(400).json({ success: false, error: "You cannot delete your own account." });
    }

    const [targetAdmin] = await ConnectDB.execute("SELECT role, full_name FROM admin WHERE id = ?", [id]);
    if (targetAdmin.length === 0) {
      return res.status(404).json({ success: false, error: "Administrator not found." });
    }

    if (targetAdmin[0].role === "SUPERADMIN") {
      return res.status(403).json({ success: false, error: "You cannot delete a SUPERADMIN account." });
    }

    await ConnectDB.execute("DELETE FROM admin WHERE id = ?", [id]);

    await ConnectDB.execute(
      "INSERT INTO activity_logs (admin_id, action, target, details) VALUES (?, ?, ?, ?)",
      [currentAdminId, "DELETE", "Administrator", `Deleted Administrator: ${targetAdmin[0].full_name}`]
    ).catch(e => console.error("Activity Log Error:", e));

    return res.status(200).json({ success: true, message: "Administrator deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting administrator:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

const maskEmail = (email) => {
  if (!email) return "";
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  if (name.length <= 4) return `${name[0]}***${name.slice(-1)}@${domain}`;
  const maskedLength = name.length - 4;
  return `${name.slice(0, 2)}${"*".repeat(maskedLength)}${name.slice(-2)}@${domain}`;
};

const requestPasswordChangeOtp = async (req, res) => {
  try {
    const { current_password } = req.body;
    if (!current_password) return res.status(400).json({ success: false, error: "Current password is required." });

    const adminId = req.admin.adminId;
    const [rows] = await ConnectDB.execute("SELECT * FROM admin WHERE id = ?", [adminId]);
    const admin = rows[0];

    if (!admin) return res.status(404).json({ success: false, error: "Admin not found." });

    const isMatch = await bcrypt.compare(current_password, admin.password);
    if (!isMatch) return res.status(401).json({ success: false, error: "Incorrect current password." });

    const email = process.env.SUPERADMIN_OTP_EMAIL;
    if (!email) {
      return res.status(500).json({ success: false, error: "SUPERADMIN_OTP_EMAIL environment variable is missing." });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    await ConnectDB.execute(
      "INSERT INTO admin_otp_verifications (admin_id, otp_code, purpose, expires_at) VALUES (?, ?, 'PASSWORD_CHANGE', ?)",
      [adminId, otp, expiresAt]
    );

    await emailService.sendSuperAdminOtpEmail({ email, otp });

    const ipAddress = req.headers["x-forwarded-for"] || req.connection.remoteAddress || "127.0.0.1";
    await ConnectDB.execute(
      "INSERT INTO admin_audit_logs (admin_id, performed_by, action, ip_address) VALUES (?, ?, ?, ?)",
      [adminId, adminId, "OTP Generated", ipAddress]
    ).catch(e => console.error("Admin Audit Log Error:", e));
    await ConnectDB.execute(
      "INSERT INTO admin_audit_logs (admin_id, performed_by, action, ip_address) VALUES (?, ?, ?, ?)",
      [adminId, adminId, "OTP Sent", ipAddress]
    ).catch(e => console.error("Admin Audit Log Error:", e));

    const maskedEmail = maskEmail(email);

    return res.status(200).json({ success: true, message: "OTP sent successfully to Super Admin email.", maskedEmail });
  } catch (error) {
    console.error("❌ requestPasswordChangeOtp error:", error);
    return res.status(500).json({ success: false, error: "Failed to generate OTP." });
  }
};

const verifyPasswordChangeOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ success: false, error: "OTP is required." });

    const adminId = req.admin.adminId;
    
    // Find active OTP
    const [rows] = await ConnectDB.execute(
      "SELECT * FROM admin_otp_verifications WHERE admin_id = ? AND otp_code = ? AND verified = 0 AND purpose = 'PASSWORD_CHANGE' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [adminId, otp]
    );

    const ipAddress = req.headers["x-forwarded-for"] || req.connection.remoteAddress || "127.0.0.1";

    if (rows.length === 0) {
      await ConnectDB.execute(
        "INSERT INTO admin_audit_logs (admin_id, performed_by, action, ip_address) VALUES (?, ?, ?, ?)",
        [adminId, adminId, "OTP Failed", ipAddress]
      ).catch(e => console.error("Admin Audit Log Error:", e));
      return res.status(400).json({ success: false, error: "Invalid or expired OTP." });
    }

    const otpRecord = rows[0];

    if (otpRecord.attempts >= 5) {
      return res.status(429).json({ success: false, error: "Maximum verification attempts exceeded." });
    }

    // OTP matched! Mark verified
    await ConnectDB.execute("UPDATE admin_otp_verifications SET verified = 1 WHERE otp_id = ?", [otpRecord.otp_id]);

    await ConnectDB.execute(
      "INSERT INTO admin_audit_logs (admin_id, performed_by, action, ip_address) VALUES (?, ?, ?, ?)",
      [adminId, adminId, "OTP Verified", ipAddress]
    ).catch(e => console.error("Admin Audit Log Error:", e));

    return res.status(200).json({ success: true, message: "OTP verified successfully." });
  } catch (error) {
    console.error("❌ verifyPasswordChangeOtp error:", error);
    return res.status(500).json({ success: false, error: "Failed to verify OTP." });
  }
};

module.exports = {
  login,
  me,
  logout,
  getAdminWallets,
  getAdminWalletDetails,
  creditUserWallet,
  getPaymentGateways,
  updatePaymentGateway,
  getAdministrators,
  createAdministrator,
  updateAdministrator,
  deleteAdministrator,
  requestPasswordChangeOtp,
  verifyPasswordChangeOtp,
};
