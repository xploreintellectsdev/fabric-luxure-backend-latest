const crypto = require("crypto");

class InstamojoPaymentService {
  static getBaseUrl() {
    const env = process.env.INSTAMOJO_ENV || "SANDBOX";
    return env === "PRODUCTION"
      ? "https://www.instamojo.com/api/1.1"
      : "https://test.instamojo.com/api/1.1";
  }

  static getCredentials() {
    const apiKey = process.env.INSTAMOJO_API_KEY;
    const authToken = process.env.INSTAMOJO_AUTH_TOKEN;

    if (!apiKey || !authToken) {
      throw new Error("Missing mandatory Instamojo gateway environment variables");
    }

    return { apiKey, authToken };
  }

  static async createPayment(params) {
    const { apiKey, authToken } = this.getCredentials();
    const env = process.env.INSTAMOJO_ENV || "SANDBOX";
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/payment-requests/`;

    const callbackUrl = process.env.INSTAMOJO_CALLBACK_URL || "http://localhost:5000/api/payment/instamojo/callback";
    const webhookUrl = callbackUrl.replace("/callback", "/webhook");

    const payload = new URLSearchParams();
    payload.append("amount", parseFloat(params.amount).toFixed(2));
    payload.append("purpose", params.purpose || params.merchantOrderId);
    payload.append("buyer_name", params.customerName || "Customer");
    payload.append("email", params.customerEmail || "guest@fabricluxure.com");
    payload.append("phone", params.customerPhone || "9999999999");
    payload.append("redirect_url", callbackUrl);
    payload.append("send_email", "false");
    payload.append("send_sms", "false");
    payload.append("allow_repeated_payments", "false");

    if (webhookUrl && !webhookUrl.includes("localhost") && !webhookUrl.includes("127.0.0.1")) {
      payload.append("webhook", webhookUrl);
    } else {
      console.log("⚠️ Webhook parameter omitted because Instamojo requires a public, non-localhost webhook domain.");
    }

    console.log("\n========================================");
    console.log("INSTAMOJO CREATE PAYMENT REQUEST");
    console.log("========================================");
    console.log("Merchant Order:      ", params.merchantOrderId);
    console.log("Amount:              ", parseFloat(params.amount).toFixed(2));
    console.log("Customer Name:       ", params.customerName || "Customer");
    console.log("Customer Email:      ", params.customerEmail || "guest@fabricluxure.com");
    console.log("Customer Phone:      ", params.customerPhone || "9999999999");
    console.log("Purpose:             ", params.purpose || params.merchantOrderId);
    console.log("Environment:         ", env);
    console.log("API URL:             ", url);
    console.log("========================================\n");

    const headers = {
      "X-Api-Key": apiKey,
      "X-Auth-Token": authToken,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    };

    const redactedHeaders = {
      ...headers,
      "X-Api-Key": "[REDACTED_API_KEY]",
      "X-Auth-Token": "[REDACTED_AUTH_TOKEN]"
    };

    console.log("========================================");
    console.log("INSTAMOJO API REQUEST");
    console.log("========================================");
    console.log("Request URL: ", url);
    console.log("Headers:     ", JSON.stringify(redactedHeaders, null, 2));
    console.log("Payload:     ", payload.toString());
    console.log("========================================\n");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: payload
      });

      const rawText = await response.text();
      let data = {};
      try {
        data = JSON.parse(rawText);
      } catch (err) {
        console.error("Failed to parse Instamojo create response JSON");
      }

      console.log("========================================");
      console.log("INSTAMOJO API RESPONSE");
      console.log("========================================");
      console.log("Status Code:      ", response.status);
      console.log("Raw Response:     ", rawText);
      console.log("Parsed Response:  ", JSON.stringify(data, null, 2));

      if (!response.ok || !data.success) {
        let errMessage = "Failed to create Instamojo payment request";
        if (data.message) {
          errMessage = typeof data.message === "object"
            ? JSON.stringify(data.message)
            : String(data.message);
        }
        console.log("========================================");
        console.log("INSTAMOJO PAYMENT CREATION FAILED");
        console.log("========================================");
        console.log("Status Code: ", response.status);
        console.log("Error:       ", errMessage);
        console.log("========================================\n");
        throw new Error(errMessage);
      }

      const paymentRequest = data.payment_request || {};
      console.log("Payment Request ID:", paymentRequest.id);
      console.log("Payment URL:       ", paymentRequest.longurl);
      console.log("========================================\n");

      return {
        payment_request_id: paymentRequest.id,
        payment_url: paymentRequest.longurl,
        status: paymentRequest.status,
        rawResponse: data
      };

    } catch (error) {
      console.log("========================================");
      console.log("INSTAMOJO PAYMENT CREATION FAILED");
      console.log("========================================");
      console.log(error);
      console.log("========================================\n");
      throw error;
    }
  }

  static async verifyPayment(paymentId) {
    const { apiKey, authToken } = this.getCredentials();
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/payments/${paymentId}/`;

    console.log("\n========================================");
    console.log("INSTAMOJO VERIFY PAYMENT REQUEST");
    console.log("========================================");
    console.log("Payment ID:  ", paymentId);
    console.log("Request URL: ", url);
    console.log("========================================\n");

    const headers = {
      "X-Api-Key": apiKey,
      "X-Auth-Token": authToken,
      "Accept": "application/json"
    };

    try {
      const response = await fetch(url, {
        method: "GET",
        headers
      });

      const rawText = await response.text();
      let data = {};
      try {
        data = JSON.parse(rawText);
      } catch (err) {
        console.error("Failed to parse Instamojo verification response JSON");
      }

      console.log("========================================");
      console.log("INSTAMOJO VERIFY PAYMENT RESPONSE");
      console.log("========================================");
      console.log("Status Code:      ", response.status);
      console.log("Raw Response:     ", rawText);
      console.log("Parsed Response:  ", JSON.stringify(data, null, 2));

      const payment = data.payment || {};
      console.log("Payment Status:   ", payment.status);
      console.log("========================================\n");

      return {
        success: response.ok && data.success,
        status: payment.status, // e.g. "Credit", "Failed", "Pending"
        amount: payment.amount,
        buyer_email: payment.buyer_email,
        buyer_phone: payment.buyer_phone,
        buyer_name: payment.buyer_name,
        payment_request_id: payment.payment_request,
        payment_mode: payment.instrument_type, // e.g. "UPI", "Card"
        rawResponse: data
      };

    } catch (error) {
      console.error("Instamojo Verify Payment Error:", error);
      return { success: false, status: "API_ERROR", rawResponse: error };
    }
  }

  static async refundInstamojo(refundParams) {
    const { apiKey, authToken } = this.getCredentials();
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/refunds/`;

    console.log("\n========================================");
    console.log("INSTAMOJO REFUND REQUEST");
    console.log("========================================");
    console.log("Payment ID:       ", refundParams.paymentId);
    console.log("Refund Amount:    ", parseFloat(refundParams.amount).toFixed(2));
    console.log("Refund Reference: ", refundParams.refundId);
    console.log("Refund Reason:    ", refundParams.refundNote || "Customer Cancellation");
    console.log("========================================\n");

    const payload = new URLSearchParams();
    payload.append("payment_id", refundParams.paymentId);
    payload.append("type", "RFD"); // RFD is normal refund, QFL is Quick refund
    payload.append("refund_amount", parseFloat(refundParams.amount).toFixed(2));
    payload.append("body", refundParams.refundNote || "Customer Cancellation");

    const headers = {
      "X-Api-Key": apiKey,
      "X-Auth-Token": authToken,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: payload
      });

      const rawText = await response.text();
      let data = {};
      try {
        data = JSON.parse(rawText);
      } catch (err) {
        console.error("Failed to parse Instamojo refund response JSON");
      }

      console.log("========================================");
      console.log("INSTAMOJO REFUND RESPONSE");
      console.log("========================================");
      console.log("Status Code:      ", response.status);
      console.log("Raw Response:     ", rawText);
      console.log("Parsed Response:  ", JSON.stringify(data, null, 2));

      const refundObj = data.refund || {};
      console.log("Refund ID:        ", refundObj.id);
      console.log("Refund Status:    ", refundObj.status);
      console.log("========================================\n");

      return {
        success: response.ok && data.success,
        refund_id: refundObj.id,
        refund_status: refundObj.status,
        rawResponse: data
      };

    } catch (error) {
      console.error("Instamojo Refund API Error:", error);
      return { success: false, refund_status: "FAILED", error: error.message, rawResponse: error };
    }
  }

  static verifyWebhookSignature(payloadObject, salt) {
    const data = { ...payloadObject };
    const macProvided = data.mac;
    if (!macProvided || !salt) return false;

    delete data.mac;

    // Sort keys alphabetically
    const sortedKeys = Object.keys(data).sort();

    // Concatenate values with '|' separator
    let dataString = "";
    for (let i = 0; i < sortedKeys.length; i++) {
      dataString += data[sortedKeys[i]];
      if (i < sortedKeys.length - 1) {
        dataString += "|";
      }
    }

    const calculatedMac = crypto
      .createHmac("sha1", salt)
      .update(dataString)
      .digest("hex");

    return calculatedMac === macProvided;
  }
}

module.exports = InstamojoPaymentService;
