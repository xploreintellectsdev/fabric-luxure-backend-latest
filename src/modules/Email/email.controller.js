const emailService = require("../../services/email.service");

/**
 * Handle POST /api/email/test
 */
const sendTestEmail = async (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: "Recipient email (to) is required.",
      });
    }

    // Simple email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format.",
      });
    }

    // Send the test email using our service
    const result = await emailService.sendEmail({
      to,
      subject: "Fabric Luxure - Email Configuration Test",
      text: "Your Nodemailer SMTP configuration is working successfully. This is a test email from the Fabric Luxure backend.",
      html: `
        <h2>Fabric Luxure</h2>
        <p>Your Nodemailer SMTP configuration is working successfully.</p>
        <p>This is a test email from the Fabric Luxure backend.</p>
      `,
    });

    return res.status(200).json({
      success: true,
      message: "Test email sent successfully",
      messageId: result.messageId,
    });
  } catch (error) {
    console.error("❌ Test Email Endpoint Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to send test email.",
    });
  }
};

module.exports = {
  sendTestEmail,
};
