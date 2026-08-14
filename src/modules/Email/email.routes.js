const express = require("express");
const router = express.Router();
const emailController = require("./email.controller");

// Expose public test route in development/local, disable in production
if (process.env.NODE_ENV !== "production") {
  router.post("/test", emailController.sendTestEmail);
} else {
  router.post("/test", (req, res) => {
    return res.status(403).json({
      success: false,
      error: "Test email endpoint is disabled in production.",
    });
  });
}

module.exports = router;
