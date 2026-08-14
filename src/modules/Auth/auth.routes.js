const express = require("express");
const router = express.Router();
const authController = require("./auth.controller");
const { authenticateToken } = require("../../middleware/auth.middleware");

// Public authentication endpoints
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.post("/google", authController.googleLogin);
router.post("/check-guest-email", authController.checkGuestEmail);

// OTP & Password Reset Endpoints
router.post("/send-otp", authController.sendOtp);
router.post("/verify-otp", authController.verifyOtp);
router.post("/reset-password", authController.resetPassword);

// Protected endpoints
router.get("/profile", authenticateToken, authController.getProfile);
router.put("/profile/update", authenticateToken, authController.updateProfile);
const { authenticateAdminToken } = require("../../middleware/adminAuth.middleware");
router.get("/users", authenticateAdminToken, authController.getAllUsers);
router.get("/users/:id", authenticateAdminToken, authController.getUserDetails);

module.exports = router;
