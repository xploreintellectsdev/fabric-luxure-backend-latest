const authService = require("./auth.service");
const bcrypt = require("bcryptjs");

/**
 * Register a new user (Sign Up)
 */
const signup = async (req, res) => {
  try {
    const { firstName, lastName, email, mobile, password } = req.body;
    console.log("📥 Signup Request Body:", { email, mobile });

    if (!firstName || !lastName || !email || !mobile || !password) {
      return res.status(400).json({
        success: false,
        error: "All fields (firstName, lastName, email, mobile, password) are required.",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email address format.",
      });
    }

    // Validate mobile (exactly 10 digits)
    const mobileRegex = /^\d{10}$/;
    if (!mobileRegex.test(mobile)) {
      return res.status(400).json({
        success: false,
        error: "Mobile number must be exactly 10 digits.",
      });
    }

    // Validate password length (minimum 6 characters)
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long.",
      });
    }

    // Check duplicate email
    const existingEmailUser = await authService.getUserByEmail(email);
    let isGuestUpgrade = false;

    if (existingEmailUser) {
      if (existingEmailUser.is_registered === 1) {
        return res.status(409).json({
          success: false,
          error: "Email is already registered.",
        });
      } else {
        isGuestUpgrade = true;
      }
    }

    // Check duplicate mobile
    const existingMobileUser = await authService.getUserByMobile(mobile);
    if (existingMobileUser) {
      if (!isGuestUpgrade || existingMobileUser.user_id !== existingEmailUser.user_id) {
        return res.status(409).json({
          success: false,
          error: "Mobile number is already registered.",
        });
      }
    }

    // Check if OTP was verified for this email
    const otpRecord = await authService.getOtpRecord(email, "signup");
    if (!otpRecord || otpRecord.verified !== 1) {
      console.log(`❌ Signup Error: Email ${email} not verified via OTP.`);
      return res.status(403).json({
        success: false,
        error: "Email is not verified. Please complete OTP verification first.",
      });
    }

    let newUser;
    let token = null;

    if (isGuestUpgrade) {
      await authService.updateGuestUserRegistration(email, {
        firstName,
        lastName,
        mobile,
        password,
      });

      const updatedUser = await authService.getUserByEmail(email);
      token = authService.generateToken(updatedUser);

      console.log(`✅ Guest Upgrade Success: User Created -> ${email}`);

      return res.status(200).json({
        success: true,
        message: "Account registered successfully.",
        token,
        user: {
          userId: updatedUser.user_id,
          name: updatedUser.name,
          email: updatedUser.email,
          mobile: updatedUser.mobile,
        },
      });
    } else {
      // Create new user
      newUser = await authService.createUser({
        firstName,
        lastName,
        email,
        mobile,
        password,
      });
      console.log(`✅ Signup Success: User Created -> ${email}`);

      return res.status(201).json({
        success: true,
        message: "User registered successfully.",
        user: newUser,
      });
    }
  } catch (error) {
    console.error("❌ Signup Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
};

/**
 * Authenticate existing user (Sign In)
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("📥 Login Request Body:", { email });

    const ipAddress = req.ip || req.connection.remoteAddress;
    const deviceInfo = req.headers["user-agent"];

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required.",
      });
    }

    const user = await authService.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password.",
      });
    }

    if (user.is_registered === 0) {
      return res.status(403).json({
        success: false,
        error: "This account was created through Guest Checkout. Please complete your registration first.",
      });
    }

    // Check if user is active
    if (user.is_active !== 1) {
      return res.status(401).json({
        success: false,
        error: "Your account is currently inactive.",
      });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await authService.recordLoginHistory(user.user_id, ipAddress, deviceInfo, "FAILED");
      return res.status(401).json({
        success: false,
        error: "Invalid email or password.",
      });
    }

    // Update last login & success entry
    await authService.updateLastLogin(user.user_id);
    await authService.recordLoginHistory(user.user_id, ipAddress, deviceInfo, "SUCCESS");

    // Generate JWT token
    const token = authService.generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        userId: user.user_id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
      },
    });
  } catch (error) {
    console.error("❌ Login Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
};

/**
 * Sign out user
 */
const logout = async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (token) {
      try {
        const decoded = require("jsonwebtoken").verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const ConnectDB = require("../../config/db");
        // Update user logout time
        await ConnectDB.execute(`
          UPDATE user_login_history
          SET logout_time = NOW()
          WHERE user_id = ? AND logout_time IS NULL
          ORDER BY login_time DESC
          LIMIT 1
        `, [userId]);
      } catch (jwtErr) {
        // Ignore JWT verification errors on logout
      }
    }

    return res.status(200).json({
      success: true,
      message: "Logout successful.",
    });
  } catch (error) {
    console.error("❌ Logout Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
};

/**
 * Handle Google OAuth authentication
 */
const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    console.log("📥 Google Login Request Body (Credential Received)");

    if (!credential) {
      return res.status(400).json({
        success: false,
        error: "Google credential is required.",
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const deviceInfo = req.headers["user-agent"];

    // Verify token
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyError) {
      console.error("❌ Google Token Verification Error:", verifyError);
      return res.status(401).json({
        success: false,
        message: "Invalid Google account.",
      });
    }

    const { email, given_name: firstName, family_name: lastName, name, email_verified } = payload;

    if (!email) {
      return res.status(401).json({ success: false, message: "Invalid Google account (No email found)." });
    }

    // Check if user already exists
    let user = await authService.getUserByEmail(email);
    let message = "Login successful.";

    if (!user) {
      // Create new user for Google Sign-in
      user = await authService.createGoogleUser({ email, firstName, lastName, name });
      message = "User registered and logged in successfully via Google.";
    } else if (user.is_registered === 0) {
      // Guest User -> Upgrade
      await authService.upgradeGuestToGoogle(email, name || `${firstName || ""} ${lastName || ""}`.trim());
      user = await authService.getUserByEmail(email); // refetch to get updated status
      message = "Account registered and logged in successfully via Google.";
    } else {
      // Registered User -> Login
      if (user.is_active !== 1) {
        return res.status(401).json({
          success: false,
          error: "Your account is currently inactive.",
        });
      }
    }

    const userId = user.user_id || user.userId;

    // Update last login & history
    await authService.updateLastLogin(userId);
    await authService.recordLoginHistory(userId, ipAddress, deviceInfo, "SUCCESS");

    // Generate JWT token
    const token = authService.generateToken(user);

    return res.status(200).json({
      success: true,
      message,
      token,
      user: {
        userId,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
      },
    });
  } catch (error) {
    console.error("❌ Google Login Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
};

/**
 * Get profile details of authenticated user
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const ConnectDB = require("../../config/db");
    const query = "SELECT user_id, name, email, mobile, created_at, last_login FROM users WHERE user_id = ?";
    const [rows] = await ConnectDB.execute(query, [userId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found.",
      });
    }

    const user = rows[0];

    return res.status(200).json({
      success: true,
      data: {
        userId: user.user_id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        createdAt: user.created_at,
        lastLogin: user.last_login,
      },
    });
  } catch (error) {
    console.error("❌ Get Profile Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
};

/**
 * Retrieve all registered users
 */
const getAllUsers = async (req, res) => {
  try {
    const ConnectDB = require("../../config/db");
    const query = `
      SELECT 
        user_id,
        name,
        email,
        mobile,
        is_active,
        created_at,
        last_login
      FROM users
      ORDER BY user_id DESC
    `;
    const [rows] = await ConnectDB.execute(query);

    const formatted = rows.map((u) => ({
      userId: u.user_id,
      name: u.name,
      email: u.email,
      mobile: u.mobile,
      isActive: u.is_active,
      createdAt: u.created_at,
      lastLogin: u.last_login,
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error("❌ Get All Users Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const ConnectDB = require("../../config/db");

    // 1. Fetch User Record
    const userQuery = `
      SELECT user_id, name, email, mobile, is_active, created_at, updated_at, last_login 
      FROM users 
      WHERE user_id = ?
    `;
    const [userRows] = await ConnectDB.execute(userQuery, [targetUserId]);
    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found.",
      });
    }
    const user = userRows[0];

    // 2. Fetch User Addresses
    const addressQuery = `
      SELECT 
        address_order, 
        full_name, 
        mobile, 
        alternate_mobile, 
        house_building, 
        street_locality, 
        landmark, 
        city, 
        state, 
        country, 
        postal_code, 
        address_type, 
        is_default 
      FROM user_addresses 
      WHERE user_id = ? 
      ORDER BY address_order ASC
    `;
    const [addressRows] = await ConnectDB.execute(addressQuery, [targetUserId]);

    // Format boolean representation for addresses
    const formattedAddresses = addressRows.map((addr) => ({
      address_order: addr.address_order,
      full_name: addr.full_name,
      mobile: addr.mobile,
      alternate_mobile: addr.alternate_mobile,
      house_building: addr.house_building,
      street_locality: addr.street_locality,
      landmark: addr.landmark,
      city: addr.city,
      state: addr.state,
      country: addr.country,
      postal_code: addr.postal_code,
      address_type: addr.address_type,
      is_default: addr.is_default === 1 || addr.is_default === true,
    }));

    // 3. Fetch User Login History
    const loginHistoryQuery = `
      SELECT 
        login_history_id AS id, 
        user_id, 
        login_time, 
        logout_time, 
        ip_address, 
        device_info, 
        login_status 
      FROM user_login_history 
      WHERE user_id = ? 
      ORDER BY login_time DESC
    `;
    const [historyRows] = await ConnectDB.execute(loginHistoryQuery, [targetUserId]);

    const formattedHistory = historyRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      loginTime: row.login_time,
      logoutTime: row.logout_time,
      ipAddress: row.ip_address,
      deviceInfo: row.device_info,
      loginStatus: row.login_status,
    }));

    return res.status(200).json({
      success: true,
      addresses: formattedAddresses,
      login_history: formattedHistory,
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ success: false });
  }
};


const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { firstName, lastName, phone, email } = req.body;

    const ConnectDB = require("../../config/db");

    // Fetch old profile for logs
    const [oldRows] = await ConnectDB.execute("SELECT name, email, mobile FROM users WHERE user_id = ?", [userId]);
    if (oldRows.length === 0) {
      return res.status(404).json({ success: false, error: "User not found." });
    }
    const oldProfile = oldRows[0];

    let name = oldProfile.name;
    if (firstName !== undefined || lastName !== undefined) {
      // If they split it, let's just combine it. Or they can send just one.
      name = `${firstName || ''} ${lastName || ''}`.trim();
      // Fallback to old name if both were sent empty
      if (!name) name = oldProfile.name;
    }

    const newMobile = phone !== undefined ? phone : oldProfile.mobile;
    const newEmail = email !== undefined ? email : oldProfile.email;

    const query = `
      UPDATE users 
      SET name = ?, email = ?, mobile = ?, updated_at = NOW() 
      WHERE user_id = ?
    `;

    const [result] = await ConnectDB.execute(query, [name, newEmail, newMobile, userId]);

    console.log("---- PROFILE UPDATE LOG ----");
    console.log("User ID:", userId);
    console.log("Old Profile:", oldProfile);
    console.log("New Profile:", { name, email: newEmail, mobile: newMobile });
    console.log("Generated SQL:", query);
    console.log("Rows Updated:", result.affectedRows);
    console.log("Update Status:", result.affectedRows > 0 ? "SUCCESS" : "FAILED");
    console.log("----------------------------");

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        userId,
        name,
        email: newEmail,
        mobile: newMobile
      }
    });
  } catch (error) {
    console.error("Profile Update Error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

/**
 * Send OTP
 */
const sendOtp = async (req, res) => {
  try {
    const { email, purpose } = req.body;
    console.log(`📥 Send OTP Request: ${email}, Purpose: ${purpose}`);

    if (!email || !purpose) {
      return res.status(400).json({ success: false, error: "Email and purpose are required." });
    }

    // Check if email exists
    const existingUser = await authService.getUserByEmail(email);

    if (purpose === "signup" && existingUser) {
      if (existingUser.is_registered === 1) {
        return res.status(409).json({ success: false, error: "Email is already registered." });
      }
    }

    if (purpose === "forgot_password" && !existingUser) {
      return res.status(404).json({ success: false, error: "No account found with this email." });
    }

    // Generate secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`🔑 OTP Generated for ${email}: [HIDDEN]`);

    // Hash the OTP
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otp, salt);

    // Calculate expiry (5 minutes)
    const expiresAt = new Date(Date.now() + 5 * 60000);

    // Save in DB
    await authService.saveOtp(email, otpHash, purpose, expiresAt);

    // Send Email
    const emailService = require("../../services/email.service");
    await emailService.sendOtpEmail(email, otp, purpose);
    console.log(`📧 OTP Sent Status: Success for ${email}`);

    return res.status(200).json({ success: true, message: "OTP has been sent to your email. Please check your inbox." });
  } catch (error) {
    console.error("❌ Send OTP Error:", error);
    return res.status(500).json({ success: false, error: "Failed to send OTP." });
  }
};

/**
 * Verify OTP
 */
const verifyOtp = async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;
    console.log(`📥 Verify OTP Request: ${email}, Purpose: ${purpose}`);

    if (!email || !otp || !purpose) {
      return res.status(400).json({ success: false, error: "Email, OTP, and purpose are required." });
    }

    const otpRecord = await authService.getOtpRecord(email, purpose);

    if (!otpRecord) {
      console.log(`❌ OTP Verification Status: Failed (Not Found) for ${email}`);
      return res.status(400).json({ success: false, error: "No pending OTP found." });
    }

    if (otpRecord.verified === 1) {
      return res.status(400).json({ success: false, error: "OTP is already verified." });
    }

    if (otpRecord.attempts >= 3) {
      return res.status(400).json({ success: false, error: "Too many failed attempts. Please request a new OTP." });
    }

    if (new Date() > new Date(otpRecord.expires_at)) {
      console.log(`❌ OTP Verification Status: Failed (Expired) for ${email}`);
      return res.status(400).json({ success: false, error: "OTP expired." });
    }

    const isMatch = await bcrypt.compare(otp, otpRecord.otp_hash);

    if (!isMatch) {
      await authService.incrementOtpAttempts(otpRecord.otp_id);
      console.log(`❌ OTP Verification Status: Failed (Invalid) for ${email}`);
      return res.status(400).json({ success: false, error: "Invalid OTP." });
    }

    await authService.markOtpVerified(otpRecord.otp_id);
    console.log(`✅ OTP Verification Status: Success for ${email}`);

    return res.status(200).json({ success: true, message: "OTP verified successfully." });
  } catch (error) {
    console.error("❌ Verify OTP Error:", error);
    return res.status(500).json({ success: false, error: "Failed to verify OTP." });
  }
};

/**
 * Reset Password
 */
const resetPassword = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`📥 Reset Password Request: ${email}`);

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and new password are required." });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
    }

    // Check if OTP was verified
    const otpRecord = await authService.getOtpRecord(email, "forgot_password");
    if (!otpRecord || otpRecord.verified !== 1) {
      return res.status(403).json({ success: false, error: "Cannot reset password without OTP verification." });
    }

    const user = await authService.getUserByEmail(email);
    if (user && user.is_registered === 0) {
      return res.status(403).json({
        success: false,
        error: "Please complete your account registration first.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const newHashedPassword = await bcrypt.hash(password, salt);

    await authService.updateUserPassword(email, newHashedPassword);
    console.log(`✅ Password Updated for ${email}`);

    return res.status(200).json({ success: true, message: "Password Updated Successfully." });
  } catch (error) {
    console.error("❌ Reset Password Error:", error);
    return res.status(500).json({ success: false, error: "Failed to reset password." });
  }
};

/**
 * Check if a guest email exists and its registration status
 */
const checkGuestEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required." });
    }

    const user = await authService.getUserByEmail(email);
    if (user && user.is_registered === 1) {
      return res.status(200).json({
        success: false,
        code: "REGISTERED_USER_EXISTS",
        message: "This email is already associated with an account. Please sign in to continue checkout."
      });
    }

    if (user) {
      return res.status(200).json({
        success: true,
        exists: true,
        is_registered: user.is_registered
      });
    }

    return res.status(200).json({
      success: true,
      exists: false,
      is_registered: 0
    });
  } catch (error) {
    console.error("❌ Check Guest Email Error:", error);
    return res.status(500).json({ success: false, error: "Failed to check email." });
  }
};

module.exports = {
  updateProfile,
  signup,
  login,
  logout,
  googleLogin,
  getProfile,
  getAllUsers,
  getUserDetails,
  sendOtp,
  verifyOtp,
  resetPassword,
  checkGuestEmail,
};


