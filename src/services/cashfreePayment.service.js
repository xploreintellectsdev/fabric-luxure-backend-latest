class CashfreePaymentService {
  static async createOrder(params) {
    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const env = process.env.CASHFREE_ENV || 'SANDBOX';
    const callbackUrl = process.env.CASHFREE_CALLBACK_URL;

    if (!appId || !secretKey) {
      throw new Error("Missing mandatory Cashfree gateway environment variables");
    }

    const baseUrl = env === 'PRODUCTION'
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";

    const url = `${baseUrl}/orders`;

    const payload = {
      order_id: params.merchantOrderId,
      order_amount: parseFloat(params.amount).toFixed(2),
      order_currency: "INR",
      customer_details: {
        customer_id: `cust_${params.merchantOrderId}`,
        customer_name: params.customerName || "Guest",
        customer_email: params.customerEmail || "guest@fabricluxure.com",
        customer_phone: params.customerPhone || "9999999999"
      },
      order_meta: {
        return_url: callbackUrl ? `${callbackUrl}?order_id={order_id}` : "https://localhost:5000/api/payment/callback?order_id={order_id}"
      }
    };

    console.log("======================================");
    console.log("CASHFREE CREATE ORDER REQUEST");
    console.log("======================================");
    console.log("Merchant Order :\n" + params.merchantOrderId);
    console.log("\nAmount :\n" + payload.order_amount);
    console.log("\nCustomer :\n" + payload.customer_details.customer_name);
    console.log("\nEmail :\n" + payload.customer_details.customer_email);
    console.log("\nPhone :\n" + payload.customer_details.customer_phone);
    console.log("\n======================================");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": "2022-01-01",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.log("======================================");
        console.log("CASHFREE CREATE ORDER FAILED");
        console.log("======================================");
        console.log(JSON.stringify(data, null, 2));
        console.log("======================================");
        throw new Error(data.message || "Failed to create Cashfree order");
      }

      console.log("======================================");
      console.log("CASHFREE CREATE ORDER RESPONSE");
      console.log("======================================");
      console.log("Cashfree Order ID :\n\n" + data.order_id);
      console.log("\nOrder Status :\n\n" + data.order_status);
      console.log("\n======================================");

      return {
        cashfree_order_id: data.order_id,
        payment_link: data.payment_link,
        order_status: data.order_status,
        rawResponse: data
      };
    } catch (error) {
      console.log("======================================");
      console.log("CASHFREE CREATE ORDER FAILED");
      console.log("======================================");
      console.log(error);
      console.log("======================================");
      throw error;
    }
  }
  static async verifyPayment(orderId) {
    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const env = process.env.CASHFREE_ENV || 'SANDBOX';

    const baseUrl = env === 'PRODUCTION'
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";

    try {
      // 1. Get Order Status
      const orderUrl = `${baseUrl}/orders/${orderId}`;
      const orderResponse = await fetch(orderUrl, {
        method: "GET",
        headers: {
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": "2023-08-01",
          "Accept": "application/json"
        }
      });
      const orderData = await orderResponse.json();

      // 2. Get Payment Details
      let paymentData = {};
      try {
        const paymentUrl = `${baseUrl}/orders/${orderId}/payments`;
        const paymentResponse = await fetch(paymentUrl, {
          method: "GET",
          headers: {
            "x-client-id": appId,
            "x-client-secret": secretKey,
            "x-api-version": "2023-08-01",
            "Accept": "application/json"
          }
        });
        const payments = await paymentResponse.json();
        if (Array.isArray(payments) && payments.length > 0) {
          // Find the successful payment, or just take the first one
          const successfulPayment = payments.find(p => p.payment_status === 'SUCCESS');
          paymentData = successfulPayment || payments[0] || {};
        }
      } catch (e) {
        console.error("Failed to fetch payment details:", e);
      }

      return {
        success: orderResponse.ok,
        status: orderData.order_status,
        amount: orderData.order_amount,
        merchant_order_id: orderData.order_id,
        payment_session_id: orderData.payment_session_id,
        rawResponse: { ...orderData, payment_details: paymentData }
      };
    } catch (err) {
      console.error("Cashfree API Verify Payment Error:", err);
      return { success: false, status: 'API_ERROR' };
    }
  }

  static async refundCashfree(refundParams) {
    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const env = process.env.CASHFREE_ENV || 'SANDBOX';

    const baseUrl = env === 'PRODUCTION'
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";

    const url = `${baseUrl}/orders/${refundParams.merchantOrderId}/refunds`;

    const payload = {
      refund_amount: parseFloat(refundParams.amount).toFixed(2),
      refund_id: refundParams.refundId || `ref_${Date.now()}`,
      refund_note: refundParams.refundNote || "Customer Cancellation"
    };

    console.log("======================================");
    console.log("REFUND INITIATED");
    console.log("======================================");
    console.log("Refund Id :\n" + payload.refund_id);
    console.log("Amount :\n" + payload.refund_amount);
    console.log("Gateway :\nCASHFREE");
    console.log("======================================");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": "2023-08-01",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      return {
        success: response.ok,
        refund_id: data.refund_id,
        refund_status: data.refund_status,
        rawResponse: data
      };
    } catch (error) {
      console.error("Cashfree Refund API Error:", error);
      return { success: false, refund_status: 'FAILED', rawResponse: error };
    }
  }

  static verifyWebhookSignature(signature, rawBody, timestamp) {
    const crypto = require("crypto");
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    if (!signature || !rawBody || !timestamp || !secretKey) return false;

    const signedData = timestamp + rawBody;
    const expectedSignature = crypto
      .createHmac("sha256", secretKey)
      .update(signedData, "utf8")
      .digest("base64");

    return signature === expectedSignature;
  }
}

module.exports = CashfreePaymentService;
