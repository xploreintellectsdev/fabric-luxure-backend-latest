require("dotenv").config();
const ConnectDB = require("./config/db");
const IciciPaymentService = require("./services/iciciPayment.service");

async function main() {
  try {
    const [sessions] = await ConnectDB.query("SELECT * FROM payment_sessions ORDER BY session_id DESC LIMIT 1");
    if (sessions.length === 0) {
      console.log("No payment sessions found.");
      process.exit(0);
    }
    const session = sessions[0];
    console.log("=== LAST PAYMENT SESSION ===");
    console.log(session);

    const secretKey = process.env.ICICI_SECRET_KEY;

    // Simulator inputs
    const checksumParams = {
      merchantId: process.env.ICICI_MERCHANT_ID,
      merchantOrderId: session.merchant_order_id,
      amount: String(session.amount),
      paymentStatus: "SUCCESS",
      currency: "INR"
    };

    console.log("\n--- Simulator Parameters ---");
    console.log(checksumParams);
    const successChecksum = IciciPaymentService.generateChecksum(checksumParams, secretKey);
    console.log("Generated Simulator Checksum:", successChecksum);

    // Callback verification inputs (mocking callbackParams)
    const callbackParams = {
      merchantOrderId: session.merchant_order_id,
      amount: String(session.amount),
      paymentStatus: "SUCCESS",
      checksum: successChecksum,
      transactionId: "txn_icici_12345",
      bankName: "ICICI_BANK",
      userId: String(session.user_id),
      addressId: String(session.address_id),
      paymentMethod: "card_credit"
    };

    // Run verification logic
    const verificationParams = {
      merchantId: process.env.ICICI_MERCHANT_ID,
      merchantOrderId: callbackParams.merchantOrderId,
      amount: callbackParams.amount,
      paymentStatus: callbackParams.paymentStatus,
      currency: "INR"
    };

    console.log("\n--- Verification Parameters ---");
    console.log(verificationParams);
    const calculatedHash = IciciPaymentService.generateChecksum(verificationParams, secretKey);
    console.log("Calculated Verification Hash:", calculatedHash);
    console.log("Matches?", successChecksum === calculatedHash);

    process.exit(0);
  } catch (error) {
    console.error("Error debugging hash:", error);
    process.exit(1);
  }
}

main();
