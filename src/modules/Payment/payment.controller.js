const ConnectDB = require("../../config/db");
const IciciPaymentService = require("../../services/iciciPayment.service");
const CashfreePaymentService = require("../../services/cashfreePayment.service");
const InstamojoPaymentService = require("../../services/instamojoPayment.service");
const walletRepository = require("../Wallet/wallet.repository");
const walletService = require("../Wallet/wallet.service");
const { calculateOrderSummary } = require("../../utils/pricing");
// Converts ICICI's YYYYMMDDHHMMSS string into a MySQL DATETIME string
const parseIciciDateTime = (str) => {
  if (!str || String(str).length < 14) return null;
  const s = String(str);
  return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)} ${s.substring(8, 10)}:${s.substring(10, 12)}:${s.substring(12, 14)}`;
};

// 1. INITIATE PAYMENT SESSION
const initiatePayment = async (req, res) => {
  const connection = await ConnectDB.getConnection();
  try {
    const userId = req.user ? (req.user.userId || req.user.user_id) : null;
    const { address_id, payment_method, use_wallet, guest_data, cart_items } = req.body;

    if (userId && !address_id) {
      return res.status(400).json({ success: false, message: "Address ID is required." });
    }
    if (!userId && !guest_data) {
      return res.status(400).json({ success: false, message: "Guest details are required." });
    }
    if (!payment_method) {
      return res.status(400).json({ success: false, message: "Payment method is required." });
    }

    let cartItems = [];

    // Fetch active cart items of the user
    if (userId) {
      const [rows] = await connection.query(`
        SELECT c.*, pm.price, pm.pro_name, pm.is_deleted, pm.stock_quantity, pm.stock_unit, pm.stitching_price
        FROM cart c
        INNER JOIN product_master pm ON c.pro_id = pm.pro_id
        WHERE c.user_id = ?
      `, [userId]);
      cartItems = rows;
    } else {
      if (!cart_items || cart_items.length === 0) {
        return res.status(400).json({ success: false, message: "Cart items are required for guest checkout." });
      }
      const proIds = cart_items.map(i => i.pro_id);
      const [products] = await connection.query(`
        SELECT pro_id, price, pro_name, is_deleted, stock_quantity, stock_unit, stitching_price
        FROM product_master 
        WHERE pro_id IN (?)
      `, [proIds]);
      const productMap = {};
      products.forEach(p => productMap[p.pro_id] = p);

      cartItems = cart_items.map(item => {
        const dbProduct = productMap[item.pro_id];
        return {
          ...item,
          price: dbProduct ? dbProduct.price : null,
          pro_name: dbProduct ? dbProduct.pro_name : null,
          is_deleted: dbProduct ? dbProduct.is_deleted : 1,
          stock_quantity: dbProduct ? dbProduct.stock_quantity : 0,
          stock_unit: dbProduct ? dbProduct.stock_unit : 'PCS',
          stitching_price: dbProduct ? dbProduct.stitching_price : null
        };
      });
    }

    if (cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty." });
    }

    for (const item of cartItems) {
      if (item.price === undefined || item.price === null || item.is_deleted === 1) {
        return res.status(400).json({
          success: false,
          message: `Product "${item.pro_name || item.pro_id}" is inactive, deleted, or missing a valid price.`
        });
      }

      // Stock Validation
      const reqAmt = item.stock_unit === 'METER' ? item.quantity * parseFloat(item.selected_meter || "1") : item.quantity;
      if (reqAmt > (item.stock_quantity || 0)) {
        return res.status(400).json({
          success: false,
          message: "The stock has changed. Please update your cart.",
          error: `Insufficient stock for ${item.pro_name}. Available: ${item.stock_quantity}`
        });
      }
    }

    const { subtotal, stitching: stitching_amount, shipping, grandTotal: grand_total } = calculateOrderSummary(cartItems);
    const gst_amount = 0;
    const shipping_amount = shipping === "FREE" ? 0 : shipping;

    // Determine Wallet vs Gateway vs Mixed Payment
    let paymentType = "GATEWAY";
    let walletAmount = 0.00;
    let gatewayAmount = grand_total;

    if (userId) {
      const wallet = await walletRepository.findWalletByUserId(userId, connection);
      const walletBalance = wallet && wallet.status === "ACTIVE" ? parseFloat(wallet.balance) : 0.00;

      if (use_wallet || payment_method === "wallet") {
        if (walletBalance >= grand_total) {
          paymentType = "WALLET";
          walletAmount = grand_total;
          gatewayAmount = 0.00;
        } else {
          return res.status(400).json({ success: false, message: "Insufficient wallet balance." });
        }
      }
    } else {
      if (use_wallet || payment_method === "wallet") {
        return res.status(400).json({ success: false, message: "Wallet payment is not available for guests." });
      }
    }

    const merchantOrderId = `MREF_${Date.now()}`;

    // Safely add guest_data column if it doesn't exist
    try {
      await connection.query("ALTER TABLE payment_sessions ADD COLUMN guest_data JSON DEFAULT NULL");
    } catch (e) { }
    try {
      await connection.query("ALTER TABLE payment_sessions MODIFY user_id INT NULL");
      await connection.query("ALTER TABLE payment_sessions MODIFY address_id INT NULL");
    } catch (e) { }

    const safeUserId = userId || null;
    const safeAddressId = address_id || null;
    const safeGuestData = guest_data ? JSON.stringify({ guest_data, cart_items: cartItems }) : null;

    // Create session record with wallet fields
    await connection.query(`
      INSERT INTO payment_sessions (merchant_order_id, user_id, address_id, payment_method, amount, status, payment_type, wallet_amount, gateway_amount, guest_data)
      VALUES (?, ?, ?, ?, ?, 'Initiated', ?, ?, ?, ?)
    `, [merchantOrderId, safeUserId, safeAddressId, payment_method, grand_total, paymentType, walletAmount, gatewayAmount, safeGuestData]);

    console.log(` [WALLET-CHECKOUT] Initiated - Ref: ${merchantOrderId}, Type: ${paymentType}, Wallet: ₹${walletAmount}, Gateway: ₹${gatewayAmount}`);

    // Scenario A: FULL WALLET PAYMENT
    if (paymentType === "WALLET") {
      await connection.beginTransaction();

      try {
        // Deduct wallet balance (inside this transaction — rolls back automatically if anything below fails)
        await walletService.debitPayment(userId, grand_total, null, connection);

        // Generate Standard Incrementing Order Number FL2026XXXXX
        const [lastOrder] = await connection.query(
          "SELECT order_number FROM orders ORDER BY order_id DESC LIMIT 1 FOR UPDATE"
        );
        let nextNum = 1;
        if (lastOrder.length > 0) {
          const lastNumStr = lastOrder[0].order_number.replace("FL2026", "");
          const lastNum = parseInt(lastNumStr, 10);
          if (!isNaN(lastNum)) {
            nextNum = lastNum + 1;
          }
        }
        const order_number = `FL2026${String(nextNum).padStart(5, "0")}`;

        // Create Order Record
        const [orderResult] = await connection.query(`
          INSERT INTO orders (
            order_number, user_id, address_id, subtotal, gst_amount, stitching_amount, shipping_amount, grand_total, payment_status, order_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Paid', 'ORDER_PLACED', NOW(), NOW())
        `, [order_number, userId, address_id, subtotal, gst_amount, stitching_amount, shipping_amount, grand_total]);
        const order_id = orderResult.insertId;

        // Create Order Items
        for (const item of cartItems) {
          const custom_measurement = item.is_custom
            ? JSON.stringify({
              chest: item.custom_chest,
              length: item.custom_length,
              shoulder: item.custom_shoulder,
              sleeve: item.custom_sleeve,
              waist: item.custom_waist,
              inseam: item.custom_inseam,
              hip: item.custom_hip,
              thigh: item.custom_thigh,
              knee: item.custom_knee,
              leg_opening: item.custom_leg_opening
            })
            : null;

          const [orderItemResult] = await connection.query(`
            INSERT INTO order_items (
              order_id, product_id, product_name, product_image, price, quantity, fit_style, selected_sleeve, selected_size, selected_length, custom_measurement, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `, [
            order_id,
            item.pro_id,
            item.pro_name,
            item.pro_img,
            item.stock_unit === 'METER' ? Number(item.price || 0) * Number(item.selected_meter || 1) : item.price,
            item.quantity,
            item.fit_style || null,
            item.selected_sleeve || null,
            item.selected_size || null,
            item.selected_meter ? String(item.selected_meter) : null,
            custom_measurement
          ]);
          const order_item_id = orderItemResult.insertId;

          if (item.monogram_enabled) {
            await connection.query(`
              INSERT INTO order_monograms (
                order_item_id, monogram_text, placement_id, color_id, font_id, price, upload_file, upload_file_type, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
              order_item_id,
              item.monogram_text || null,
              item.monogram_placement_id || null,
              item.monogram_color_id || null,
              item.monogram_font_id || null,
              item.monogram_price,
              item.monogram_upload_file || null,
              item.monogram_upload_file_type || null
            ]);
          }

          // DEDUCT STOCK
          const [productStockData] = await connection.query("SELECT stock_quantity, stock_unit FROM product_master WHERE pro_id = ?", [item.pro_id]);
          if (productStockData.length > 0) {
            const stockUnit = productStockData[0].stock_unit;
            const deductAmt = stockUnit === 'METER' ? item.quantity * parseFloat(item.selected_meter || "1") : item.quantity;
            await connection.query("UPDATE product_master SET stock_quantity = GREATEST(0, stock_quantity - ?) WHERE pro_id = ?", [deductAmt, item.pro_id]);
          }
        }

        // Save Payment details
        await connection.query(`
          INSERT INTO payments (
            order_id, user_id, gateway_name, transaction_id, gateway_payment_id, merchant_txn_no, merchant_id,
            aggregator_id, bank_name, payment_method, payment_mode, payment_inst_id, card_network, acquirer_name,
            response_code, response_description, gateway_payment_datetime, amount, wallet_amount, gateway_amount, currency, payment_status, paid_at, created_at
          ) VALUES (?, ?, 'WALLET', ?, null, ?, null, null, null, 'WALLET', 'WALLET', null, null, null, '00', 'Paid via Wallet', NOW(), ?, ?, 0.00, 'INR', 'Success', NOW(), NOW())
        `, [
          order_id,
          userId,
          `WALT-${Date.now()}`,
          merchantOrderId,
          grand_total,
          grand_total
        ]);

        // Save Order Status History
        await connection.query(`
          INSERT INTO order_status_history (
            order_id, status, remarks, created_at
          ) VALUES (?, 'ORDER_PLACED', 'Order placed successfully using Wallet Balance', NOW())
        `, [order_id]);

        // Save Shipment Details (Pending)
        const expected_delivery = new Date();
        expected_delivery.setDate(expected_delivery.getDate() + 5);

        await connection.query(`
          INSERT INTO shipment_details (
            order_id, shipment_status, expected_delivery, created_at
          ) VALUES (?, 'Pending', ?, NOW())
        `, [order_id, expected_delivery]);

        // Clear Cart
        await connection.query("DELETE FROM cart WHERE user_id = ?", [userId]);

        // Update Session
        await connection.query(`
          UPDATE payment_sessions
          SET status = 'Success', order_number = ?, payment_status = 'Success'
          WHERE merchant_order_id = ?
        `, [order_number, merchantOrderId]);

        await connection.commit();

        // Trigger confirmation emails asynchronously
        const emailService = require("../../services/email.service");
        const invoiceService = require("../../services/invoice.service");

        setTimeout(async () => {
          try {
            const orderData = await emailService.getOrderDataForEmail(order_id);
            if (orderData) {
              let invoiceBuffer = null;
              try {
                invoiceBuffer = await invoiceService.generateInvoicePdf(orderData);
              } catch (pdfErr) {
                console.error("❌ [EMAIL] Invoice PDF generation failed:", pdfErr.message);
              }

              // Send Customer Confirmation Email
              if (orderData.customer_email) {
                try {
                  await emailService.sendOrderConfirmationEmail(orderData, invoiceBuffer);
                  console.log(` [EMAIL] Customer confirmation email sent for ${orderData.order_number}`);
                } catch (custErr) {
                  console.error("❌ [EMAIL] Customer confirmation email failed:", custErr.message);
                }
              }

              // Send Admin New Order Notification Email
              try {
                if (process.env.ADMIN_EMAIL) {
                  await emailService.sendAdminNewOrderEmail(orderData);
                  console.log(` [EMAIL] Admin notification email sent for ${orderData.order_number}`);
                }
              } catch (adminErr) {
                console.error("❌ [EMAIL] Admin notification email failed:", adminErr.message);
              }
            }
          } catch (emailErr) {
            console.error("❌ [EMAIL] Full Wallet confirmation failed:", emailErr.message);
          }
        }, 100);

        return res.status(200).json({
          success: true,
          payment_url: `/order-success?orderNumber=${order_number}`,
          message: "Paid via Wallet"
        });

      } catch (walletErr) {
        await connection.rollback();
        throw walletErr;
      }
    }
    const customerEmail = userId ? req.user.email : guest_data.email;
    const customerMobile = userId ? req.user.mobile : guest_data.mobile;
    const customerName = userId ? req.user.name : `${guest_data.firstName} ${guest_data.lastName}`;

    // Call ICICI Gateway for the remaining/gateway portion
    const initiateResult = await IciciPaymentService.initiateSale({
      merchantOrderId,
      amount: gatewayAmount,
      paymentMethod: payment_method,
      userId,
      addressId: address_id,
      customerEmail,
      customerMobile,
      customerName
    });

    if (initiateResult && initiateResult.success && initiateResult.payment_url) {
      return res.status(200).json({
        success: true,
        payment_url: initiateResult.payment_url
      });
    }

    return res.status(500).json({
      success: false,
      message: "Gateway failed to initialize payment redirection."
    });

  } catch (err) {
    console.error("❌ Initiate Payment Error:", err);

    // Detect ICICI gateway down / network errors — return a clean user-friendly message
    const isGatewayDown =
      err.message && (
        err.message.includes("502") ||
        err.message.includes("503") ||
        err.message.includes("504") ||
        err.message.includes("Bad Gateway") ||
        err.message.includes("Service Unavailable") ||
        err.message.includes("ECONNREFUSED") ||
        err.message.includes("ETIMEDOUT") ||
        err.message.includes("TimeoutError") ||
        err.message.includes("abort")
      );

    if (isGatewayDown) {
      return res.status(503).json({
        success: false,
        message: "The payment gateway is temporarily unavailable. Please try again in a few minutes."
      });
    }

    return res.status(500).json({ success: false, message: err.message || "Internal server error." });
  } finally {
    if (connection) connection.release();
  }
};

// 2. SIMULATE SECURE GATEWAY PORTAL (ICICI Simulator Sandbox)
const simulateGateway = async (req, res) => {
  const { merchantOrderId, amount, paymentMethod, userId, addressId } = req.query;

  const checksumParams = {
    merchantId: process.env.ICICI_MERCHANT_ID,
    merchantOrderId,
    amount,
    paymentStatus: "SUCCESS",
    currency: "INR"
  };
  const secretKey = process.env.ICICI_SECRET_KEY;
  const successChecksum = IciciPaymentService.generateChecksum(checksumParams, secretKey);

  const failParams = { ...checksumParams, paymentStatus: "FAILED" };
  const failChecksum = IciciPaymentService.generateChecksum(failParams, secretKey);

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>ICICI Bank Secure Payment Simulator</title>
      <style>
        body {
          background-color: #0b1426;
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
        }
        .card {
          background-color: #102554;
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 32px;
          max-width: 440px;
          width: 100%;
          text-align: center;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }
        .bank-logo {
          font-size: 26px;
          font-weight: bold;
          color: #D4AF37;
          margin-bottom: 24px;
          letter-spacing: 1px;
        }
        .amount {
          font-size: 32px;
          font-weight: bold;
          margin: 16px 0;
          color: #D4AF37;
        }
        .btn {
          background-color: #D4AF37;
          color: #08142c;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: bold;
          cursor: pointer;
          width: 100%;
          font-size: 15px;
          text-transform: uppercase;
          transition: background 0.2s;
          margin-bottom: 12px;
        }
        .btn:hover {
          background-color: #e5c158;
        }
        .btn-fail {
          background-color: transparent;
          color: #e53e3e;
          border: 1px solid #e53e3e;
        }
        .btn-fail:hover {
          background-color: #e53e3e/10;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: #a0aec0;
          margin: 8px 0;
        }
        .info-row strong {
          color: #fff;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="bank-logo">ICICI BANK</div>
        <p style="color: #a0aec0; font-size: 14px; text-transform: uppercase; margin-bottom: 20px;">Secure Gateway Sandbox</p>
        
        <div style="background-color: #0b1426; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
          <div class="info-row">
            <span>Reference ID:</span>
            <strong>${merchantOrderId || 'N/A'}</strong>
          </div>
          <div class="info-row">
            <span>Payment Mode:</span>
            <strong style="text-transform: uppercase;">${paymentMethod || 'UPI'}</strong>
          </div>
          <div class="info-row" style="margin-top: 12px; border-t: 1px solid rgba(255,255,255,0.05); pt: 8px;">
            <span>Amount Payable:</span>
            <strong class="amount">₹${amount || '0.00'}</strong>
          </div>
        </div>

        <form action="/api/payment/callback" method="GET">
          <input type="hidden" name="merchantOrderId" value="${merchantOrderId || ''}">
          <input type="hidden" name="amount" value="${amount || ''}">
          <input type="hidden" name="paymentStatus" value="SUCCESS">
          <input type="hidden" name="checksum" value="${successChecksum}">
          <input type="hidden" name="transactionId" value="txn_icici_${Date.now()}">
          <input type="hidden" name="bankName" value="ICICI_BANK">
          <input type="hidden" name="userId" value="${userId || ''}">
          <input type="hidden" name="addressId" value="${addressId || ''}">
          <input type="hidden" name="paymentMethod" value="${paymentMethod || ''}">
          <button type="submit" class="btn">Authorize & Confirm Payment</button>
        </form>

        <form action="/api/payment/callback" method="GET">
          <input type="hidden" name="merchantOrderId" value="${merchantOrderId || ''}">
          <input type="hidden" name="amount" value="${amount || ''}">
          <input type="hidden" name="paymentStatus" value="FAILED">
          <input type="hidden" name="checksum" value="${failChecksum}">
          <input type="hidden" name="transactionId" value="txn_icici_failed_${Date.now()}">
          <input type="hidden" name="bankName" value="ICICI_BANK">
          <input type="hidden" name="userId" value="${userId || ''}">
          <input type="hidden" name="addressId" value="${addressId || ''}">
          <input type="hidden" name="paymentMethod" value="${paymentMethod || ''}">
          <button type="submit" class="btn btn-fail">Simulate Failed Payment</button>
        </form>
      </div>
    </body>
    </html>
  `;

  res.setHeader("Content-Type", "text/html");
  return res.send(html);
};

// 3. SECURE CALLBACK PROCESSING & ORDER CREATION

// ==========================================
// SHARED ORDER CREATION LOGIC
// ==========================================
async function processSuccessfulOrder(session, paymentDetails, connection, res, isWebhook = false) {
  const {
    gatewayPaymentId, merchantOrderId, merchantId, aggregatorId, bankName,
    finalPaymentMethod, paymentMode, paymentInstId, cardNetwork, acquirerName,
    responseCode, respDescription, gatewayPaymentDateTime, transactionId, gatewayName
  } = paymentDetails;

  let userId = session.user_id;



  let addressId = session.address_id;

  let cartItems = [];
  let isGuest = false;

  // PAYMENT IS VERIFIED SUCCESSFUL -> Proceed to Create Order
  await connection.beginTransaction();

  if (session.guest_data) {
    isGuest = true;
    const guestPayload = typeof session.guest_data === 'string' ? JSON.parse(session.guest_data) : session.guest_data;
    const gData = guestPayload.guest_data;
    cartItems = guestPayload.cart_items;

    // Generate random password
    const crypto = require("crypto");
    const randomPassword = crypto.randomBytes(16).toString("hex");
    const bcrypt = require("bcryptjs");
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(randomPassword, salt);

    const guestName = `${gData.firstName || ""} ${gData.lastName || ""}`.trim() || "Guest";

    // Insert into users
    const [userResult] = await connection.query(`
          INSERT INTO users (name, email, mobile, password, is_active, email_verified, is_registered, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, 1, 0, NOW(), NOW())
        `, [guestName, gData.email, gData.mobile, hashedPassword]);

    userId = userResult.insertId;

    // Automatically create a wallet for the new user
    await connection.query(
      `INSERT INTO wallets (user_id, balance, status, created_at, updated_at) VALUES (?, 0.00, 'ACTIVE', NOW(), NOW())`,
      [userId]
    );

    // Insert into user_addresses
    const [addressResult] = await connection.query(`
          INSERT INTO user_addresses (
            user_id, address_order, full_name, mobile, address_type, postal_code, street_locality, house_building, landmark, city, state, country, is_default, created_at, updated_at
          ) VALUES (?, 1, ?, ?, 'Home', ?, ?, ?, ?, ?, ?, 'India', 1, NOW(), NOW())
        `, [userId, guestName, gData.mobile, gData.postalCode, gData.streetLocality, gData.houseBuilding, gData.landmark || null, gData.city, gData.state]);

    addressId = addressResult.insertId;

  } else {
    // Fetch active cart items from DB
    const [rows] = await connection.query(`
          SELECT c.*, pm.price, pm.pro_name, pm.pro_img, pm.cover_description, pm.stock_unit, pm.stitching_price, pm.stock_quantity
          FROM cart c
          INNER JOIN product_master pm ON c.pro_id = pm.pro_id
          WHERE c.user_id = ?
        `, [userId]);
    cartItems = rows;
  }

  if (cartItems.length === 0) {
    await connection.rollback();
    return isWebhook ? res.status(200).json({ success: true, redirect: `order-summary?error=empty_cart` }) : res.redirect(`${process.env.FRONTEND_URL}/order-summary?error=empty_cart`);
  }

  for (const item of cartItems) {
    if (item.price === undefined || item.price === null || item.is_deleted === 1) {
      await connection.rollback();
      return isWebhook ? res.status(200).json({ success: true, redirect: `order-summary?error=invalid_product` }) : res.redirect(`${process.env.FRONTEND_URL}/order-summary?error=invalid_product`);
    }

    const isMonogramEnabled = item.monogram_enabled || (item.monogram && item.monogram.enabled);
    const mText = item.monogram_text || (item.monogram && item.monogram.text);
    const mPlacement = item.monogram_placement_id || (item.monogram && item.monogram.placement_id);
    const mColor = item.monogram_color_id || (item.monogram && item.monogram.color_id);
    const mFont = item.monogram_font_id || (item.monogram && item.monogram.font_id);
    const mPrice = item.monogram_price || (item.monogram && item.monogram.extra_price);

    const mUploadFile = item.monogram_upload_file || (item.monogram && item.monogram.upload_file);
    const mUploadFileType = item.monogram_upload_file_type || (item.monogram && item.monogram.upload_file_type);

    if (isMonogramEnabled) {
      if (!mUploadFile) {
        if (!mText || mText.length > 4) {
          await connection.rollback();
          return isWebhook ? res.status(200).json({ success: true, redirect: `order-summary?error=invalid_monogram` }) : res.redirect(`${process.env.FRONTEND_URL}/order-summary?error=invalid_monogram`);
        }
        const [[placement]] = await connection.query("SELECT placement_id FROM monogram_placements WHERE placement_id = ?", [mPlacement]);
        const [[color]] = await connection.query("SELECT color_id FROM monogram_colors WHERE color_id = ?", [mColor]);
        const [[font]] = await connection.query("SELECT font_id FROM monogram_fonts WHERE font_id = ?", [mFont]);

        if (!placement || !color || !font) {
          await connection.rollback();
          return isWebhook ? res.status(200).json({ success: true, redirect: `order-summary?error=invalid_monogram` }) : res.redirect(`${process.env.FRONTEND_URL}/order-summary?error=invalid_monogram`);
        }
      }
    }
  }

  // Calculate dynamic totals
  const { subtotal, stitching: stitching_amount, shipping, grandTotal: grand_total } = calculateOrderSummary(cartItems);
  const gst_amount = 0;
  const shipping_amount = shipping === "FREE" ? 0 : shipping;

  // Generate Standard Incrementing Order Number FL2026XXXXX
  const [lastOrder] = await connection.query(
    "SELECT order_number FROM orders ORDER BY order_id DESC LIMIT 1 FOR UPDATE"
  );
  let nextNum = 1;
  if (lastOrder.length > 0) {
    const lastNumStr = lastOrder[0].order_number.replace("FL2026", "");
    const lastNum = parseInt(lastNumStr, 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }
  const order_number = `FL2026${String(nextNum).padStart(5, "0")}`;

  // Create Order Record
  const [orderResult] = await connection.query(`
      INSERT INTO orders (
        order_number, user_id, address_id, subtotal, gst_amount, stitching_amount, shipping_amount, grand_total, payment_status, order_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Paid', 'ORDER_PLACED', NOW(), NOW())
    `, [order_number, userId, addressId, subtotal, gst_amount, stitching_amount, shipping_amount, grand_total]);
  const order_id = orderResult.insertId;

  // Create Order Items
  for (const item of cartItems) {
    const custom_measurement = item.is_custom
      ? JSON.stringify({
        chest: item.custom_chest,
        length: item.custom_length,
        shoulder: item.custom_shoulder,
        sleeve: item.custom_sleeve,
        waist: item.custom_waist,
        inseam: item.custom_inseam,
        hip: item.custom_hip,
        thigh: item.custom_thigh,
        knee: item.custom_knee,
        leg_opening: item.custom_leg_opening
      })
      : null;

    const [orderItemResult] = await connection.query(`
        INSERT INTO order_items (
          order_id, product_id, product_name, product_image, price, quantity, fit_style, selected_sleeve, selected_size, selected_length, custom_measurement, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
      order_id,
      item.pro_id,
      item.pro_name,
      item.pro_img,
      item.stock_unit === 'METER' ? Number(item.price || 0) * Number(item.selected_meter || 1) : item.price,
      item.quantity,
      item.fit_style || null,
      item.selected_sleeve || null,
      item.selected_size || null,
      item.selected_meter ? String(item.selected_meter) : null,
      custom_measurement
    ]);
    const order_item_id = orderItemResult.insertId;

    // DEDUCT STOCK
    const [productStockData] = await connection.query("SELECT stock_quantity, stock_unit FROM product_master WHERE pro_id = ?", [item.pro_id]);
    if (productStockData.length > 0) {
      const stockUnit = productStockData[0].stock_unit;
      const deductAmt = stockUnit === 'METER' ? item.quantity * parseFloat(item.selected_meter || "1") : item.quantity;
      await connection.query("UPDATE product_master SET stock_quantity = GREATEST(0, stock_quantity - ?) WHERE pro_id = ?", [deductAmt, item.pro_id]);
    }

    const isMonogramEnabled = item.monogram_enabled || (item.monogram && item.monogram.enabled);
    const mText = item.monogram_text || (item.monogram && item.monogram.text);
    const mPlacement = item.monogram_placement_id || (item.monogram && item.monogram.placement_id);
    const mColor = item.monogram_color_id || (item.monogram && item.monogram.color_id);
    const mFont = item.monogram_font_id || (item.monogram && item.monogram.font_id);
    const mPrice = item.monogram_price || (item.monogram && item.monogram.extra_price);

    const mUploadFile = item.monogram_upload_file || (item.monogram && item.monogram.upload_file);
    const mUploadFileType = item.monogram_upload_file_type || (item.monogram && item.monogram.upload_file_type);

    if (isMonogramEnabled) {
      await connection.query(`
          INSERT INTO order_monograms (
            order_item_id, monogram_text, placement_id, color_id, font_id, price, upload_file, upload_file_type, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
        order_item_id,
        mText || null,
        mPlacement || null,
        mColor || null,
        mFont || null,
        mPrice,
        mUploadFile || null,
        mUploadFileType || null
      ]);
    }
  }

  // Save Payment Information - full ICICI callback data
  await connection.query(`
      INSERT INTO payments (
        order_id, user_id, gateway_name, transaction_id, gateway_payment_id, merchant_txn_no, merchant_id,
        aggregator_id, bank_name, payment_method, payment_mode, payment_inst_id, card_network, acquirer_name,
        response_code, response_description, gateway_payment_datetime, amount, payment_type, wallet_amount, gateway_amount, currency, payment_status, paid_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', 'Success', ?, NOW())
    `, [
    order_id,
    userId,
    gatewayName,
    transactionId,
    gatewayPaymentId,
    merchantOrderId,
    merchantId,
    aggregatorId,
    bankName,
    finalPaymentMethod,
    paymentMode,
    paymentInstId,
    cardNetwork,
    acquirerName,
    responseCode,
    respDescription,
    gatewayPaymentDateTime,
    session.amount,
    session.payment_type,
    session.wallet_amount,
    session.gateway_amount,
    gatewayPaymentDateTime
  ]);

  // If this was a MIXED payment, confirm the wallet reservation now that Gateway succeeded
  if (session.payment_type === "MIXED") {
    await walletService.confirmReservation(userId, merchantOrderId, order_id, connection);
  }

  // Save Order Status History
  await connection.query(`
      INSERT INTO order_status_history (
        order_id, status, remarks, created_at
      ) VALUES (?, 'ORDER_PLACED', 'Payment Verified & Order Placed via ICICI Bank', NOW())
    `, [order_id]);

  // Save Shipment Details (Pending)
  const expected_delivery = new Date();
  expected_delivery.setDate(expected_delivery.getDate() + 5);

  await connection.query(`
      INSERT INTO shipment_details (
        order_id, shipment_status, expected_delivery, created_at
      ) VALUES (?, 'Pending', ?, NOW())
    `, [order_id, expected_delivery]);

  // Clear User Cart
  await connection.query("DELETE FROM cart WHERE user_id = ?", [userId]);

  // Update Session with the ACTUAL payment outcome (not the initial guess)
  await connection.query(`
      UPDATE payment_sessions
      SET status = 'Success', order_number = ?, payment_method = ?, payment_mode = ?, payment_status = ?, gateway_payment_id = ?, transaction_id = ?
      WHERE session_id = ?
    `, [order_number, finalPaymentMethod, paymentMode, 'SUCCESS', gatewayPaymentId, transactionId, session.session_id]);

  await connection.commit();

  console.log(` [ICICI Success] Order Created: ${order_number} for Session: ${merchantOrderId}, Method: ${finalPaymentMethod}`);

  // Trigger confirmation emails asynchronously after commit
  const emailService = require("../../services/email.service");
  const invoiceService = require("../../services/invoice.service");

  setTimeout(async () => {
    try {
      console.log(` [EMAIL] Fetching data to trigger confirmation emails for Order ID: ${order_id}`);
      const orderData = await emailService.getOrderDataForEmail(order_id);
      if (!orderData) {
        console.error(` [EMAIL] Order not found for notification emails: ${order_id}`);
        return;
      }

      let invoiceBuffer = null;
      try {
        console.log(` [EMAIL] Generating PDF invoice buffer for Order: ${orderData.order_number}`);
        invoiceBuffer = await invoiceService.generateInvoicePdf(orderData);
      } catch (pdfErr) {
        console.error("❌ [EMAIL] Invoice PDF generation failed:", pdfErr.message);
      }

      // Send Customer Confirmation Email (with invoice PDF attached)
      try {
        if (orderData.customer_email) {
          console.log(` [EMAIL] Sending confirmation email to customer: ${orderData.customer_email}`);
          await emailService.sendOrderConfirmationEmail(orderData, invoiceBuffer);
          console.log(` [EMAIL] Customer confirmation email sent successfully for ${orderData.order_number}`);
        } else {
          console.warn(` [EMAIL] Skipping customer email: customer_email is empty for Order ${orderData.order_number}`);
        }
      } catch (custEmailErr) {
        console.error("❌ [EMAIL] Customer confirmation email failed:", custEmailErr.message);
      }

      // Send Admin Notification Email
      try {
        if (process.env.ADMIN_EMAIL) {
          console.log(` [EMAIL] Sending new order notification to admin: ${process.env.ADMIN_EMAIL}`);
          await emailService.sendAdminNewOrderEmail(orderData);
          console.log(` [EMAIL] Admin notification email sent successfully for ${orderData.order_number}`);
        } else {
          console.warn(` [EMAIL] Skipping admin email: ADMIN_EMAIL environment variable is empty`);
        }
      } catch (adminEmailErr) {
        console.error("❌ [EMAIL] Admin notification email failed:", adminEmailErr.message);
      }
    } catch (err) {
      console.error("❌ [EMAIL] Background email dispatch failed:", err.message);
    }
  }, 0);

  return isWebhook ? res.status(200).json({ success: true, redirect: `order-success?orderNumber=${order_number}` }) : res.redirect(`${process.env.FRONTEND_URL}/order-success?orderNumber=${order_number}`);
}


const paymentCallback = async (req, res) => {
  console.log("========== CALLBACK ==========");
  console.log("METHOD:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("QUERY:", req.query);
  console.log("BODY:", req.body);
  console.log("==============================");
  const connection = await ConnectDB.getConnection();

  try {
    const callbackParams = { ...req.query, ...req.body };
    console.log(" [DEBUG] callbackParams:", JSON.stringify(callbackParams));

    const merchantOrderId = callbackParams.merchantTxnNo || callbackParams.merchantOrderId;
    const checksum = callbackParams.secureHash || callbackParams.checksum;

    // Real ICICI gateway sends responseCode ("000"/"0000" = success), not paymentStatus.
    // Simulator sends paymentStatus directly - keep supporting both.
    const responseCode = callbackParams.responseCode;
    const paymentStatus =
      callbackParams.paymentStatus ||
      (responseCode === "000" || responseCode === "0000" ? "SUCCESS" : "FAILED");

    // Actual payment details as returned by ICICI (not what was requested at initiate time)
    const gatewayPaymentId = callbackParams.paymentID || callbackParams.gatewayPaymentId || null;
    const transactionId = callbackParams.txnID || callbackParams.transactionId || callbackParams.txnNo || `txn_${Date.now()}`;
    const merchantId = callbackParams.merchantId || process.env.ICICI_MERCHANT_ID;
    const aggregatorId = callbackParams.aggregatorID || process.env.ICICI_AGGREGATOR_ID || null;
    const bankName = callbackParams.bankName || callbackParams.acqName || "ICICI_BANK";
    const paymentMode = callbackParams.paymentMode || null; // e.g. "Card", "UPI"
    const paymentInstId = callbackParams.paymentInstId || null;
    const cardNetwork = callbackParams.cardNetwork || null;
    const acquirerName = callbackParams.acqName || null;
    const respDescription = callbackParams.respDescription || callbackParams.responseDescription || null;
    const gatewayPaymentDateTime = parseIciciDateTime(callbackParams.paymentDateTime);
    const callbackAmount = callbackParams.amount;

    const secretKey = process.env.ICICI_SECRET_KEY;

    // Verify Checksum Signature (Security Check) - unchanged
    let isVerified = false;
    if (callbackParams.checksum) {
      const verificationParams = {
        merchantId: process.env.ICICI_MERCHANT_ID,
        merchantOrderId: callbackParams.merchantOrderId,
        amount: callbackParams.amount,
        paymentStatus: callbackParams.paymentStatus,
        currency: "INR"
      };
      isVerified = IciciPaymentService.verifyCallbackSignature(verificationParams, checksum, secretKey);
    } else if (checksum) {
      isVerified = IciciPaymentService.verifyCallbackSignature(callbackParams, checksum, secretKey);
    }

    // ICICI Gateway often omits the secureHash/checksum for user cancellations (responseCode '020').
    // To ensure the wallet reservation doesn't get permanently stuck, we allow explicit failure codes 
    // to bypass the checksum requirement and proceed to the failure processing block.
    if (!isVerified && !checksum && paymentStatus === "FAILED") {
      console.log(` [ICICI Callback] Bypassing checksum for explicit FAILED/CANCELLED callback without secureHash.`);
      isVerified = true;
    }
    console.log(" [DEBUG] calculated isVerified status:", isVerified);
    console.log(" [DEBUG] received checksum:", checksum);
    console.log(" [DEBUG] derived paymentStatus:", paymentStatus, "| responseCode:", responseCode);

    if (!isVerified) {
      console.error(` [ICICI Callback] Invalid Checksum Signature for merchantOrderId: ${merchantOrderId}`);
      return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=invalid_checksum`);
    }

    // Check if this merchantOrderId is a Wallet Recharge first!
    const [topupRows] = await connection.query(
      "SELECT * FROM wallet_topups WHERE merchant_txn_no = ? FOR UPDATE",
      [merchantOrderId]
    );

    if (topupRows.length > 0) {
      const topup = topupRows[0];

      if (topup.status !== "PENDING") {
        console.log(` [ICICI Callback] Topup ${merchantOrderId} already processed with status: ${topup.status}`);
        return res.redirect(`${process.env.FRONTEND_URL}/wallet`);
      }

      const walletRepository = require("../Wallet/wallet.repository");

      if (paymentStatus !== "SUCCESS") {
        console.log(` [ICICI Callback] Topup Failed for Session: ${merchantOrderId}`);
        await walletRepository.updateTopupStatus(topup.topup_id, "FAILED", transactionId, gatewayPaymentId, connection);
        return res.redirect(`${process.env.FRONTEND_URL}/wallet`);
      }

      // Success! Perform topup completion logic atomically via walletService
      try {
        await walletService.completeRecharge(
          topup.user_id,
          topup.topup_id,
          transactionId,
          gatewayPaymentId,
          {
            gateway_name: 'ICICI',
            gateway_order_id: merchantOrderId,
            payment_method: paymentMode
          },
          connection
        );
        return res.redirect(`${process.env.FRONTEND_URL}/wallet`);
      } catch (err) {
        console.error(" [ICICI Callback] Topup Completion Error:", err.message);
        return res.redirect(`${process.env.FRONTEND_URL}/wallet?error=topup_failed`);
      }
    }

    // Fetch matching payment session
    const [sessionRows] = await connection.query(
      "SELECT * FROM payment_sessions WHERE merchant_order_id = ? FOR UPDATE",
      [merchantOrderId]
    );

    if (sessionRows.length === 0) {
      console.error(` [ICICI Callback] Payment Session not found for ID: ${merchantOrderId}`);
      return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=session_not_found`);
    }

    const session = sessionRows[0];

    // Prevent duplicate orders
    if (session.status !== "Initiated") {
      console.log(` [ICICI Callback] Session ${merchantOrderId} already processed with status: ${session.status}`);
      if (session.status === "Success" && session.order_number) {
        return res.redirect(`${process.env.FRONTEND_URL}/order-success?orderNumber=${session.order_number}`);
      } else {
        return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=already_processed`);
      }
    }

    // Handle Payment Failure - still capture whatever the gateway told us
    if (paymentStatus !== "SUCCESS") {
      console.log(` [ICICI Callback] Payment Failed for Session: ${merchantOrderId}`);
      await connection.query(`
        UPDATE payment_sessions
        SET status = 'Failed', payment_status = ?, payment_method = ?, payment_mode = ?, gateway_payment_id = ?, transaction_id = ?
        WHERE session_id = ?
      `, [paymentStatus, paymentMode || session.payment_method, paymentMode, gatewayPaymentId, transactionId, session.session_id]);

      return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=payment_declined`);
    }


    const paymentDetails = {
      gatewayPaymentId, merchantOrderId, merchantId, aggregatorId, bankName,
      finalPaymentMethod: paymentMode || session.payment_method, paymentMode, paymentInstId, cardNetwork, acquirerName,
      responseCode, respDescription, gatewayPaymentDateTime, transactionId,
      gatewayName: 'ICICI_BANK'
    };

    return await processSuccessfulOrder(session, paymentDetails, connection, res, false);


  } catch (err) {
    if (connection) await connection.rollback();
    console.error("❌ ICICI Callback error occurred, transaction rolled back:", err);
    return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=server_error`);
  } finally {
    if (connection) connection.release();
  }
};

// 4. TRANSACTION STATUS POLLING
const getTransactionStatus = async (req, res) => {
  const connection = await ConnectDB.getConnection();
  try {
    const { transactionId } = req.params;

    const [rows] = await connection.query(
      "SELECT status, order_number FROM payment_sessions WHERE merchant_order_id = ?",
      [transactionId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Transaction session not found." });
    }

    return res.status(200).json({
      success: true,
      status: rows[0].status,
      orderNumber: rows[0].order_number
    });

  } catch (err) {
    console.error("❌ Get Transaction Status error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  } finally {
    if (connection) connection.release();
  }
};

const initiateCashfreePayment = async (req, res) => {
  const connection = await ConnectDB.getConnection();
  try {
    const userId = req.user ? (req.user.userId || req.user.user_id) : null;
    const { address_id, guest_data, cart_items } = req.body;

    if (userId && !address_id) {
      return res.status(400).json({ success: false, message: "Address ID is required." });
    }
    if (!userId && !guest_data) {
      return res.status(400).json({ success: false, message: "Guest details are required." });
    }

    let cartItems = [];
    if (userId) {
      const [rows] = await connection.query(`
        SELECT c.*, pm.price, pm.pro_name, pm.is_deleted, pm.stock_quantity, pm.stock_unit, pm.stitching_price
        FROM cart c
        INNER JOIN product_master pm ON c.pro_id = pm.pro_id
        WHERE c.user_id = ?
      `, [userId]);
      cartItems = rows;
    } else {
      cartItems = cart_items || [];
    }

    if (cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty." });
    }

    const { grandTotal } = calculateOrderSummary(cartItems);

    let customerName = "Guest";
    let customerEmail = "guest@fabricluxure.com";
    let customerPhone = "9999999999";

    if (userId && address_id) {
      const [addrRows] = await connection.query("SELECT * FROM user_addresses WHERE address_id = ?", [address_id]);
      if (addrRows.length > 0) {
        customerName = addrRows[0].full_name;
        customerPhone = addrRows[0].mobile;
        const [uRows] = await connection.query("SELECT email FROM users WHERE user_id = ?", [userId]);
        if (uRows.length > 0) customerEmail = uRows[0].email;
      }
    } else if (guest_data) {
      customerName = guest_data.full_name;
      customerPhone = guest_data.mobile;
      customerEmail = guest_data.email;
    }

    const merchantOrderId = "FL2026" + String(Date.now()).slice(-8);

    const cashfreeRes = await CashfreePaymentService.createOrder({
      merchantOrderId,
      amount: grandTotal,
      customerName,
      customerEmail,
      customerPhone
    });

    const safeGuestData = guest_data ? JSON.stringify({ guest_data, cart_items: cartItems }) : null;

    await connection.query(`
      INSERT INTO payment_sessions (
        merchant_order_id, user_id, address_id, gateway_order_id, payment_method, 
        payment_type, amount, wallet_amount, gateway_amount, status, 
        guest_data
      ) VALUES (?, ?, ?, ?, 'CASHFREE', 'GATEWAY', ?, 0, ?, 'INITIATED', ?)
    `, [
      merchantOrderId,
      userId || null,
      address_id || null,
      cashfreeRes.cashfree_order_id || null,
      grandTotal,
      grandTotal,
      safeGuestData
    ]);

    const paymentUrl = cashfreeRes.payment_link;

    return res.status(200).json({
      success: true,
      message: "Cashfree payment initiated",
      payment_session_id: cashfreeRes.payment_session_id,
      payment_url: paymentUrl
    });

  } catch (err) {
    console.error("❌ Cashfree initiation error:", err);
    return res.status(500).json({ success: false, message: "Cashfree initiation failed." });
  } finally {
    if (connection) connection.release();
  }
};


// ==========================================
// CASHFREE WEBHOOK
// ==========================================
const cashfreeWebhook = async (req, res) => {
  console.log("======================================");
  console.log("WEBHOOK RECEIVED");
  console.log("======================================");

  const signature = req.headers["x-webhook-signature"];
  const timestamp = req.headers["x-webhook-timestamp"];
  const rawBody = req.rawBody || JSON.stringify(req.body);

  const isValid = CashfreePaymentService.verifyWebhookSignature(signature, rawBody, timestamp);
  console.log("Signature Valid :\n" + (isValid ? "YES" : "NO"));
  console.log("======================================");

  if (!isValid) {
    return res.status(400).send("Invalid Signature");
  }

  const payload = req.body;
  const event = payload.type;
  console.log("Event :\n" + event);

  const data = payload.data || {};
  const orderData = data.order || {};
  const paymentData = data.payment || {};
  const refundData = data.refund || {};

  const merchantOrderId = orderData.order_id;

  const connection = await ConnectDB.getConnection();
  try {
    if (event === "PAYMENT_SUCCESS_WEBHOOK") {
      console.log("======================================");
      console.log("PAYMENT SUCCESS");
      console.log("======================================");
      console.log("Merchant Order :\n" + merchantOrderId);
      console.log("Gateway Order :\n" + paymentData.cf_payment_id);
      console.log("Payment Id :\n" + paymentData.cf_payment_id);
      console.log("Transaction :\n" + (paymentData.bank_reference || paymentData.cf_payment_id));
      console.log("Amount :\n" + paymentData.payment_amount);
      console.log("Method :\n" + paymentData.payment_group);
      console.log("======================================");

      const verification = await CashfreePaymentService.verifyPayment(merchantOrderId);
      if (!verification.success || verification.status !== 'PAID') {
        console.log("Payment verification failed or status is not PAID. Ignoring webhook.");
        return res.status(200).send("OK");
      }

      // Check if this merchantOrderId is a Wallet Recharge first!
      const [topupRows] = await connection.query(
        "SELECT * FROM wallet_topups WHERE merchant_txn_no = ? FOR UPDATE",
        [merchantOrderId]
      );

      if (topupRows.length > 0) {
        const topup = topupRows[0];
        if (topup.status !== "PENDING") {
          return res.status(200).send("Already processed");
        }

        const walletService = require("../Wallet/wallet.service");
        try {
          const transactionId = paymentData.bank_reference || merchantOrderId;
          const gatewayPaymentId = paymentData.cf_payment_id || null;

          let paymentMethodStr = 'CASHFREE';
          if (paymentData.payment_group) paymentMethodStr = paymentData.payment_group;

          await walletService.completeRecharge(
            topup.user_id,
            topup.topup_id,
            transactionId,
            gatewayPaymentId,
            {
              gateway_name: 'CASHFREE',
              gateway_order_id: merchantOrderId,
              payment_method: paymentMethodStr
            },
            connection
          );
          return res.status(200).send("OK");
        } catch (err) {
          console.error(" [Cashfree Webhook] Topup Completion Error:", err.message);
          return res.status(500).send("Failed to process topup");
        }
      }

      // Fetch matching payment session
      const [sessionRows] = await connection.query(
        "SELECT * FROM payment_sessions WHERE merchant_order_id = ? FOR UPDATE",
        [merchantOrderId]
      );
      if (sessionRows.length === 0) return res.status(200).send("Session not found");
      const session = sessionRows[0];

      if (session.status !== "INITIATED") {
        return res.status(200).send("Already processed");
      }

      let finalMode = paymentData.payment_group || 'CASHFREE';
      let instId = null;
      let network = null;
      let acquirer = paymentData.bank_name || null;

      if (paymentData.payment_method) {
        if (paymentData.payment_method.card) {
          finalMode = 'Card';
          instId = paymentData.payment_method.card.card_number;
          network = paymentData.payment_method.card.card_network;
          acquirer = paymentData.payment_method.card.card_bank_name;
        } else if (paymentData.payment_method.upi) {
          finalMode = 'UPI';
          instId = paymentData.payment_method.upi.upi_id;
        } else if (paymentData.payment_method.netbanking) {
          finalMode = 'NB';
          instId = paymentData.payment_method.netbanking.netbanking_bank_name;
        }
      }

      const paymentDetails = {
        gatewayPaymentId: paymentData.cf_payment_id,
        merchantOrderId: merchantOrderId,
        merchantId: null,
        aggregatorId: null,
        bankName: acquirer || 'CASHFREE',
        finalPaymentMethod: paymentData.payment_group || 'CASHFREE',
        paymentMode: finalMode,
        paymentInstId: instId,
        cardNetwork: network,
        acquirerName: acquirer,
        responseCode: "SUCCESS",
        respDescription: paymentData.payment_message || "Success",
        gatewayPaymentDateTime: paymentData.payment_time || null,
        transactionId: paymentData.bank_reference || paymentData.cf_payment_id,
        gatewayName: 'CASHFREE'
      };

      console.log("======================================");
      console.log("PAYMENT VERIFIED");
      console.log("======================================");
      console.log("Gateway :\nCashfree");
      console.log("Transaction :\n" + paymentDetails.transactionId);
      console.log("Amount :\n" + paymentData.payment_amount);
      console.log("Status :\nSUCCESS");
      console.log("======================================");

      await processSuccessfulOrder(session, paymentDetails, connection, res, true);

      console.log("======================================");
      console.log("PAYMENTS TABLE UPDATED");
      console.log("======================================");
      console.log("======================================");
      console.log("ORDER CREATED");
      console.log("======================================");

      return; // processSuccessfulOrder sends the response for webhook
    }

    if (event === "PAYMENT_FAILED_WEBHOOK") {
      console.log("======================================");
      console.log("PAYMENT FAILED");
      console.log("======================================");
      console.log("Reason :\n" + paymentData.payment_message);
      console.log("Code :\n" + paymentData.payment_message);
      console.log("Response :\n" + JSON.stringify(paymentData));
      console.log("======================================");

      await connection.query(`
        UPDATE payment_sessions
        SET status = 'FAILED', payment_status = 'FAILED', payment_method = 'CASHFREE', gateway_payment_id = ?
        WHERE merchant_order_id = ?
      `, [paymentData.cf_payment_id, merchantOrderId]);
      return res.status(200).send("OK");
    }

    if (event === "REFUND_STATUS_WEBHOOK") {
      const refundStatus = refundData.refund_status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
      console.log("======================================");
      console.log("REFUND " + refundStatus);
      console.log("======================================");
      console.log("Refund Id :\n" + refundData.refund_id);
      console.log("Order :\n" + merchantOrderId);
      console.log("Amount :\n" + refundData.refund_amount);
      console.log("======================================");

      await connection.query(`
        UPDATE payments SET refund_status = ? WHERE refund_id = ?
      `, [refundStatus, refundData.refund_id]);
      return res.status(200).send("OK");
    }

    return res.status(200).send("OK");

  } catch (err) {
    console.error("Cashfree Webhook error:", err);
    if (connection) await connection.rollback();
    return res.status(500).send("Webhook processing failed");
  } finally {
    if (connection) connection.release();
  }
};


// ==========================================
// CASHFREE REDIRECT CALLBACK (GET)
// ==========================================
const cashfreeCallback = async (req, res) => {
  const merchantOrderId = req.query.order_id;
  if (!merchantOrderId) {
    return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=invalid_order`);
  }

  const connection = await ConnectDB.getConnection();
  try {
    const verification = await CashfreePaymentService.verifyPayment(merchantOrderId);

    // Check if this merchantOrderId is a Wallet Recharge first!
    const [topupRows] = await connection.query(
      "SELECT * FROM wallet_topups WHERE merchant_txn_no = ? FOR UPDATE",
      [merchantOrderId]
    );

    if (topupRows.length > 0) {
      const topup = topupRows[0];

      if (topup.status !== "PENDING") {
        return res.redirect(`${process.env.FRONTEND_URL}/wallet`);
      }

      const walletService = require("../Wallet/wallet.service");
      const walletRepository = require("../Wallet/wallet.repository");

      if (!verification.success || verification.status !== 'PAID') {
        const paymentData = verification.rawResponse || {};
        const pd = paymentData.payment_details || {};
        const gatewayPaymentId = pd.cf_payment_id || paymentData.cf_order_id || null;
        const transactionId = pd.bank_reference || null;
        await walletRepository.updateTopupStatus(topup.topup_id, "FAILED", transactionId, gatewayPaymentId, connection);
        return res.redirect(`${process.env.FRONTEND_URL}/wallet`);
      }

      // Success! Perform topup completion logic via walletService
      try {
        const paymentData = verification.rawResponse || {};
        const pd = paymentData.payment_details || {};
        const gatewayPaymentId = pd.cf_payment_id || paymentData.cf_order_id || null;
        const transactionId = pd.bank_reference || merchantOrderId;

        let paymentMethodStr = 'CASHFREE';
        if (pd.payment_group) paymentMethodStr = pd.payment_group;

        await walletService.completeRecharge(
          topup.user_id,
          topup.topup_id,
          transactionId,
          gatewayPaymentId,
          {
            gateway_name: 'CASHFREE',
            gateway_order_id: merchantOrderId,
            payment_method: paymentMethodStr
          },
          connection
        );
        return res.redirect(`${process.env.FRONTEND_URL}/wallet`);
      } catch (err) {
        console.error(" [Cashfree Callback] Topup Completion Error:", err.message);
        return res.redirect(`${process.env.FRONTEND_URL}/wallet?error=topup_failed`);
      }
    }

    // Fetch matching payment session (for orders)
    const [sessionRows] = await connection.query(
      "SELECT * FROM payment_sessions WHERE merchant_order_id = ? FOR UPDATE",
      [merchantOrderId]
    );

    if (sessionRows.length === 0) {
      return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=session_not_found`);
    }

    const session = sessionRows[0];

    // If already processed (by webhook or previous call)
    if (session.status !== "INITIATED" && session.status !== "Initiated") {
      if (session.status === "Success" || session.status === "SUCCESS") {
        return res.redirect(`${process.env.FRONTEND_URL}/order-success?orderNumber=${session.order_number || merchantOrderId}`);
      } else {
        return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=payment_declined`);
      }
    }

    if (verification.success && verification.status === 'PAID') {
      const paymentData = verification.rawResponse || {};
      const pd = paymentData.payment_details || {};

      let finalMode = pd.payment_group || paymentData.payment_group || 'CASHFREE';
      let instId = null;
      let network = null;
      let acquirer = pd.bank_name || paymentData.bank_name || null;

      if (pd.payment_method) {
        if (pd.payment_method.card) {
          finalMode = 'Card';
          instId = pd.payment_method.card.card_number;
          network = pd.payment_method.card.card_network;
          acquirer = pd.payment_method.card.card_bank_name;
        } else if (pd.payment_method.upi) {
          finalMode = 'UPI';
          instId = pd.payment_method.upi.upi_id;
        } else if (pd.payment_method.netbanking) {
          finalMode = 'NB';
          instId = pd.payment_method.netbanking.netbanking_bank_name;
        }
      }

      const paymentDetails = {
        gatewayPaymentId: pd.cf_payment_id || paymentData.cf_order_id || merchantOrderId,
        merchantOrderId: merchantOrderId,
        merchantId: null,
        aggregatorId: null,
        bankName: acquirer || 'CASHFREE',
        finalPaymentMethod: pd.payment_group || paymentData.payment_group || 'CASHFREE',
        paymentMode: finalMode,
        paymentInstId: instId,
        cardNetwork: network,
        acquirerName: acquirer,
        responseCode: "SUCCESS",
        respDescription: pd.payment_message || "Success",
        gatewayPaymentDateTime: pd.payment_time || null,
        transactionId: pd.bank_reference || paymentData.cf_order_id || merchantOrderId,
        gatewayName: 'CASHFREE'
      };

      await processSuccessfulOrder(session, paymentDetails, connection, res, false);
      return; // processSuccessfulOrder redirects
    } else {
      await connection.query(`
        UPDATE payment_sessions
        SET status = 'FAILED', payment_status = 'FAILED', payment_method = 'CASHFREE'
        WHERE merchant_order_id = ?
      `, [merchantOrderId]);

      return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=payment_failed`);
    }
  } catch (err) {
    const fs = require('fs');
    fs.appendFileSync('c:/vlglobal backup/cf_error.log', new Date().toISOString() + '\\n' + (err.stack || err) + '\\n\\n');
    console.error("Cashfree Callback error:", err);
    if (connection) await connection.rollback();
    return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=server_error`);
  } finally {
    if (connection) connection.release();
  }
};

const initiateInstamojoPayment = async (req, res) => {
  const connection = await ConnectDB.getConnection();
  try {
    const userId = req.user ? (req.user.userId || req.user.user_id) : null;
    const { address_id, guest_data, cart_items } = req.body;

    // Verify Instamojo is enabled first
    const [gatewayRows] = await connection.query(
      "SELECT is_enabled FROM payment_gateway_settings WHERE gateway_name = 'INSTAMOJO'"
    );
    if (gatewayRows.length === 0 || gatewayRows[0].is_enabled !== 1) {
      return res.status(400).json({ success: false, message: "Instamojo payment gateway is currently disabled." });
    }

    if (userId && !address_id) {
      return res.status(400).json({ success: false, message: "Address ID is required." });
    }
    if (!userId && !guest_data) {
      return res.status(400).json({ success: false, message: "Guest details are required." });
    }

    let cartItems = [];
    if (userId) {
      const [rows] = await connection.query(`
        SELECT c.*, pm.price, pm.pro_name, pm.is_deleted, pm.stock_quantity, pm.stock_unit, pm.stitching_price
        FROM cart c
        INNER JOIN product_master pm ON c.pro_id = pm.pro_id
        WHERE c.user_id = ?
      `, [userId]);
      cartItems = rows;
    } else {
      cartItems = cart_items || [];
    }

    if (cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty." });
    }

    const { grandTotal } = calculateOrderSummary(cartItems);

    let customerName = "Guest";
    let customerEmail = "guest@fabricluxure.com";
    let customerPhone = "9999999999";

    if (userId && address_id) {
      const [addrRows] = await connection.query("SELECT * FROM user_addresses WHERE address_id = ?", [address_id]);
      if (addrRows.length > 0) {
        customerName = addrRows[0].full_name;
        customerPhone = addrRows[0].mobile;
        const [uRows] = await connection.query("SELECT email FROM users WHERE user_id = ?", [userId]);
        if (uRows.length > 0) customerEmail = uRows[0].email;
      }
    } else if (guest_data) {
      customerName = `${guest_data.firstName || ""} ${guest_data.lastName || ""}`.trim() || "Guest";
      customerPhone = guest_data.mobile;
      customerEmail = guest_data.email;
    }

    const merchantOrderId = "FL2026" + String(Date.now()).slice(-8);

    const instamojoRes = await InstamojoPaymentService.createPayment({
      merchantOrderId,
      amount: grandTotal,
      customerName,
      customerEmail,
      customerPhone,
      purpose: `Order Ref ${merchantOrderId}`
    });

    const safeGuestData = guest_data ? JSON.stringify({ guest_data, cart_items: cartItems }) : null;

    await connection.query(`
      INSERT INTO payment_sessions (
        merchant_order_id, user_id, address_id, gateway_order_id, payment_method, 
        payment_type, amount, wallet_amount, gateway_amount, status, 
        guest_data
      ) VALUES (?, ?, ?, ?, 'INSTAMOJO', 'GATEWAY', ?, 0, ?, 'INITIATED', ?)
    `, [
      merchantOrderId,
      userId || null,
      address_id || null,
      instamojoRes.payment_request_id || null,
      grandTotal,
      grandTotal,
      safeGuestData
    ]);

    const paymentUrl = instamojoRes.payment_url;

    return res.status(200).json({
      success: true,
      message: "Instamojo payment initiated",
      payment_session_id: instamojoRes.payment_request_id,
      payment_url: paymentUrl
    });

  } catch (err) {
    console.error("❌ Instamojo initiation error:", err);
    return res.status(500).json({ success: false, message: "Instamojo initiation failed." });
  } finally {
    if (connection) connection.release();
  }
};

const instamojoCallback = async (req, res) => {
  console.log("========== INSTAMOJO CALLBACK ==========");
  console.log("METHOD:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("QUERY:", req.query);
  console.log("========================================");

  const paymentId = req.query.payment_id;
  const paymentRequestId = req.query.payment_request_id;

  if (!paymentId || !paymentRequestId) {
    return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=invalid_callback_params`);
  }

  const connection = await ConnectDB.getConnection();
  try {
    const verification = await InstamojoPaymentService.verifyPayment(paymentId);

    let topup = null;
    let isTopup = false;

    const [topupRowsByRequest] = await connection.query(
      "SELECT * FROM wallet_topups WHERE gateway_payment_id = ? FOR UPDATE",
      [paymentRequestId]
    );
    if (topupRowsByRequest.length > 0) {
      topup = topupRowsByRequest[0];
      isTopup = true;
    }

    if (isTopup) {
      if (topup.status !== "PENDING") {
        return res.redirect(`${process.env.FRONTEND_URL}/wallet`);
      }

      const walletService = require("../Wallet/wallet.service");
      const walletRepository = require("../Wallet/wallet.repository");

      if (!verification.success || (verification.status !== 'Credit' && verification.status !== 'Completed')) {
        await walletRepository.updateTopupStatus(topup.topup_id, "FAILED", paymentId, paymentRequestId, connection);
        return res.redirect(`${process.env.FRONTEND_URL}/wallet`);
      }

      try {
        await walletService.completeRecharge(
          topup.user_id,
          topup.topup_id,
          paymentId,
          paymentRequestId,
          {
            gateway_name: 'INSTAMOJO',
            gateway_order_id: topup.merchant_txn_no,
            payment_method: verification.payment_mode || 'INSTAMOJO'
          },
          connection
        );
        return res.redirect(`${process.env.FRONTEND_URL}/wallet`);
      } catch (err) {
        console.error(" [Instamojo Callback] Topup Completion Error:", err.message);
        return res.redirect(`${process.env.FRONTEND_URL}/wallet?error=topup_failed`);
      }
    }

    const [sessionRows] = await connection.query(
      "SELECT * FROM payment_sessions WHERE gateway_order_id = ? FOR UPDATE",
      [paymentRequestId]
    );

    if (sessionRows.length === 0) {
      return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=session_not_found`);
    }

    const session = sessionRows[0];

    if (session.status !== "INITIATED" && session.status !== "Initiated") {
      if (session.status === "Success" || session.status === "SUCCESS") {
        return res.redirect(`${process.env.FRONTEND_URL}/order-success?orderNumber=${session.order_number || session.merchant_order_id}`);
      } else {
        return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=payment_declined`);
      }
    }

    if (verification.success && (verification.status === 'Credit' || verification.status === 'Completed')) {
      const paymentDetails = {
        gatewayPaymentId: paymentRequestId,
        merchantOrderId: session.merchant_order_id,
        merchantId: null,
        aggregatorId: null,
        bankName: 'INSTAMOJO',
        finalPaymentMethod: verification.payment_mode || 'INSTAMOJO',
        paymentMode: verification.payment_mode || 'INSTAMOJO',
        paymentInstId: null,
        cardNetwork: null,
        acquirerName: null,
        responseCode: "SUCCESS",
        respDescription: "Success",
        gatewayPaymentDateTime: new Date(),
        transactionId: paymentId,
        gatewayName: 'INSTAMOJO'
      };

      await processSuccessfulOrder(session, paymentDetails, connection, res, false);
      return;
    } else {
      await connection.query(`
        UPDATE payment_sessions
        SET status = 'FAILED', payment_status = 'FAILED', payment_method = 'INSTAMOJO'
        WHERE session_id = ?
      `, [session.session_id]);

      return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=payment_failed`);
    }

  } catch (err) {
    console.error("Instamojo Callback error:", err);
    if (connection) await connection.rollback();
    return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?reason=server_error`);
  } finally {
    if (connection) connection.release();
  }
};

const instamojoWebhook = async (req, res) => {
  console.log("========== INSTAMOJO WEBHOOK RECEIVED ==========");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  const payload = req.body;
  const paymentId = payload.payment_id;
  const paymentRequestId = payload.payment_request_id;
  const status = payload.status;

  console.log("Payment ID:        ", paymentId);
  console.log("Payment Request ID:", paymentRequestId);
  console.log("Status:             ", status);
  console.log("================================================\n");

  const salt = process.env.INSTAMOJO_AUTH_TOKEN || process.env.INSTAMOJO_SALT;

  console.log("========================================");
  console.log("INSTAMOJO WEBHOOK VERIFICATION");
  console.log("========================================");
  console.log("Signature/MAC: ", payload.mac);

  const isVerified = InstamojoPaymentService.verifyWebhookSignature(payload, salt);
  console.log("Verification Result:", isVerified);
  console.log("========================================\n");

  if (!isVerified) {
    console.error(" [Instamojo Webhook] MAC Signature Verification Failed.");
    return res.status(400).send("Signature Verification Failed");
  }

  const connection = await ConnectDB.getConnection();
  try {
    const [topupRows] = await connection.query(
      "SELECT * FROM wallet_topups WHERE gateway_payment_id = ? FOR UPDATE",
      [paymentRequestId]
    );

    if (topupRows.length > 0) {
      const topup = topupRows[0];
      if (topup.status !== "PENDING") {
        console.log(` [Instamojo Webhook] Topup ${topup.merchant_txn_no} already processed with status: ${topup.status}`);
        return res.status(200).send("Idempotent Success");
      }

      const walletService = require("../Wallet/wallet.service");
      const walletRepository = require("../Wallet/wallet.repository");

      if (status !== "Credit") {
        await walletRepository.updateTopupStatus(topup.topup_id, "FAILED", paymentId, paymentRequestId, connection);
        return res.status(200).send("Processed Failure");
      }

      try {
        await walletService.completeRecharge(
          topup.user_id,
          topup.topup_id,
          paymentId,
          paymentRequestId,
          {
            gateway_name: 'INSTAMOJO',
            gateway_order_id: topup.merchant_txn_no,
            payment_method: payload.payment_mode || 'INSTAMOJO'
          },
          connection
        );
        return res.status(200).send("OK");
      } catch (err) {
        console.error(" [Instamojo Webhook] Topup Completion Error:", err.message);
        return res.status(500).send("Topup Completion Failed");
      }
    }

    const [sessionRows] = await connection.query(
      "SELECT * FROM payment_sessions WHERE gateway_order_id = ? FOR UPDATE",
      [paymentRequestId]
    );

    if (sessionRows.length === 0) {
      console.error(` [Instamojo Webhook] Payment Session not found for ID: ${paymentRequestId}`);
      return res.status(404).send("Session not found");
    }

    const session = sessionRows[0];

    if (session.status !== "INITIATED" && session.status !== "Initiated") {
      console.log(` [Instamojo Webhook] Session ${session.merchant_order_id} already processed with status: ${session.status}`);
      return res.status(200).send("Idempotent Success");
    }

    if (status === "Credit") {
      const paymentDetails = {
        gatewayPaymentId: paymentRequestId,
        merchantOrderId: session.merchant_order_id,
        merchantId: null,
        aggregatorId: null,
        bankName: 'INSTAMOJO',
        finalPaymentMethod: payload.payment_mode || 'INSTAMOJO',
        paymentMode: payload.payment_mode || 'INSTAMOJO',
        paymentInstId: null,
        cardNetwork: null,
        acquirerName: null,
        responseCode: "SUCCESS",
        respDescription: "Success",
        gatewayPaymentDateTime: new Date(),
        transactionId: paymentId,
        gatewayName: 'INSTAMOJO'
      };

      await processSuccessfulOrder(session, paymentDetails, connection, res, true);
      return;
    } else {
      await connection.query(`
        UPDATE payment_sessions
        SET status = 'FAILED', payment_status = 'FAILED', payment_method = 'INSTAMOJO'
        WHERE session_id = ?
      `, [session.session_id]);

      return res.status(200).send("Processed Failure");
    }

  } catch (err) {
    if (connection) await connection.rollback();
    console.error("❌ Instamojo Webhook error occurred:", err);
    return res.status(500).send("Server Error");
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  initiatePayment,
  initiateCashfreePayment,
  cashfreeWebhook,
  cashfreeCallback,
  simulateGateway,
  paymentCallback,
  getTransactionStatus,
  initiateInstamojoPayment,
  instamojoCallback,
  instamojoWebhook
};