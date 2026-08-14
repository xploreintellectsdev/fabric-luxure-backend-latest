const ConnectDB = require("../../config/db");
const walletService = require("../Wallet/wallet.service");
const ShippingFactory = require("../../services/shipping/ShippingFactory");
const CashfreePaymentService = require("../../services/cashfreePayment.service");

// =========================================================
// CUSTOMER: CANCEL ORDER API
// =========================================================
const cancelOrder = async (req, res) => {
  const connection = await ConnectDB.getConnection();
  try {
    const userId = req.user.userId || req.user.user_id;
    const { orderNumber } = req.params;
    const { cancellation_reason } = req.body;

    console.log("========================================");
    console.log("[CANCEL ORDER TRIGGER] Backend endpoint reached");
    console.log("[CANCEL ORDER TRIGGER] Order:", orderNumber);
    console.log("========================================");

    await connection.beginTransaction();

    const isNumeric = /^\d+$/.test(orderNumber);
    const queryStr = isNumeric
      ? "SELECT * FROM orders WHERE order_id = ? FOR UPDATE"
      : "SELECT * FROM orders WHERE order_number = ? FOR UPDATE";

    const [orders] = await connection.query(queryStr, [orderNumber]);
    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const order = orders[0];

    // Ownership check
    if (order.user_id !== userId) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Unauthorized to cancel this order." });
    }

    // Check if cancellation already exists (idempotency check)
    const [existingCancellations] = await connection.query(
      "SELECT * FROM order_cancellations WHERE order_id = ? FOR UPDATE",
      [order.order_id]
    );

    if (existingCancellations.length > 0) {
      const existing = existingCancellations[0];

      // If the refund was already successfully processed/accepted or has a gateway refund ID:
      const wasRefunded =
        existing.refund_response_code === "R1000" ||
        existing.refund_response_code === "000" ||
        existing.refund_status === "REFUNDED" ||
        existing.refund_status === "PROCESSING" ||
        existing.refund_status === "PENDING" ||
        existing.gateway_refund_id !== null;

      if (wasRefunded) {
        console.log(`[Idempotency Warning] Refund was already successfully processed. Completing local cancellation.`);

        // Update the order cancellation record to CANCELLED/SUCCESS
        await connection.query(`
          UPDATE order_cancellations 
          SET cancellation_status = 'CANCELLED', refund_status = 'REFUNDED', updated_at = NOW()
          WHERE order_id = ?
        `, [order.order_id]);

        // Update orders table
        await connection.query(
          "UPDATE orders SET order_status = 'CANCELLED', updated_at = NOW() WHERE order_id = ?",
          [order.order_id]
        );

        // Update shipment details if exists
        await connection.query(
          "UPDATE shipment_details SET shipment_status = 'CANCELLED', updated_at = NOW() WHERE order_id = ?",
          [order.order_id]
        );

        // Insert history timeline
        await connection.query(
          "INSERT INTO order_status_history (order_id, status, remarks, created_at) VALUES (?, 'CANCELLED', 'Order cancelled by customer. Refund completed.', NOW())",
          [order.order_id]
        );

        await connection.commit();
        return res.status(200).json({
          success: true,
          message: "Your order has been cancelled successfully. Your refund was already completed.",
          cancellation: {
            cancellation_status: "CANCELLED",
            refund_status: "REFUNDED",
            refund_amount: existing.refund_amount
          }
        });
      }

      if (existing.cancellation_status !== "FAILED" && existing.cancellation_status !== "REJECTED") {
        await connection.rollback();
        return res.status(200).json({
          success: true,
          message: "Order cancellation already requested.",
          cancellation: {
            cancellation_status: existing.cancellation_status,
            refund_status: existing.refund_status,
            refund_amount: existing.refund_amount
          }
        });
      }

      // Clear previous failed records to prevent duplicate key constraint violations on retry
      await connection.query(
        "DELETE FROM order_cancellations WHERE order_id = ? AND cancellation_status IN ('FAILED', 'REJECTED')",
        [order.order_id]
      );
    }

    // Load successful payment
    const [payments] = await connection.query(
      "SELECT * FROM payments WHERE order_id = ? AND payment_status = 'Success' LIMIT 1 FOR UPDATE",
      [order.order_id]
    );

    if (payments.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "No successful payment transaction found for this order." });
    }
    const payment = payments[0];

    // Load shipment details
    const [shipmentRows] = await connection.query(
      "SELECT * FROM shipment_details WHERE order_id = ? FOR UPDATE",
      [order.order_id]
    );
    const shipment = shipmentRows[0];

    // Verify cancellation eligibility
    let latestStatus = order.order_status;
    const provider = (shipment && shipment.shipping_provider) ? ShippingFactory.getProvider(shipment.shipping_provider) : ShippingFactory.getProvider('DELHIVERY');

    if (shipment && shipment.awb_number) {
      try {
        const syncResult = await provider.syncShipment(shipment, connection);
        if (syncResult && syncResult.success) {
          latestStatus = syncResult.normalizedStatus;
        } else {
          throw new Error("Tracking sync returned failure status");
        }
      } catch (trackErr) {
        console.error("❌ [Shipment Cancel Sync] Tracking fetch failed:", trackErr.message);
        await connection.rollback();
        return res.status(400).json({
          success: false,
          code: "TRACKING_STATUS_CHECK_FAILED",
          message: "We could not verify the latest shipment status. Please try again."
        });
      }
    }

    const allowedStatuses = ["ORDER_PLACED", "SELLER_PREPARING", "PENDING", "SHIPMENT_CREATED", "PICKUP_PENDING", "MANIFEST_GENERATED", "WAREHOUSE", "SHIPMENT CREATED", "PICKUP PENDING", "MANIFEST GENERATED", "CREATED", "AWB_ASSIGNED", "READY_FOR_PICKUP", "PICKUP_REQUESTED", "NOT_PICKED"];
    const normalized = latestStatus.toUpperCase().replace(/_/g, " ").trim();
    const isAllowed = allowedStatuses.some(status => normalized === status.toUpperCase().replace(/_/g, " ").trim());

    if (!isAllowed) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        code: "ORDER_NOT_CANCELLABLE",
        currentStatus: latestStatus,
        message: `This order can no longer be cancelled because the shipment is already ${latestStatus.replace(/_/g, ' ').toLowerCase()}.`
      });
    }

    let paymentType = "GATEWAY";
    if (parseFloat(payment.wallet_amount || 0) > 0 && parseFloat(payment.gateway_amount || 0) > 0) {
      paymentType = "MIXED";
    } else if (payment.payment_method === "WALLET" || payment.gateway_name === "WALLET") {
      paymentType = "WALLET";
    } else if (payment.payment_type) {
      paymentType = payment.payment_type;
    }

    // Normalize SPLIT to MIXED for refund processing
    if (paymentType === "SPLIT") {
      paymentType = "MIXED";
    }

    const refundMethodInput = req.body.refund_method || (paymentType === "MIXED" ? "SPLIT" : paymentType === "WALLET" ? "WALLET" : "ORIGINAL_PAYMENT");

    // Create the cancellation record initially
    await connection.query(`
      INSERT INTO order_cancellations (
        order_id, payment_id, cancellation_reason, cancelled_by, order_status_at_request, cancellation_status, refund_amount, refund_method, refund_status, requested_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'CUSTOMER', ?, 'REQUESTED', ?, ?, 'NOT_INITIATED', NOW(), NOW(), NOW())
    `, [
      order.order_id,
      payment.payment_id,
      cancellation_reason || "No reason provided",
      latestStatus,
      payment.amount || order.grand_total,
      refundMethodInput
    ]);

    // Shipping Provider Cancellation
    let shippingCancelStatus = null;
    let cancellationError = null;

    if (shipment && shipment.awb_number) {
      try {
        const providerName = shipment.shipping_provider || 'DELHIVERY';
        console.log(`[SHIPMENT CANCELLATION] Provider: ${providerName} | Order Number: ${order.order_number} | Status: ${latestStatus}`);
        
        const cancelRes = await provider.cancelShipment(shipment.awb_number);
        if (cancelRes && cancelRes.status === true) {
          shippingCancelStatus = "SUCCESS";
          console.log(`[SHIPMENT CANCELLATION] Result: SUCCESS`);
        } else {
          shippingCancelStatus = "FAILED";
          cancellationError = cancelRes?.remark || cancelRes?.rmk || cancelRes?.message || `${providerName} rejected package cancellation.`;
          console.log(`[SHIPMENT CANCELLATION] Result: FAILED | Error: ${cancellationError}`);
        }
      } catch (cancelErr) {
        shippingCancelStatus = "FAILED";
        cancellationError = cancelErr.message;
        console.log(`[SHIPMENT CANCELLATION] Result: FAILED | Exception: ${cancellationError}`);
      }

      await connection.query(`
        UPDATE order_cancellations 
        SET delhivery_cancel_status = ?, cancellation_error = ?, updated_at = NOW()
        WHERE order_id = ?
      `, [shippingCancelStatus, cancellationError, order.order_id]);
    }

    // Refund Execution Flow
    let refundStatus = "PROCESSING";

    await connection.query(`
      UPDATE order_cancellations 
      SET refund_status = 'PROCESSING', refund_initiated_at = NOW(), updated_at = NOW()
      WHERE order_id = ?
    `, [order.order_id]);

    const iciciService = require("../../services/iciciPayment.service");
    const refundTxnNo = `R${order.order_id}_${Date.now().toString().slice(-10)}`;
    let gatewayRefundId = null;
    let refundReferenceNo = null;
    let refundResponseCode = "000";
    let refundError = null;

    let walletRefundAmt = 0;
    let gatewayRefundAmt = 0;
    let walletRefundStatus = "NONE";
    let gatewayRefundStatus = "NONE";
    let walletBalanceBefore = 0;
    let walletBalanceAfter = 0;

    try {
      const currentWallet = await walletService.getWalletDetails(userId);
      walletBalanceBefore = parseFloat(currentWallet.balance || 0);
    } catch (balErr) {
      console.error("❌ Failed to fetch pre-refund wallet balance:", balErr.message);
    }

    let walletRefundPayload = null;
    let walletRefundResponse = null;
    let iciciRefundPayload = null;
    let iciciRefundResponse = null;
    let cashfreeRefundPayload = null;
    let cashfreeRefundResponse = null;
    let instamojoRefundPayload = null;
    let instamojoRefundResponse = null;

    try {
      if (paymentType === "WALLET") {
        const refundAmt = payment.amount || order.grand_total;
        walletRefundAmt = parseFloat(refundAmt);
        walletRefundStatus = "SUCCESS";
        gatewayRefundStatus = "NONE";

        walletRefundPayload = {
          order_id: order.order_id,
          payment_id: payment.payment_id,
          cancellation_id: order.order_id,
          refund_method: "WALLET",
          refund_amount: refundAmt
        };
        // Automatically refund full amount to Wallet
        walletRefundResponse = await walletService.processRefund(userId, walletRefundPayload, connection);
        
        refundStatus = "REFUNDED";
        refundResponseCode = "000";
      } else if (paymentType === "MIXED") {
        if (refundMethodInput === "WALLET") {
          const refundAmt = payment.amount || order.grand_total;
          walletRefundAmt = parseFloat(refundAmt);
          walletRefundStatus = "SUCCESS";
          gatewayRefundStatus = "NONE";

          walletRefundPayload = {
            order_id: order.order_id,
            payment_id: payment.payment_id,
            cancellation_id: order.order_id,
            refund_method: "WALLET",
            refund_amount: refundAmt
          };
          // Refund entire split amount to store wallet
          walletRefundResponse = await walletService.processRefund(userId, walletRefundPayload, connection);
          
          refundStatus = "REFUNDED";
          refundResponseCode = "000";
        } else {
          const refundAmt = payment.amount || order.grand_total;
          walletRefundAmt = parseFloat(payment.wallet_amount || 0);
          gatewayRefundAmt = parseFloat(payment.gateway_amount || 0);
          walletRefundStatus = "SUCCESS";
          gatewayRefundStatus = "PROCESSING";

          // SPLIT refund: wallet portion -> wallet, gateway portion -> bank/gateway
          // 1. Refund wallet portion
          walletRefundPayload = {
            order_id: order.order_id,
            payment_id: payment.payment_id,
            cancellation_id: order.order_id,
            refund_method: "SPLIT",
            refund_amount: refundAmt,
            wallet_refund_amount: payment.wallet_amount,
            gateway_refund_amount: payment.gateway_amount
          };
          walletRefundResponse = await walletService.processRefund(userId, walletRefundPayload, connection);
          
          // 2. Call gateway refund
          try {
            if (payment.gateway_name === 'CASHFREE') {
              const CashfreePaymentService = require("../../services/cashfreePayment.service");
              cashfreeRefundPayload = {
                merchantOrderId: payment.merchant_txn_no,
                amount: payment.gateway_amount,
                refundId: refundTxnNo
              };
              const refundRes = await CashfreePaymentService.refundCashfree(cashfreeRefundPayload);
              cashfreeRefundResponse = refundRes;

              gatewayRefundId = refundRes?.rawResponse?.refund_id || refundTxnNo;
              refundReferenceNo = refundTxnNo;
              refundResponseCode = refundRes?.rawResponse?.refund_status || null;

              if (refundRes && refundRes.success) {
                refundStatus = "REFUNDED";
                gatewayRefundStatus = "SUCCESS";
              } else {
                refundStatus = "FAILED";
                gatewayRefundStatus = "FAILED";
                refundError = refundRes?.rawResponse?.message || refundRes?.refund_status || "Cashfree split refund failed.";
              }
            } else if (payment.gateway_name === 'INSTAMOJO') {
              const InstamojoPaymentService = require("../../services/instamojoPayment.service");
              const instamojoRefundPayload = {
                paymentId: payment.transaction_id,
                amount: payment.gateway_amount,
                refundNote: "Customer Cancellation",
                refundId: refundTxnNo
              };
              const refundRes = await InstamojoPaymentService.refundInstamojo(instamojoRefundPayload);
              instamojoRefundResponse = refundRes;

              gatewayRefundId = refundRes?.rawResponse?.refund?.id || refundRes?.refund_id || refundTxnNo;
              refundReferenceNo = refundTxnNo;
              refundResponseCode = refundRes?.rawResponse?.refund?.status || null;

              if (refundRes && refundRes.success) {
                refundStatus = "REFUNDED";
                gatewayRefundStatus = "SUCCESS";
              } else {
                refundStatus = "FAILED";
                gatewayRefundStatus = "FAILED";
                refundError = refundRes?.error || "Instamojo split refund failed.";
              }
            } else {
              iciciRefundPayload = {
                refundTxnNo,
                originalTxnId: payment.transaction_id,
                amount: payment.gateway_amount
              };
              const refundRes = await iciciService.initiateRefund(iciciRefundPayload);
              iciciRefundResponse = refundRes;

              gatewayRefundId = refundRes?.txnID || refundRes?.txnAuthID || refundRes?.gatewayRefundID || refundRes?.refundId || null;
              refundReferenceNo = refundRes?.merchantTxnNo || null;
              refundResponseCode = refundRes?.responseCode || null;

              const isSuccess = refundRes && (
                refundRes.responseCode === "000" ||
                refundRes.responseCode === "R1000" ||
                refundRes.status === "success" ||
                refundRes.success === true
              );
              if (isSuccess) {
                refundStatus = "REFUNDED";
                gatewayRefundStatus = "SUCCESS";
              } else {
                refundStatus = "FAILED";
                gatewayRefundStatus = "FAILED";
                refundError = refundRes?.respDescription || "Refund request rejected by gateway.";
              }
            }
          } catch (refundErr) {
            refundStatus = "FAILED";
            gatewayRefundStatus = "FAILED";
            refundError = refundErr.message;
            console.error("❌ Gateway split refund failed:", refundErr.message);
          }
        }
      } else {
        // GATEWAY payment
        const refundAmt = payment.amount || order.grand_total;
        
        if (payment.gateway_name === 'CASHFREE') {
          console.log("======================================");
          console.log("CASHFREE REFUND REQUEST");
          console.log("======================================");
          console.log("Order Number\n" + order.order_number);
          console.log("Payment ID\n" + payment.gateway_payment_id);
          console.log("Gateway\nCashfree");
          console.log("Refund Method\n" + (refundMethodInput === "WALLET" ? "Wallet" : "Original Payment Method"));
          console.log("Refund Amount\n" + refundAmt);
          console.log("======================================");
        }

        if (refundMethodInput === "WALLET") {
          if (payment.gateway_name === 'CASHFREE') {
             console.log("======================================");
             console.log("WALLET REFUND");
             console.log("Wallet Credited\nAmount\n" + refundAmt + "\nCustomer\n" + userId);
             console.log("======================================");
          }
          const refundAmtWallet = payment.amount || order.grand_total;
          walletRefundAmt = parseFloat(refundAmt);
          walletRefundStatus = "SUCCESS";
          gatewayRefundStatus = "NONE";

          walletRefundPayload = {
            order_id: order.order_id,
            payment_id: payment.payment_id,
            cancellation_id: order.order_id,
            refund_method: "WALLET",
            refund_amount: refundAmt,
            wallet_refund_amount: refundAmt
          };
          // Refund entire amount to Wallet
          walletRefundResponse = await walletService.processRefund(userId, walletRefundPayload, connection);
          
          refundStatus = "REFUNDED";
          refundResponseCode = "000";
        } else {
          const refundAmt = payment.amount || order.grand_total;
          gatewayRefundAmt = parseFloat(refundAmt);
          walletRefundStatus = "NONE";
          gatewayRefundStatus = "PROCESSING";

          // Refund to original payment method (Bank/Gateway)
          try {
            if (payment.gateway_name === 'CASHFREE') {
              cashfreeRefundPayload = {
                merchantOrderId: payment.merchant_txn_no,
                amount: refundAmt,
                refundId: refundTxnNo
              };
              
              const refundRes = await CashfreePaymentService.refundCashfree(cashfreeRefundPayload);
              cashfreeRefundResponse = refundRes;
              
              gatewayRefundId = refundRes?.rawResponse?.refund_id || refundTxnNo;
              refundReferenceNo = refundTxnNo;
              refundResponseCode = refundRes?.rawResponse?.refund_status || null;
              
              if (refundRes && refundRes.success) {
                refundStatus = "REFUNDED";
                gatewayRefundStatus = "SUCCESS";
                
                console.log("======================================");
                console.log("CASHFREE REFUND RESPONSE");
                console.log("Refund ID\n" + gatewayRefundId);
                console.log("Refund Status\n" + refundStatus);
                console.log("Gateway Response\n" + JSON.stringify(refundRes.rawResponse));
                console.log("======================================");
              } else {
                refundStatus = "FAILED";
                gatewayRefundStatus = "FAILED";
                refundError = refundRes?.rawResponse?.message || refundRes?.refund_status || "Cashfree refund failed.";
                
                console.log("======================================");
                console.log("CASHFREE REFUND FAILED");
                console.log("Reason\n" + refundError);
                console.log("API Response\n" + JSON.stringify(refundRes.rawResponse || {}));
                console.log("======================================");
              }
            } else if (payment.gateway_name === 'INSTAMOJO') {
              const InstamojoPaymentService = require("../../services/instamojoPayment.service");
              instamojoRefundPayload = {
                paymentId: payment.transaction_id,
                amount: refundAmt,
                refundNote: "Customer Cancellation",
                refundId: refundTxnNo
              };
              const refundRes = await InstamojoPaymentService.refundInstamojo(instamojoRefundPayload);
              instamojoRefundResponse = refundRes;

              gatewayRefundId = refundRes?.rawResponse?.refund?.id || refundRes?.refund_id || refundTxnNo;
              refundReferenceNo = refundTxnNo;
              refundResponseCode = refundRes?.rawResponse?.refund?.status || null;

              if (refundRes && refundRes.success) {
                refundStatus = "REFUNDED";
                gatewayRefundStatus = "SUCCESS";
              } else {
                refundStatus = "FAILED";
                gatewayRefundStatus = "FAILED";
                refundError = refundRes?.error || "Instamojo refund failed.";
              }
            } else {
              iciciRefundPayload = {
                refundTxnNo,
                originalTxnId: payment.transaction_id,
                amount: refundAmt
              };
              const refundRes = await iciciService.initiateRefund(iciciRefundPayload);
              iciciRefundResponse = refundRes;
  
              gatewayRefundId = refundRes?.txnID || refundRes?.txnAuthID || refundRes?.gatewayRefundID || refundRes?.refundId || null;
              refundReferenceNo = refundRes?.merchantTxnNo || null;
              refundResponseCode = refundRes?.responseCode || null;
  
              const isSuccess = refundRes && (
                refundRes.responseCode === "000" ||
                refundRes.responseCode === "R1000" ||
                refundRes.status === "success" ||
                refundRes.success === true
              );
              if (isSuccess) {
                refundStatus = "REFUNDED";
                gatewayRefundStatus = "SUCCESS";
              } else {
                refundStatus = "FAILED";
                gatewayRefundStatus = "FAILED";
                refundError = refundRes?.respDescription || "Refund request rejected by gateway.";
              }
            }
          } catch (refundErr) {
            refundStatus = "FAILED";
            gatewayRefundStatus = "FAILED";
            refundError = refundErr.message;
            console.error("❌ Gateway refund failed:", refundErr.message);
          }
        }
      }
    } catch (err) {
      refundStatus = "FAILED";
      refundError = err.message;
      console.error("❌ Refund processing failed:", err.message);
    }

    try {
      if (walletRefundResponse && walletRefundResponse.balance !== undefined) {
        walletBalanceAfter = parseFloat(walletRefundResponse.balance || 0);
      } else {
        const postWallet = await walletService.getWalletDetails(userId);
        walletBalanceAfter = parseFloat(postWallet.balance || 0);
      }
    } catch (postErr) {
      console.error("❌ Failed to fetch post-refund wallet balance:", postErr.message);
    }

    // Comprehensive logs for any refund type matching exactly user requirements
    console.log("==================================================");
    console.log("Refund Started");
    console.log(`Order Number: ${order.order_number || order.order_id}`);
    console.log(`Payment Type: ${paymentType}`);
    console.log(`Refund Method: ${refundMethodInput}`);
    console.log(`Wallet Contribution: ₹${parseFloat(payment.wallet_amount || 0).toFixed(2)}`);
    console.log(`Gateway Contribution: ₹${parseFloat(payment.gateway_amount || 0).toFixed(2)}`);
    console.log(`Total Refund Amount: ₹${parseFloat(payment.amount || 0).toFixed(2)}`);
    
    if (walletRefundPayload) {
      console.log("==================================================");
      console.log("Wallet Refund");
      console.log(`Wallet Refund URL: Internal Service Call (walletService.processRefund)`);
      console.log(`Request Payload: \n${JSON.stringify(walletRefundPayload, null, 2)}`);
      console.log(`HTTP Status: 200 OK (Internal DB Tx)`);
      console.log(`Complete Response Body: \n${JSON.stringify(walletRefundResponse, null, 2)}`);
      console.log(`Wallet Balance Before: ₹${walletBalanceBefore.toFixed(2)}`);
      console.log(`Wallet Balance After: ₹${walletBalanceAfter.toFixed(2)}`);
    }

    if (iciciRefundPayload) {
      console.log("==================================================");
      console.log("ICICI Refund");
      console.log(`ICICI Refund URL: ${process.env.ICICI_COMMAND_URL || 'N/A'}`);
      console.log(`Request Payload: \n${JSON.stringify(iciciRefundPayload, null, 2)}`);
      console.log(`HTTP Status: ${iciciRefundResponse ? '200 OK' : 'FAILED'}`);
      console.log(`Complete Response Body: \n${JSON.stringify(iciciRefundResponse || { error: refundError }, null, 2)}`);
      console.log(`Refund Reference Number: ${refundReferenceNo || 'N/A'}`);
      console.log(`Refund Status: ${gatewayRefundStatus}`);
      console.log(`Gateway Transaction ID: ${gatewayRefundId || 'N/A'}`);
    }

    if (cashfreeRefundPayload) {
      console.log("======================================");
      console.log("REFUND SUCCESS");
      console.log("======================================");
      console.log(`Refund Id :\n${gatewayRefundId || 'N/A'}`);
      console.log(`Order :\n${cashfreeRefundPayload.merchantOrderId}`);
      console.log(`Amount :\n${cashfreeRefundPayload.amount}`);
      console.log("======================================");
    }

    if (instamojoRefundPayload) {
      const InstamojoPaymentService = require("../../services/instamojoPayment.service");
      console.log("==================================================");
      console.log("INSTAMOJO REFUND");
      console.log(`Instamojo Refund URL: ${InstamojoPaymentService.getBaseUrl()}/refunds/`);
      console.log(`Request Payload: \n${JSON.stringify(instamojoRefundPayload, null, 2)}`);
      console.log(`HTTP Status: ${instamojoRefundResponse ? '200 OK' : 'FAILED'}`);
      console.log(`Complete Response Body: \n${JSON.stringify(instamojoRefundResponse || { error: refundError }, null, 2)}`);
      console.log(`Refund Reference Number: ${refundReferenceNo || 'N/A'}`);
      console.log(`Refund Status: ${gatewayRefundStatus}`);
      console.log(`Gateway Transaction ID: ${gatewayRefundId || 'N/A'}`);
    }

    console.log("==================================================");
    console.log("Final Refund Status");
    console.log(refundStatus === "REFUNDED" ? "SUCCESS" : "FAILED");
    console.log("=========================================================");

    const refundedAt = refundStatus === "REFUNDED" ? new Date() : null;
    const finalCancellationStatus = refundStatus === "REFUNDED" ? "CANCELLED" : "FAILED";

    // Update cancellation & refund results in order_cancellations
    await connection.query(`
      UPDATE order_cancellations 
      SET cancellation_status = ?, refund_status = ?, gateway_refund_id = ?, refund_reference_no = ?, refund_response_code = ?, refund_error = ?, refunded_at = ?, cancelled_at = NOW(), updated_at = NOW()
      WHERE order_id = ?
    `, [
      finalCancellationStatus,
      refundStatus,
      gatewayRefundId,
      refundReferenceNo,
      refundResponseCode,
      refundError,
      refundedAt,
      order.order_id
    ]);

// Update payments table with refund details
    if (gatewayRefundId) {
      await connection.query(`
        UPDATE payments 
        SET refund_id = ?, refund_status = ?, gateway_response = ?, response_code = ?, response_description = ?
        WHERE transaction_id = ? OR gateway_payment_id = ?
      `, [
        gatewayRefundId, 
        refundStatus === "REFUNDED" ? "SUCCESS" : (refundStatus === "FAILED" ? "FAILED" : "PENDING"), 
        JSON.stringify(cashfreeRefundResponse?.rawResponse || iciciRefundResponse || {}),
        refundResponseCode, 
        refundError,
        payment.transaction_id,
        payment.gateway_payment_id
      ]);
    }

    if (refundStatus === "FAILED") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Shipment cancelled, but payment gateway refund failed: ${refundError || "Unknown gateway error"}`
      });
    }

    // Update order status to CANCELLED in orders table
    await connection.query(
      "UPDATE orders SET order_status = 'CANCELLED', updated_at = NOW() WHERE order_id = ?",
      [order.order_id]
    );

    // Update shipment details status to CANCELLED if exists
    await connection.query(
      "UPDATE shipment_details SET shipment_status = 'CANCELLED', updated_at = NOW() WHERE order_id = ?",
      [order.order_id]
    );

    // Insert history timeline entry
    await connection.query(
      "INSERT INTO order_status_history (order_id, status, remarks, created_at) VALUES (?, 'CANCELLED', 'Order cancelled by customer. Refund initiated successfully.', NOW())",
      [order.order_id]
    );

    // Restock Inventory
    const [orderItems] = await connection.query("SELECT product_id, quantity, selected_length FROM order_items WHERE order_id = ?", [order.order_id]);
    for (const item of orderItems) {
      const [productStockData] = await connection.query("SELECT stock_quantity, stock_unit FROM product_master WHERE pro_id = ?", [item.product_id]);
      if (productStockData.length > 0) {
        const stockUnit = productStockData[0].stock_unit;
        const restoreAmt = stockUnit === 'METER' ? item.quantity * parseFloat(item.selected_length || "1") : item.quantity;
        await connection.query("UPDATE product_master SET stock_quantity = stock_quantity + ? WHERE pro_id = ?", [restoreAmt, item.product_id]);
      }
    }

    await connection.commit();

    // Send customer email safely
    try {
      const emailService = require("../../services/email.service");
      const [userRows] = await ConnectDB.query("SELECT email FROM users WHERE user_id = ?", [order.user_id]);
      const email = userRows[0]?.email;
      if (email) {
        const [addressRows] = await ConnectDB.query("SELECT full_name FROM user_addresses WHERE address_id = ?", [order.address_id]);
        const customerName = addressRows[0]?.full_name || "Customer";

        await emailService.sendStatusUpdateEmail({
          toEmail: email,
          orderNumber: order.order_number,
          status: "CANCELLED",
          customerName,
          awbNumber: shipment?.awb_number || null,
          trackingUrl: shipment?.tracking_url || null,
          expectedDelivery: null
        });
      }
    } catch (emailErr) {
      console.error("❌ Failed to send cancel email:", emailErr.message);
    }

    // Send admin cancellation notification email
    try {
      const emailService = require("../../services/email.service");
      if (process.env.ADMIN_EMAIL) {
        const [userRows] = await ConnectDB.query("SELECT email FROM users WHERE user_id = ?", [order.user_id]);
        const [addressRows] = await ConnectDB.query("SELECT full_name FROM user_addresses WHERE address_id = ?", [order.address_id]);
        await emailService.sendAdminOrderCancelledEmail({
          orderNumber: order.order_number,
          customerName: addressRows[0]?.full_name || "Customer",
          customerEmail: userRows[0]?.email || "N/A",
          grandTotal: order.grand_total,
          refundAmount: payment.amount,
          refundMethod: refundMethodInput,
          paymentMethod: payment.gateway_name || payment.payment_method || "N/A",
          cancellationReason: cancellation_reason || "No reason provided"
        });
        console.log(` [EMAIL] Admin cancellation notification sent for ${order.order_number}`);
      }
    } catch (adminEmailErr) {
      console.error("❌ Failed to send admin cancel notification:", adminEmailErr.message);
    }


    return res.status(200).json({
      success: true,
      message: "Your order has been cancelled successfully. Your refund has been initiated.",
      cancellation: {
        cancellation_status: "CANCELLED",
        refund_status: "REFUNDED",
        refund_amount: payment.amount
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ cancelOrder error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  } finally {
    connection.release();
  }
};

const cancellationPreview = async (req, res) => {
  const connection = await ConnectDB.getConnection();
  try {
    const userId = req.user.userId || req.user.user_id;
    const { orderNumber } = req.params;

    console.log("========================================");
    console.log("[CANCEL PREVIEW] Endpoint reached");
    console.log("[CANCEL PREVIEW] Order:", orderNumber);
    console.log("========================================");

    const isNumeric = /^\d+$/.test(orderNumber);
    const queryStr = isNumeric
      ? "SELECT * FROM orders WHERE order_id = ?"
      : "SELECT * FROM orders WHERE order_number = ?";

    const [orders] = await connection.query(queryStr, [orderNumber]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const order = orders[0];

    // Ownership check
    if (order.user_id !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized to cancel this order." });
    }

    // Check if already cancelled
    if (order.order_status === "CANCELLED") {
      return res.status(400).json({ success: false, message: "Order is already cancelled." });
    }

    // Load shipment details
    const [shipmentRows] = await connection.query(
      "SELECT * FROM shipment_details WHERE order_id = ?",
      [order.order_id]
    );
    const shipment = shipmentRows[0];

    // Verify cancellation eligibility
    let latestStatus = order.order_status;
    const ShippingFactory = require("../../services/shipping/ShippingFactory");

    if (shipment && shipment.awb_number) {
      try {
        const providerName = shipment.shipping_provider || "DELHIVERY";
        const provider = ShippingFactory.getProvider(providerName);
        const trackingResult = await provider.getShipmentStatus(shipment.awb_number, order.order_number);
        if (trackingResult && trackingResult.success) {
          latestStatus = provider.normalizeStatus(trackingResult.raw_status);
        } else {
          throw new Error(`${providerName} tracking fetch returned failure status`);
        }
      } catch (trackErr) {
        console.error(`❌ [${shipment.shipping_provider || "DELHIVERY"} Cancel Sync] Tracking fetch failed:`, trackErr.message);
        return res.status(400).json({
          success: false,
          code: "TRACKING_STATUS_CHECK_FAILED",
          message: "We could not verify the latest shipment status. Please try again."
        });
      }
    }

    const allowedStatuses = ["ORDER_PLACED", "SELLER_PREPARING", "PENDING", "SHIPMENT_CREATED", "PICKUP_PENDING", "MANIFEST_GENERATED", "WAREHOUSE", "SHIPMENT CREATED", "PICKUP PENDING", "MANIFEST GENERATED", "CREATED", "AWB_ASSIGNED", "READY_FOR_PICKUP", "PICKUP_REQUESTED", "NOT_PICKED"];
    const normalized = latestStatus.toUpperCase().replace(/_/g, " ").trim();
    const isAllowed = allowedStatuses.some(status => normalized === status.toUpperCase().replace(/_/g, " ").trim());

    if (!isAllowed) {
      return res.status(400).json({
        success: false,
        code: "ORDER_NOT_CANCELLABLE",
        currentStatus: latestStatus,
        message: `This order can no longer be cancelled because the shipment is already ${latestStatus.replace(/_/g, ' ').toLowerCase()}.`
      });
    }

    // Load successful payment details
    const [payments] = await connection.query(
      "SELECT * FROM payments WHERE order_id = ? AND payment_status = 'Success' LIMIT 1",
      [order.order_id]
    );

    if (payments.length === 0) {
      return res.status(400).json({ success: false, message: "No successful payment transaction found for this order." });
    }
    const payment = payments[0];

    let paymentType = "GATEWAY";
    if (parseFloat(payment.wallet_amount || 0) > 0 && parseFloat(payment.gateway_amount || 0) > 0) {
      paymentType = "MIXED";
    } else if (payment.payment_method === "WALLET" || payment.gateway_name === "WALLET") {
      paymentType = "WALLET";
    } else if (payment.payment_type) {
      paymentType = payment.payment_type;
    }

    // Normalizing MIXED to SPLIT for the frontend explicitly
    if (paymentType === "MIXED") {
      paymentType = "SPLIT";
    }

    return res.status(200).json({
      success: true,
      canCancel: true,
      paymentType: paymentType,
      walletAmount: parseFloat(payment.wallet_amount || 0),
      gatewayAmount: parseFloat(payment.gateway_amount || 0),
      totalAmount: parseFloat(payment.amount)
    });

  } catch (error) {
    console.error("❌ cancellationPreview error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  } finally {
    connection.release();
  }
};

module.exports = {
  cancelOrder,
  cancellationPreview
};
