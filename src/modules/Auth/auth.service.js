const ConnectDB = require("../../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

/**
 * Find user by email
 */
const getUserByEmail = async (email) => {
  const query = "SELECT * FROM users WHERE email = ?";
  const [rows] = await ConnectDB.execute(query, [email]);
  return rows[0] || null;
};

/**
 * Find user by mobile
 */
const getUserByMobile = async (mobile) => {
  const query = "SELECT * FROM users WHERE mobile = ?";
  const [rows] = await ConnectDB.execute(query, [mobile]);
  return rows[0] || null;
};

/**
 * Create a new email/password user
 */
const createUser = async (userData) => {
  const { firstName, lastName, email, mobile, password } = userData;
  const name = `${firstName || ""} ${lastName || ""}`.trim() || "User";

  // Hash password using bcryptjs
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const connection = await ConnectDB.getConnection();
  try {
    await connection.beginTransaction();

    const query = `
      INSERT INTO users (name, email, mobile, password, is_active, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 1, NOW(), NOW())
    `;

    const [result] = await connection.execute(query, [
      name,
      email,
      mobile,
      hashedPassword,
    ]);

    const userId = result.insertId;

    // Automatically create a wallet for the new user
    await connection.execute(
      `INSERT INTO wallets (user_id, balance, status, created_at, updated_at) VALUES (?, 0.00, 'ACTIVE', NOW(), NOW())`,
      [userId]
    );

    await connection.commit();
    return {
      userId,
      name,
      email,
      mobile,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Create a new user signed up via Google
 */
const createGoogleUser = async (googleData) => {
  const { email, firstName, lastName, name: providedName } = googleData;
  const name = providedName || `${firstName || ""} ${lastName || ""}`.trim() || "User";

  const connection = await ConnectDB.getConnection();
  try {
    await connection.beginTransaction();

    const query = `
      INSERT INTO users (name, email, mobile, password, is_active, email_verified, is_registered, created_at, updated_at)
      VALUES (?, ?, NULL, NULL, 1, 1, 1, NOW(), NOW())
    `;

    const [result] = await connection.execute(query, [
      name,
      email
    ]);

    const userId = result.insertId;

    // Automatically create a wallet for the new user
    await connection.execute(
      `INSERT INTO wallets (user_id, balance, status, created_at, updated_at) VALUES (?, 0.00, 'ACTIVE', NOW(), NOW())`,
      [userId]
    );

    await connection.commit();
    return {
      userId,
      name,
      email,
      mobile: null,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Record a login history entry
 */
const recordLoginHistory = async (userId, ipAddress, deviceInfo, loginStatus) => {
  const query = `
    INSERT INTO user_login_history (user_id, login_time, ip_address, device_info, login_status)
    VALUES (?, NOW(), ?, ?, ?)
  `;
  await ConnectDB.execute(query, [
    userId,
    ipAddress || null,
    deviceInfo || null,
    loginStatus || "SUCCESS",
  ]);
};

/**
 * Update the last_login timestamp for a user
 */
const updateLastLogin = async (userId) => {
  const query = "UPDATE users SET last_login = NOW() WHERE user_id = ?";
  await ConnectDB.execute(query, [userId]);
};

/**
 * Generate a JWT token for a user
 */
const generateToken = (user) => {
  const payload = {
    userId: user.user_id || user.userId,
    email: user.email,
    name: user.name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "User",
  };

  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
};

/**
 * Update user password
 */
const updateUserPassword = async (email, newHashedPassword) => {
  const query = "UPDATE users SET password = ?, updated_at = NOW() WHERE email = ?";
  await ConnectDB.execute(query, [newHashedPassword, email]);
};

/**
 * Save OTP Record
 */
const saveOtp = async (email, otpHash, purpose, expiresAt) => {
  // Invalidate previous OTPs for this email and purpose
  const invalidateQuery = "UPDATE email_otp SET attempts = 99 WHERE email = ? AND purpose = ?";
  await ConnectDB.execute(invalidateQuery, [email, purpose]);

  const query = `
    INSERT INTO email_otp (email, otp_hash, purpose, verified, expires_at, attempts, created_at)
    VALUES (?, ?, ?, 0, ?, 0, NOW())
  `;
  await ConnectDB.execute(query, [email, otpHash, purpose, expiresAt]);
};

/**
 * Get the latest active OTP Record
 */
const getOtpRecord = async (email, purpose) => {
  const query = `
    SELECT * FROM email_otp 
    WHERE email = ? AND purpose = ? 
    ORDER BY created_at DESC LIMIT 1
  `;
  const [rows] = await ConnectDB.execute(query, [email, purpose]);
  return rows[0] || null;
};

/**
 * Increment OTP attempts
 */
const incrementOtpAttempts = async (otpId) => {
  const query = "UPDATE email_otp SET attempts = attempts + 1 WHERE otp_id = ?";
  await ConnectDB.execute(query, [otpId]);
};

/**
 * Mark OTP as verified
 */
const markOtpVerified = async (otpId) => {
  const query = "UPDATE email_otp SET verified = 1 WHERE otp_id = ?";
  await ConnectDB.execute(query, [otpId]);
};

/**
 * Update a guest user to a registered user
 */
const updateGuestUserRegistration = async (email, userData) => {
  const { firstName, lastName, mobile, password } = userData;
  const name = `${firstName || ""} ${lastName || ""}`.trim() || "User";

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const query = `
    UPDATE users 
    SET name = ?, mobile = ?, password = ?, is_registered = 1, updated_at = NOW() 
    WHERE email = ? AND is_registered = 0
  `;
  await ConnectDB.execute(query, [name, mobile, hashedPassword, email]);
};

/**
 * Upgrade a guest user to a registered user via Google
 */
const upgradeGuestToGoogle = async (email, name) => {
  const query = `
    UPDATE users 
    SET name = ?, is_registered = 1, email_verified = 1, updated_at = NOW() 
    WHERE email = ? AND is_registered = 0
  `;
  await ConnectDB.execute(query, [name, email]);
};

module.exports = {
  getUserByEmail,
  getUserByMobile,
  createUser,
  createGoogleUser,
  recordLoginHistory,
  updateLastLogin,
  generateToken,
  updateUserPassword,
  saveOtp,
  getOtpRecord,
  incrementOtpAttempts,
  markOtpVerified,
  updateGuestUserRegistration,
  upgradeGuestToGoogle,
};
