const ConnectDB = require("../../config/db");
const invoiceService = require("../../services/invoice.service");
const emailService = require("../../services/email.service");
const delhiveryService = require("../../services/delhivery.service");
const ShippingFactory = require("../../services/shipping/ShippingFactory");

const getOrderItemsWithMonograms = async (orderId) => {
  const [items] = await ConnectDB.query(`
    SELECT oi.*, 
           om.order_monogram_id, om.monogram_text, om.price as monogram_price,
           om.upload_file, om.upload_file_type,
           mp.placement_name, mc.color_name, mf.font_name,
           pm.pro_img as current_product_image,
           pm.stitching_price,
           pt.product_type AS pro_type_name
    FROM order_items oi
    LEFT JOIN order_monograms om ON oi.order_item_id = om.order_item_id
    LEFT JOIN monogram_placements mp ON om.placement_id = mp.placement_id
    LEFT JOIN monogram_colors mc ON om.color_id = mc.color_id
    LEFT JOIN monogram_fonts mf ON om.font_id = mf.font_id
    LEFT JOIN product_master pm ON oi.product_id = pm.pro_id
    LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
    LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
    WHERE oi.order_id = ?
  `, [orderId]);

  return items.map(item => {
    let monogram = null;
    if (item.order_monogram_id) {
      monogram = {
        text: item.monogram_text,
        placement: item.placement_name,
        color: item.color_name,
        font: item.font_name,
        price: Number(item.monogram_price || 0),
        upload_file: item.upload_file,
        upload_file_type: item.upload_file_type
      };
    }

    let parsedImg = item.current_product_image || item.product_image;
    if (typeof parsedImg === 'string') {
      try {
        const arr = JSON.parse(parsedImg);
        parsedImg = Array.isArray(arr) && arr.length > 0 ? arr[0] : parsedImg;
      } catch (e) {
        // Not JSON, leave as is
      }
    }

    return {
      order_item_id: item.order_item_id,
      product_id: item.product_id,
      product_name: item.product_name,
      pro_type_name: item.pro_type_name,
      product_image: parsedImg,
      price: item.price,
      quantity: item.quantity,
      fit_style: item.fit_style,
      selected_size: item.selected_size,
      selected_length: item.selected_length,
      selected_sleeve: item.selected_sleeve,
      custom_measurement: item.custom_measurement,
      stitching_price: item.stitching_price,
      monogram
    };
  });
};

// =========================================================
// 1. PLACE ORDER
// =========================================================
const placeOrder = async (req, res) => {
  const connection = await ConnectDB.getConnection();
  try {
    const userId = req.user.userId || req.user.user_id;
    const { address_id, payment_method, transaction_id } = req.body;

    // Validate request inputs
    if (!address_id) {
      return res.status(400).json({ success: false, message: "Address ID is required." });
    }
    if (!payment_method) {
      return res.status(400).json({ success: false, message: "Payment method is required." });
    }
    if (!transaction_id) {
      return res.status(400).json({ success: false, message: "Transaction ID is required." });
    }

    // Start Transaction
    await connection.beginTransaction();

    // Verify address belongs to logged-in user
    const [addressRows] = await connection.query(
      "SELECT * FROM user_addresses WHERE address_id = ? AND user_id = ?",
      [address_id, userId]
    );
    if (addressRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Invalid address or address does not belong to user." });
    }

    // Step 1: Fetch active cart items of the user
    const [cartItems] = await connection.query(`
      SELECT c.*, pm.pro_name, pm.price, pm.pro_img, pm.cover_description, pm.is_deleted, pm.stock_unit, pm.stitching_price
      FROM cart c
      INNER JOIN product_master pm ON c.pro_id = pm.pro_id
      WHERE c.user_id = ?
    `, [userId]);

    if (cartItems.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Cart is empty." });
    }

    // Step 8: Verify product active/price existence and monograms
    for (const item of cartItems) {
      if (item.price === undefined || item.price === null || item.is_deleted === 1) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Product "${item.pro_name || item.pro_id}" is inactive, deleted, or missing a valid price.`
        });
      }

      if (item.monogram_enabled) {
        const isUpload = item.monogram_type === 'upload' || (!item.monogram_text && item.monogram_upload_file);
        if (!isUpload) {
          if (!item.monogram_text || item.monogram_text.length > 4) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: `Monogram text must be up to 4 characters for product "${item.pro_name}".` });
          }
          const [[placement]] = await connection.query("SELECT placement_id FROM monogram_placements WHERE placement_id = ?", [item.monogram_placement_id]);
          const [[color]] = await connection.query("SELECT color_id FROM monogram_colors WHERE color_id = ?", [item.monogram_color_id]);
          const [[font]] = await connection.query("SELECT font_id FROM monogram_fonts WHERE font_id = ?", [item.monogram_font_id]);

          if (!placement || !color || !font) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: `Invalid monogram configuration for product "${item.pro_name}".` });
          }
        }
      }
    }

    // Step 2: Calculate prices
    const subtotal = cartItems.reduce(
      (acc, item) => {
        let basePrice = Number(item.price || 0);
        if (item.stock_unit === 'METER') {
          basePrice = basePrice * Number(item.selected_meter || 1);
        }
        const extraPrice = item.monogram_enabled ? Number(item.monogram_price || 0) : 0;
        return acc + ((basePrice + extraPrice) * Number(item.quantity || 1));
      },
      0
    );
    const gst_amount = Number((subtotal * 0.05).toFixed(2));

    // Stitching is dynamically calculated everywhere else, we won't store it.
    // Calculate it here just to compute grand_total accurately for the database
    const dynamicStitching = Number(cartItems.reduce((acc, item) => {
      let basePrice = Number(item.price || 0);
      if (item.stock_unit === 'METER') {
        basePrice = basePrice * Number(item.selected_meter || 1);
      }
      const itemBaseTotal = basePrice * Number(item.quantity || 1);
      const charge = Number(item.stitching_price) || 0;
      return acc + (charge * Number(item.quantity || 1));
    }, 0).toFixed(2));

    const shipping_amount = 0;
    const grand_total = Number((subtotal + gst_amount + dynamicStitching + shipping_amount).toFixed(2));

    // Step 3: Generate Incrementing Order Number FL202600001
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

    const payStatus = payment_method === 'cod' ? 'Pending' : 'Paid';
    const payTxStatus = payment_method === 'cod' ? 'Pending' : 'Success';
    const paidAt = payment_method === 'cod' ? null : new Date();

    // Step 4: Insert into orders table
    const [orderResult] = await connection.query(`
      INSERT INTO orders (
        order_number, user_id, address_id, subtotal, gst_amount, shipping_amount, grand_total, payment_status, order_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ORDER_PLACED', NOW(), NOW())
    `, [order_number, userId, address_id, subtotal, gst_amount, shipping_amount, grand_total, payStatus]);
    const order_id = orderResult.insertId;

    // Step 5: Insert order items
    for (const item of cartItems) {
      let custom_measurement = null;
      if (item.is_custom) {
        const pTypeName = (item.pro_type_name || "").toLowerCase();
        const isBlazer = pTypeName === "blazers" || pTypeName === "blazer" || item.pro_type_id === 21;
        if (isBlazer) {
          custom_measurement = JSON.stringify({
            shoulder: item.custom_shoulder,
            chest: item.custom_chest,
            shirt_length: item.custom_length,
            sleeve_length: item.custom_sleeve,
            mid_section: item.custom_waist
          });
        } else {
          custom_measurement = JSON.stringify({
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
          });
        }
      }

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

    // Step 6: Insert payment record
    await connection.query(`
      INSERT INTO payments (
        order_id, user_id, gateway_name, transaction_id, payment_method, amount, currency, payment_status, paid_at, created_at
      ) VALUES (?, ?, 'TEST', ?, ?, ?, 'INR', ?, ?, NOW())
    `, [order_id, userId, transaction_id, payment_method, grand_total, payTxStatus, paidAt]);

    // Step 7: Insert first status history
    await connection.query(`
      INSERT INTO order_status_history (
        order_id, status, remarks, created_at
      ) VALUES (?, 'ORDER_PLACED', 'Order Placed and Confirmed', NOW())
    `, [order_id]);

    // Step 8: Create shipment details
    const expected_delivery = new Date();
    expected_delivery.setDate(expected_delivery.getDate() + 5);

    await connection.query(`
      INSERT INTO shipment_details (
        order_id, shipment_status, expected_delivery, created_at
      ) VALUES (?, 'Pending', ?, NOW())
    `, [order_id, expected_delivery]);

    // Step 9: Clear cart items
    await connection.query("DELETE FROM cart WHERE user_id = ?", [userId]);

    // Commit Transaction
    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Order placed successfully.",
      data: {
        order_number,
        order_id
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ Place Order Transaction Failure:", error);
    return res.status(500).json({ success: false, message: "Database transaction failure.", error: error.message });
  } finally {
    connection.release();
  }
};

// =========================================================
// 2. GET USER ORDERS
// =========================================================
const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;

    const [orders] = await ConnectDB.query(`
      SELECT o.*, sd.expected_delivery, sd.shipment_status, sd.awb_number
      FROM orders o
      LEFT JOIN shipment_details sd ON o.order_id = sd.order_id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
    `, [userId]);

    for (const order of orders) {
      order.products = await getOrderItemsWithMonograms(order.order_id);

      // Real-time resolution of Delhivery status without making new API calls
      // Do not override if the order is already cancelled
      if (order.awb_number && order.shipment_status && order.order_status !== 'CANCELLED') {
        const normalized_status = delhiveryService.normalizeDelhiveryStatus(order.shipment_status);
        if (normalized_status) {
          order.order_status = normalized_status;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "User orders fetched successfully.",
      data: orders
    });
  } catch (error) {
    console.error("❌ Get User Orders Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

// =========================================================
// 3. GET SINGLE ORDER
// =========================================================
const getSingleOrder = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const { orderNumber } = req.params;

    console.log("========================================");
    console.log("[VIEW DETAILS TRIGGER] Backend endpoint reached");
    console.log("[VIEW DETAILS TRIGGER] Order:", orderNumber);
    console.log("========================================");

    const isNumeric = /^\d+$/.test(orderNumber);
    const queryStr = isNumeric
      ? "SELECT * FROM orders WHERE order_id = ?"
      : "SELECT * FROM orders WHERE order_number = ?";

    const [orders] = await ConnectDB.query(queryStr, [orderNumber]);

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const order = orders[0];

    // Security Check: skip if user is admin
    const isAdmin = req.user.email === 'admin@fabricluxure.com';
    if (!isAdmin && order.user_id !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized access to this order." });
    }

    // Fetch cancellation info if exists
    const [cancellationRows] = await ConnectDB.query(
      "SELECT refund_status FROM order_cancellations WHERE order_id = ?",
      [order.order_id]
    );
    const refund_status = cancellationRows[0]?.refund_status || null;

    // Fetch products
    const products = await getOrderItemsWithMonograms(order.order_id);

    // Dynamic stitching is removed, use order.stitching_amount from DB directly

    // Fetch customer email
    const [userRows] = await ConnectDB.query(
      "SELECT email FROM users WHERE user_id = ?",
      [order.user_id]
    );
    const customer_email = userRows[0]?.email || null;

    // Fetch address (6. Address)
    const [addressRows] = await ConnectDB.query(
      "SELECT * FROM user_addresses WHERE address_id = ?",
      [order.address_id]
    );
    const address = addressRows[0] || null;

    // Fetch payment (5. Payment details)
    const [paymentRows] = await ConnectDB.query(
      "SELECT * FROM payments WHERE order_id = ?",
      [order.order_id]
    );
    const payment = paymentRows[0] || null;

    // Fetch status timeline
    const [timeline] = await ConnectDB.query(
      "SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC",
      [order.order_id]
    );

    // Fetch shipment details (7. Shipment Details)
    const [shipmentRows] = await ConnectDB.query(
      "SELECT * FROM shipment_details WHERE order_id = ?",
      [order.order_id]
    );
    let shipment = shipmentRows[0] || null;

    let scans = [];
    const provider = (shipment && shipment.shipping_provider) ? ShippingFactory.getProvider(shipment.shipping_provider) : ShippingFactory.getProvider('DELHIVERY');

    if (!shipment) {
      console.log("[SHIPMENT SYNC] SKIPPED — No shipment record");
      console.log("[SHIPMENT SYNC] No AWB exists. Skipping tracking sync.");
    } else if (!shipment.awb_number) {
      console.log("[SHIPMENT SYNC] SKIPPED — No AWB number");
      console.log("[SHIPMENT SYNC] No AWB exists. Skipping tracking sync.");
    } else {
      console.log(`[SHIPMENT SYNC] AWB found: ${shipment.awb_number}`);
      // Do not sync if order is in a terminal state
      const isTerminal = order.order_status === "CANCELLED" || order.order_status === "DELIVERED" || order.order_status === "REFUNDED";

      if (isTerminal) {
        console.log("[SHIPMENT SYNC] Terminal order status. Skipping tracking sync.");
        if (order.order_status === "CANCELLED") console.log("[SHIPMENT SYNC] SKIPPED — Order already CANCELLED");
        if (order.order_status === "DELIVERED") console.log("[SHIPMENT SYNC] SKIPPED — Order already DELIVERED");
        if (order.order_status === "REFUNDED") console.log("[SHIPMENT SYNC] SKIPPED — Order already REFUNDED");
      } else {
        console.log(`[SHIPMENT SYNC] Calling LIVE ${shipment.shipping_provider || 'DELHIVERY'} tracking API...`);
        try {
          const syncResult = await provider.syncShipment(shipment);
          const rawStatus = (syncResult && syncResult.rawStatus) || shipment.shipment_status;
          const normalizedStatus = (syncResult && syncResult.normalizedStatus) || order.order_status;
          const prevStatus = shipment.shipment_status;
          const changed = syncResult ? syncResult.statusChanged : false;
          const rawResponse = syncResult ? syncResult.rawResponse : null;

          console.log(`[SHIPMENT SYNC] Raw ${shipment.shipping_provider || 'DELHIVERY'} response: ${JSON.stringify(rawResponse)}`);
          console.log(`[SHIPMENT SYNC] Raw ${shipment.shipping_provider || 'DELHIVERY'} status: ${rawStatus}`);
          console.log(`[SHIPMENT SYNC] Previous DB status: ${prevStatus}`);
          console.log(`[SHIPMENT SYNC] Normalized status: ${normalizedStatus}`);
          console.log(`[SHIPMENT SYNC] Status changed: ${changed}`);
          console.log(`[SHIPMENT SYNC] Completed`);

          if (syncResult && syncResult.success) {
            // Reload shipment details
            const [updatedShipmentRows] = await ConnectDB.query(
              "SELECT * FROM shipment_details WHERE order_id = ?",
              [order.order_id]
            );
            shipment = updatedShipmentRows[0];
            scans = syncResult.scans || [];

            // Fetch updated status history timeline
            const [newTimeline] = await ConnectDB.query(
              "SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC",
              [order.order_id]
            );
            timeline.length = 0;
            timeline.push(...newTimeline);

            // Reload order object to reflect changes from sync (like updated order_status)
            const [updatedOrders] = await ConnectDB.query(
              "SELECT * FROM orders WHERE order_id = ?",
              [order.order_id]
            );
            if (updatedOrders.length > 0) {
              Object.assign(order, updatedOrders[0]);
            }
          }
        } catch (syncErr) {
          console.error("❌ Failed to sync tracking details in order details load:", syncErr.message);
        }
      }
    }

    const normalized_status = shipment && shipment.awb_number
      ? provider.normalizeStatus(shipment.shipment_status)
      : null;

    let display_status = order.order_status;
    if (order.order_status !== 'CANCELLED') {
      display_status = shipment && shipment.awb_number
        ? normalized_status
        : translateDbStatusToFriendly(order.order_status);
    } else {
      display_status = translateDbStatusToFriendly(order.order_status);
    }

    const deliveryTimeline = provider.buildDeliveryTimeline(order, shipment, scans, timeline);

    return res.status(200).json({
      success: true,
      message: "Order details fetched successfully.",
      data: {
        order_id: order.order_id,
        order_number: order.order_number,
        order_status: display_status,
        display_status,
        expected_delivery: shipment ? shipment.expected_delivery : null,
        payment_status: order.payment_status,
        refund_status,
        customer_email,
        grand_total: order.grand_total,
        created_at: order.created_at,
        subtotal: order.subtotal,
        gst_amount: order.gst_amount,
        stitching_amount: order.stitching_amount,
        shipping_amount: order.shipping_amount,
        products: products.map(item => {
          let parsedImg = item.product_image;
          if (typeof parsedImg === 'string') {
            try {
              const arr = JSON.parse(parsedImg);
              parsedImg = Array.isArray(arr) && arr.length > 0 ? arr[0] : parsedImg;
            } catch (e) {
              // Not JSON, leave as is
            }
          }
          return {
            product_name: item.product_name,
            product_image: parsedImg,
            fit_style: item.fit_style,
            selected_size: item.selected_size,
            selected_length: item.selected_length,
            selected_sleeve: item.selected_sleeve,
            custom_measurement: item.custom_measurement,
            quantity: item.quantity,
            price: item.price,
            monogram: item.monogram
          };
        }),
        address: address ? {
          fullName: address.full_name,
          mobile: address.mobile,
          alternateMobile: address.alternate_mobile,
          houseBuilding: address.house_building,
          streetLocality: address.street_locality,
          landmark: address.landmark,
          city: address.city,
          state: address.state,
          postalCode: address.postal_code,
          country: address.country,
          addressType: address.address_type
        } : null,
        payment: payment ? (() => {
          let determinedPaymentType = "GATEWAY";
          if (parseFloat(payment.wallet_amount || 0) > 0 && parseFloat(payment.gateway_amount || 0) > 0) {
            determinedPaymentType = "MIXED";
          } else if (payment.payment_method === "WALLET" || payment.gateway_name === "WALLET") {
            determinedPaymentType = "WALLET";
          } else if (payment.payment_type) {
            determinedPaymentType = payment.payment_type;
          }
          return {
            gateway_name: payment.gateway_name,
            transaction_id: payment.transaction_id,
            payment_method: payment.payment_method,
            bank_name: payment.bank_name,
            payment_status: payment.payment_status,
            amount: payment.amount,
            currency: payment.currency,
            payment_type: determinedPaymentType,
            wallet_amount: parseFloat(payment.wallet_amount || 0),
            gateway_amount: parseFloat(payment.gateway_amount || 0)
          };
        })() : null,
        timeline,
        delivery_timeline: deliveryTimeline,
        shipment: shipment ? {
          shipment_status: shipment.shipment_status,
          normalized_status,
          expected_delivery: shipment.expected_delivery,
          delivered_date: shipment.delivered_date,
          tracking_url: shipment.tracking_url,
          awb_number: shipment.awb_number,
          courier_name: shipment.courier_name,
          last_tracking_sync: shipment.last_tracking_sync
        } : null
      }
    });
  } catch (error) {
    console.error("❌ Get Single Order Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

// =========================================================
// 4. GET ORDER STATUS TIMELINE
// =========================================================
const getOrderTimeline = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const { orderNumber } = req.params;

    const isNumeric = /^\d+$/.test(orderNumber);
    const queryStr = isNumeric
      ? "SELECT order_id, user_id FROM orders WHERE order_id = ?"
      : "SELECT order_id, user_id FROM orders WHERE order_number = ?";

    const [orders] = await ConnectDB.query(queryStr, [orderNumber]);

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const order = orders[0];

    // Security Check: skip if user is admin
    const isAdmin = req.user.email === 'admin@fabricluxure.com';
    if (!isAdmin && order.user_id !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized access to this order timeline." });
    }

    const [timeline] = await ConnectDB.query(
      "SELECT status, remarks, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC",
      [order.order_id]
    );

    return res.status(200).json({
      success: true,
      message: "Order timeline fetched successfully.",
      data: timeline
    });
  } catch (error) {
    console.error("❌ Get Order Timeline Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

// =========================================================
// ADMIN: GET GENERAL STATS
// =========================================================
const getAdminDashboard = async (req, res) => {
  try {
    const [totalOrders] = await ConnectDB.query("SELECT COUNT(*) AS total FROM orders");
    const [todayOrders] = await ConnectDB.query("SELECT COUNT(*) AS total FROM orders WHERE DATE(created_at) = CURDATE()");
    const [pendingOrders] = await ConnectDB.query("SELECT COUNT(*) AS total FROM orders WHERE order_status NOT IN ('Delivered', 'Cancelled')");
    const [deliveredOrders] = await ConnectDB.query("SELECT COUNT(*) AS total FROM orders WHERE order_status = 'Delivered'");
    const [cancelledOrders] = await ConnectDB.query("SELECT COUNT(*) AS total FROM orders WHERE order_status = 'Cancelled'");
    const [revenue] = await ConnectDB.query("SELECT SUM(grand_total) AS total FROM orders WHERE payment_status = 'Paid'");
    const [aov] = await ConnectDB.query("SELECT AVG(grand_total) AS total FROM orders WHERE payment_status = 'Paid'");
    const [customers] = await ConnectDB.query("SELECT COUNT(DISTINCT user_id) AS total FROM orders");

    return res.status(200).json({
      success: true,
      message: "Admin dashboard stats fetched successfully.",
      data: {
        totalOrders: totalOrders[0]?.total || 0,
        todayOrders: todayOrders[0]?.total || 0,
        pendingOrders: pendingOrders[0]?.total || 0,
        deliveredOrders: deliveredOrders[0]?.total || 0,
        cancelledOrders: cancelledOrders[0]?.total || 0,
        revenue: Number(revenue[0]?.total || 0),
        aov: Number(aov[0]?.total || 0).toFixed(2),
        totalCustomers: customers[0]?.total || 0
      }
    });
  } catch (error) {
    console.error("❌ Admin Dashboard Stats Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

// =========================================================
// ADMIN: GET SALES DASHBOARD & CHARTS
// =========================================================
const getAdminSalesDashboard = async (req, res) => {
  try {
    const { product_type = 'All' } = req.query;

    let joinQuery = `
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.order_id
      INNER JOIN product_master pm ON oi.product_id = pm.pro_id
      LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
      LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
      WHERE o.payment_status = 'Paid'
    `;

    if (product_type === 'Shirts') {
      joinQuery += " AND (LOWER(pt.product_type) LIKE '%shirt%' OR oi.fit_style IS NOT NULL OR oi.selected_size IS NOT NULL)";
    } else if (product_type === 'Towels') {
      joinQuery += " AND (LOWER(pt.product_type) LIKE '%towel%' OR oi.selected_length IS NOT NULL)";
    }

    // Total Sales
    const [totalSales] = await ConnectDB.query(`SELECT SUM(oi.price * oi.quantity) AS total ${joinQuery}`);

    // Today's Sales
    const [todaySales] = await ConnectDB.query(`SELECT SUM(oi.price * oi.quantity) AS total ${joinQuery} AND DATE(o.created_at) = CURDATE()`);

    // Weekly Sales
    const [weeklySales] = await ConnectDB.query(`SELECT SUM(oi.price * oi.quantity) AS total ${joinQuery} AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);

    // Monthly Sales
    const [monthlySales] = await ConnectDB.query(`SELECT SUM(oi.price * oi.quantity) AS total ${joinQuery} AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);

    // Yearly Sales
    const [yearlySales] = await ConnectDB.query(`SELECT SUM(oi.price * oi.quantity) AS total ${joinQuery} AND o.created_at >= DATE_SUB(NOW(), INTERVAL 365 DAY)`);

    // Average Order Value (AOV) for this subset
    const [aovQuery] = await ConnectDB.query(`
      SELECT AVG(order_total) AS total FROM (
        SELECT SUM(oi.price * oi.quantity) AS order_total
        ${joinQuery}
        GROUP BY o.order_id
      ) t
    `);

    // Charts: Daily sales (last 7 days)
    const [dailySales] = await ConnectDB.query(`
      SELECT DATE(o.created_at) as date, SUM(oi.price * oi.quantity) as sales
      ${joinQuery} AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(o.created_at)
      ORDER BY DATE(o.created_at) ASC
    `);

    // Charts: Monthly sales (last 12 months)
    const [monthlyTrend] = await ConnectDB.query(`
      SELECT DATE_FORMAT(o.created_at, '%Y-%m') as month, SUM(oi.price * oi.quantity) as sales
      ${joinQuery} AND o.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')
      ORDER BY DATE_FORMAT(o.created_at, '%Y-%m') ASC
    `);

    // Charts: Order Status distribution
    const [statusDistribution] = await ConnectDB.query(`
      SELECT o.order_status as status, COUNT(DISTINCT o.order_id) as count
      ${joinQuery}
      GROUP BY o.order_status
    `);

    // Charts: Product Type Distribution
    const [typeDistribution] = await ConnectDB.query(`
      SELECT COALESCE(pt.product_type, 'Unclassified') as type, SUM(oi.price * oi.quantity) as sales
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.order_id
      INNER JOIN product_master pm ON oi.product_id = pm.pro_id
      LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
      LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
      WHERE o.payment_status = 'Paid'
      GROUP BY pt.product_type
    `);

    return res.status(200).json({
      success: true,
      message: "Admin sales dashboard stats fetched successfully.",
      data: {
        summary: {
          totalSales: Number(totalSales[0]?.total || 0),
          todaySales: Number(todaySales[0]?.total || 0),
          weeklySales: Number(weeklySales[0]?.total || 0),
          monthlySales: Number(monthlySales[0]?.total || 0),
          yearlySales: Number(yearlySales[0]?.total || 0),
          aov: Number(aovQuery[0]?.total || 0).toFixed(2)
        },
        charts: {
          dailySales,
          monthlyTrend,
          statusDistribution,
          typeDistribution
        }
      }
    });
  } catch (error) {
    console.error("❌ Admin Sales Dashboard Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

// =========================================================
// ADMIN: GET ORDERS LIST WITH FILTERS & SEARCH
// =========================================================
const getAdminOrdersList = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = 'All',
      payment = 'All',
      product_type = 'All',
      date_range = 'All',
      start_date,
      end_date
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    let queryParams = [];
    let whereClauses = [];

    // Search
    if (search) {
      whereClauses.push(`(
        o.order_number LIKE ? OR
        ua.full_name LIKE ? OR
        ua.mobile LIKE ? OR
        u.email LIKE ?
      )`);
      const val = `%${search}%`;
      queryParams.push(val, val, val, val);
    }

    // Status Filter
    if (status !== 'All') {
      whereClauses.push("o.order_status = ?");
      queryParams.push(status);
    }

    // Payment Filter
    if (payment !== 'All') {
      whereClauses.push("o.payment_status = ?");
      queryParams.push(payment);
    }

    // Product Type Filter
    if (product_type === 'Shirts') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM order_items oi
        INNER JOIN product_master pm ON oi.product_id = pm.pro_id
        LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
        LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
        WHERE oi.order_id = o.order_id AND (LOWER(pt.product_type) LIKE '%shirt%' OR oi.fit_style IS NOT NULL OR oi.selected_size IS NOT NULL)
      )`);
    } else if (product_type === 'Towels') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM order_items oi
        INNER JOIN product_master pm ON oi.product_id = pm.pro_id
        LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
        LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
        WHERE oi.order_id = o.order_id AND (LOWER(pt.product_type) LIKE '%towel%' OR oi.selected_length IS NOT NULL)
      )`);
    }

    // Date Range Filter
    if (date_range === 'Today') {
      whereClauses.push("DATE(o.created_at) = CURDATE()");
    } else if (date_range === 'Yesterday') {
      whereClauses.push("DATE(o.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)");
    } else if (date_range === 'Last 7 Days') {
      whereClauses.push("o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
    } else if (date_range === 'Last 30 Days') {
      whereClauses.push("o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
    } else if (date_range === 'Custom' && start_date && end_date) {
      whereClauses.push("DATE(o.created_at) BETWEEN ? AND ?");
      queryParams.push(start_date, end_date);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : '';

    // Count query
    const [countRows] = await ConnectDB.query(`
      SELECT COUNT(DISTINCT o.order_id) AS total
      FROM orders o
      LEFT JOIN user_addresses ua ON o.address_id = ua.address_id
      LEFT JOIN users u ON o.user_id = u.user_id
      ${whereSql}
    `, queryParams);

    const total = countRows[0]?.total || 0;

    // Fetch list newest first
    const listQuery = `
      SELECT o.*, COALESCE(u.name, ua.full_name) as customer_name, ua.mobile as customer_mobile, u.email as customer_email,
             sd.expected_delivery, sd.shipment_status,
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.order_id) as products_count
      FROM orders o
      LEFT JOIN user_addresses ua ON o.address_id = ua.address_id
      LEFT JOIN users u ON o.user_id = u.user_id
      LEFT JOIN shipment_details sd ON o.order_id = sd.order_id
      ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [listRows] = await ConnectDB.query(listQuery, [...queryParams, Number(limit), Number(offset)]);

    return res.status(200).json({
      success: true,
      message: "Admin orders list fetched successfully.",
      data: {
        orders: listRows,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error("❌ Get Admin Orders List Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

// =========================================================
// ADMIN: UPDATE ORDER STATUS
// =========================================================
const updateOrderStatus = async (req, res) => {
  const connection = await ConnectDB.getConnection();
  try {
    const { orderId } = req.params;
    const { status, remarks = '' } = req.body;

    const validStatuses = ['ORDER_PLACED', 'SELLER_PREPARING', 'ON_THE_WAY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value." });
    }

    await connection.beginTransaction();

    // Check if order exists
    const [orders] = await connection.query("SELECT * FROM orders WHERE order_id = ?", [orderId]);
    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    // Update order status
    await connection.query(
      "UPDATE orders SET order_status = ?, updated_at = NOW() WHERE order_id = ?",
      [status, orderId]
    );

    // Insert history timeline
    await connection.query(
      "INSERT INTO order_status_history (order_id, status, remarks, created_at) VALUES (?, ?, ?, NOW())",
      [orderId, status, remarks || `Status updated to ${status}`]
    );

    // Update shipment details if exists
    const [shipments] = await connection.query("SELECT * FROM shipment_details WHERE order_id = ?", [orderId]);
    if (shipments.length > 0) {
      let shipmentStatus = 'Pending';
      if (status === 'Shipped') shipmentStatus = 'Shipped';
      else if (status === 'ON_THE_WAY') shipmentStatus = 'Out For Delivery';
      else if (status === 'OUT_FOR_DELIVERY') shipmentStatus = 'Out For Delivery';
      else if (status === 'DELIVERED') shipmentStatus = 'Delivered';
      else if (status === 'CANCELLED') shipmentStatus = 'Cancelled';

      let updateQuery = "UPDATE shipment_details SET shipment_status = ?";
      let params = [shipmentStatus];

      if (status === 'Delivered') {
        updateQuery += ", delivered_date = NOW()";
      }

      updateQuery += " WHERE order_id = ?";
      params.push(orderId);

      await connection.query(updateQuery, params);
    }

    // Restore stock if cancelled
    if (status === 'CANCELLED' && orders[0].order_status !== 'CANCELLED') {
      const [orderItems] = await connection.query("SELECT product_id, quantity, selected_length FROM order_items WHERE order_id = ?", [orderId]);

      for (const item of orderItems) {
        const [productStockData] = await connection.query("SELECT stock_quantity, stock_unit FROM product_master WHERE pro_id = ?", [item.product_id]);
        if (productStockData.length > 0) {
          const stockUnit = productStockData[0].stock_unit;
          const restoreAmt = stockUnit === 'METER' ? item.quantity * parseFloat(item.selected_length || "1") : item.quantity;
          await connection.query("UPDATE product_master SET stock_quantity = stock_quantity + ? WHERE pro_id = ?", [restoreAmt, item.product_id]);
        }
      }
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: `Order status updated to ${status} successfully.`,
      data: { orderId, status }
    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ Update Order Status Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  } finally {
    connection.release();
  }
};

// =========================================================
// ADMIN: UPDATE ORDER SHIPMENT DETAILS
// =========================================================
const updateOrderShipment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { courier_name, awb_number, tracking_url, expected_delivery, delivered_date, shipment_status } = req.body;

    const [shipments] = await ConnectDB.query("SELECT * FROM shipment_details WHERE order_id = ?", [orderId]);
    if (shipments.length === 0) {
      await ConnectDB.query(`
        INSERT INTO shipment_details (
          order_id, courier_name, awb_number, tracking_url, expected_delivery, delivered_date, shipment_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `, [orderId, courier_name || null, awb_number || null, tracking_url || null, expected_delivery || null, delivered_date || null, shipment_status || 'Pending']);
    } else {
      await ConnectDB.query(`
        UPDATE shipment_details
        SET courier_name = ?, awb_number = ?, tracking_url = ?, expected_delivery = ?, delivered_date = ?, shipment_status = ?
        WHERE order_id = ?
      `, [courier_name || null, awb_number || null, tracking_url || null, expected_delivery || null, delivered_date || null, shipment_status || 'Pending', orderId]);
    }

    return res.status(200).json({
      success: true,
      message: "Shipment details updated successfully."
    });
  } catch (error) {
    console.error("❌ Update Shipment Details Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

// =========================================================
// ADMIN: ANALYTICS WIDGETS
// =========================================================
const getAdminAnalytics = async (req, res) => {
  try {
    // Top selling overall
    const [topSelling] = await ConnectDB.query(`
      SELECT product_name, SUM(quantity) as quantity_sold, SUM(price * quantity) as revenue
      FROM order_items
      GROUP BY product_name
      ORDER BY quantity_sold DESC LIMIT 5
    `);

    // Top selling shirts
    const [topShirts] = await ConnectDB.query(`
      SELECT oi.product_name, SUM(oi.quantity) as quantity_sold
      FROM order_items oi
      INNER JOIN product_master pm ON oi.product_id = pm.pro_id
      LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
      LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
      WHERE (LOWER(pt.product_type) LIKE '%shirt%' OR oi.fit_style IS NOT NULL OR oi.selected_size IS NOT NULL)
      GROUP BY oi.product_name
      ORDER BY quantity_sold DESC LIMIT 5
    `);

    // Top selling towels
    const [topTowels] = await ConnectDB.query(`
      SELECT oi.product_name, SUM(oi.quantity) as quantity_sold
      FROM order_items oi
      INNER JOIN product_master pm ON oi.product_id = pm.pro_id
      LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
      LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
      WHERE (LOWER(pt.product_type) LIKE '%towel%' OR oi.selected_length IS NOT NULL)
      GROUP BY oi.product_name
      ORDER BY quantity_sold DESC LIMIT 5
    `);

    // Most ordered category
    const [mostOrderedCat] = await ConnectDB.query(`
      SELECT pc.cat_name, COUNT(oi.order_item_id) as count
      FROM order_items oi
      INNER JOIN product_master pm ON oi.product_id = pm.pro_id
      INNER JOIN product_category pc ON pm.cat_id = pc.cat_id
      GROUP BY pc.cat_id
      ORDER BY count DESC LIMIT 1
    `);

    // Highest Revenue Product
    const [highestRev] = await ConnectDB.query(`
      SELECT product_name, SUM(price * quantity) as revenue
      FROM order_items
      GROUP BY product_name
      ORDER BY revenue DESC LIMIT 1
    `);

    // Lowest Revenue Product
    const [lowestRev] = await ConnectDB.query(`
      SELECT product_name, SUM(price * quantity) as revenue
      FROM order_items
      GROUP BY product_name
      ORDER BY revenue ASC LIMIT 1
    `);

    // Top Customers
    const [topCustomers] = await ConnectDB.query(`
      SELECT u.name, u.email, COUNT(o.order_id) as orders_count, SUM(o.grand_total) as total_spent
      FROM orders o
      INNER JOIN users u ON o.user_id = u.user_id
      GROUP BY o.user_id
      ORDER BY total_spent DESC LIMIT 5
    `);

    // Repeat Customers
    const [repeatCustomers] = await ConnectDB.query(`
      SELECT COUNT(*) as repeat_count FROM (
        SELECT user_id FROM orders GROUP BY user_id HAVING COUNT(order_id) > 1
      ) t
    `);

    // Average Delivery Time (Delivered Date - Created At in hours/days)
    const [avgDelivery] = await ConnectDB.query(`
      SELECT AVG(TIMESTAMPDIFF(HOUR, o.created_at, sd.delivered_date)) as avg_hours
      FROM orders o
      INNER JOIN shipment_details sd ON o.order_id = sd.order_id
      WHERE o.order_status = 'Delivered' AND sd.delivered_date IS NOT NULL
    `);

    return res.status(200).json({
      success: true,
      message: "Admin analytics widgets fetched successfully.",
      data: {
        topSelling,
        topShirts,
        topTowels,
        mostOrderedCategory: mostOrderedCat[0] || null,
        highestRevenueProduct: highestRev[0] || null,
        lowestRevenueProduct: lowestRev[0] || null,
        topCustomers,
        repeatCustomers: repeatCustomers[0]?.repeat_count || 0,
        averageDeliveryTimeHours: Number(avgDelivery[0]?.avg_hours || 0).toFixed(1)
      }
    });
  } catch (error) {
    console.error("❌ Admin Analytics widgets Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

// Initiate payment session by generating simulator url (ICICI Bank Simulation)
const initiatePayment = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const { address_id, payment_method } = req.body;

    if (!address_id) {
      return res.status(400).json({ success: false, message: "Address ID is required." });
    }
    if (!payment_method) {
      return res.status(400).json({ success: false, message: "Payment method is required." });
    }

    // Fetch active cart items of the user
    const [cartItems] = await ConnectDB.query(
      "SELECT c.*, pm.price FROM cart c INNER JOIN product_master pm ON c.pro_id = pm.pro_id WHERE c.user_id = ?",
      [userId]
    );

    if (cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty." });
    }

    const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    const paymentUrl = `${backendUrl}/api/orders/simulate-gateway?address_id=${address_id}&payment_method=${encodeURIComponent(payment_method)}&userId=${userId}`;

    return res.status(200).json({
      success: true,
      payment_url: paymentUrl
    });
  } catch (err) {
    console.error("Error initiating payment:", err);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// Render bank simulation portal
const simulateGateway = async (req, res) => {
  const { address_id, payment_method, userId } = req.query;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>ICICI Bank Secure Payment Gateway</title>
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
          max-width: 400px;
          width: 100%;
          text-align: center;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }
        .bank-logo {
          font-size: 24px;
          font-weight: bold;
          color: #D4AF37;
          margin-bottom: 24px;
          letter-spacing: 1px;
        }
        .amount {
          font-size: 32px;
          font-weight: bold;
          margin: 16px 0;
          color: #ffffff;
        }
        .btn {
          background-color: #4B6EBD;
          color: #ffffff;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: bold;
          cursor: pointer;
          width: 100%;
          font-size: 16px;
          transition: background 0.2s;
        }
        .btn:hover {
          background-color: #3b5cb0;
        }
        .cancel-btn {
          background: transparent;
          color: #a0aec0;
          border: none;
          margin-top: 16px;
          cursor: pointer;
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="bank-logo">ICICI BANK</div>
        <p style="color: #a0aec0; font-size: 14px; text-transform: uppercase;">Secure Payment Gateway</p>
        <p style="font-size: 14px;">Method: <strong>${payment_method ? payment_method.toUpperCase() : 'Card'}</strong></p>
        <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;"></div>
        <form action="/api/orders/payment-callback" method="GET">
          <input type="hidden" name="address_id" value="${address_id || ''}">
          <input type="hidden" name="payment_method" value="${payment_method || ''}">
          <input type="hidden" name="userId" value="${userId || ''}">
          <input type="hidden" name="status" value="success">
          <button type="submit" class="btn">Authorize & Pay Securely</button>
        </form>
        <button class="cancel-btn" onclick="window.history.back()">Cancel Transaction</button>
      </div>
    </body>
    </html>
  `;
  res.setHeader("Content-Type", "text/html");
  return res.send(html);
};

// Payment callback/webhook handler to execute order creation
const paymentCallback = async (req, res) => {
  const connection = await ConnectDB.getConnection();
  try {
    const { address_id, payment_method, userId, status } = req.query;

    if (status !== "success") {
      return res.redirect(`${process.env.FRONTEND_URL}/order-summary?error=payment_failed`);
    }

    await connection.beginTransaction();

    // Verify address
    const [addressRows] = await connection.query(
      "SELECT * FROM user_addresses WHERE address_id = ? AND user_id = ?",
      [address_id, userId]
    );
    if (addressRows.length === 0) {
      await connection.rollback();
      return res.redirect(`${process.env.FRONTEND_URL}/order-summary?error=invalid_address`);
    }

    // Step 1: Fetch active cart items of the user
    const [cartItems] = await connection.query(`
      SELECT c.*, pm.pro_name, pm.price, pm.pro_img, pm.cover_description, pm.is_deleted, pm.stock_unit, pm.stitching_price
      FROM cart c
      INNER JOIN product_master pm ON c.pro_id = pm.pro_id
      WHERE c.user_id = ?
    `, [userId]);

    if (cartItems.length === 0) {
      await connection.rollback();
      return res.redirect(`${process.env.FRONTEND_URL}/order-summary?error=empty_cart`);
    }

    for (const item of cartItems) {
      if (item.price === undefined || item.price === null || item.is_deleted === 1) {
        await connection.rollback();
        return res.redirect(`${process.env.FRONTEND_URL}/order-summary?error=invalid_product`);
      }

      if (item.monogram_enabled) {
        if (!item.monogram_text || item.monogram_text.length > 4) {
          await connection.rollback();
          return res.redirect(`${process.env.FRONTEND_URL}/order-summary?error=invalid_monogram`);
        }
        const [[placement]] = await connection.query("SELECT placement_id FROM monogram_placements WHERE placement_id = ?", [item.monogram_placement_id]);
        const [[color]] = await connection.query("SELECT color_id FROM monogram_colors WHERE color_id = ?", [item.monogram_color_id]);
        const [[font]] = await connection.query("SELECT font_id FROM monogram_fonts WHERE font_id = ?", [item.monogram_font_id]);

        if (!placement || !color || !font) {
          await connection.rollback();
          return res.redirect(`${process.env.FRONTEND_URL}/order-summary?error=invalid_monogram`);
        }
      }
    }

    // Step 2: Calculate prices
    const subtotal = cartItems.reduce(
      (acc, item) => {
        let basePrice = Number(item.price || 0);
        if (item.stock_unit === 'METER') {
          basePrice = basePrice * Number(item.selected_meter || 1);
        }
        const extraPrice = item.monogram_enabled ? Number(item.monogram_price || 0) : 0;
        return acc + ((basePrice + extraPrice) * Number(item.quantity || 1));
      },
      0
    );
    const gst_amount = Number((subtotal * 0.05).toFixed(2));

    // Dynamic stitching amount calculation for grand total
    const dynamicStitching = Number(cartItems.reduce((acc, item) => {
      let basePrice = Number(item.price || 0);
      if (item.stock_unit === 'METER') {
        basePrice = basePrice * Number(item.selected_meter || 1);
      }
      const itemBaseTotal = basePrice * Number(item.quantity || 1);
      const percentage = Number(item.stitching_price) || 0;
      return acc + (percentage > 0 ? (itemBaseTotal * percentage) / 100 : 0);
    }, 0).toFixed(2));

    const shipping_amount = 0;
    const grand_total = Number((subtotal + gst_amount + dynamicStitching + shipping_amount).toFixed(2));

    // Step 3: Generate Incrementing Order Number FL202600001
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

    // Step 4: Insert into orders table
    const [orderResult] = await connection.query(`
      INSERT INTO orders (
        order_number, user_id, address_id, subtotal, gst_amount, shipping_amount, grand_total, payment_status, order_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Paid', 'ORDER_PLACED', NOW(), NOW())
    `, [order_number, userId, address_id, subtotal, gst_amount, shipping_amount, grand_total]);
    const order_id = orderResult.insertId;

    // Step 5: Insert order items
    for (const item of cartItems) {
      let custom_measurement = null;
      if (item.is_custom) {
        const pTypeName = (item.pro_type_name || "").toLowerCase();
        const isBlazer = pTypeName === "blazers" || pTypeName === "blazer" || item.pro_type_id === 21;
        if (isBlazer) {
          custom_measurement = JSON.stringify({
            shoulder: item.custom_shoulder,
            chest: item.custom_chest,
            shirt_length: item.custom_length,
            sleeve_length: item.custom_sleeve,
            mid_section: item.custom_waist
          });
        } else {
          custom_measurement = JSON.stringify({
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
          });
        }
      }

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
    }

    // Step 6: Insert payment record
    const txn_id = `txn_online_${Date.now()}`;
    await connection.query(`
      INSERT INTO payments (
        order_id, user_id, gateway_name, transaction_id, payment_method, amount, currency, payment_status, paid_at, created_at
      ) VALUES (?, ?, 'ICICI_BANK', ?, ?, ?, 'INR', 'Success', NOW(), NOW())
    `, [order_id, userId, txn_id, payment_method, grand_total]);

    // Step 7: Insert first status history
    await connection.query(`
      INSERT INTO order_status_history (
        order_id, status, remarks, created_at
      ) VALUES (?, 'ORDER_PLACED', 'Payment successful. Order automatically confirmed.', NOW())
    `, [order_id]);

    // Step 8: Create shipment details
    const expected_delivery = new Date();
    expected_delivery.setDate(expected_delivery.getDate() + 5);

    await connection.query(`
      INSERT INTO shipment_details (
        order_id, shipment_status, expected_delivery, created_at
      ) VALUES (?, 'Pending', ?, NOW())
    `, [order_id, expected_delivery]);

    // Step 9: Clear cart items
    await connection.query("DELETE FROM cart WHERE user_id = ?", [userId]);

    await connection.commit();

    const deliveryDateString = expected_delivery.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    let methodLabel = payment_method;
    if (payment_method === "upi") methodLabel = "Unified Payments Interface (UPI)";
    else if (payment_method === "card_credit") methodLabel = "Credit Card";
    else if (payment_method === "card_debit") methodLabel = "Debit Card";
    else if (payment_method === "netbanking") methodLabel = "Net Banking";

    const successRedirectUrl = `${process.env.FRONTEND_URL}/order-success?orderNumber=${order_number}`;
    return res.redirect(successRedirectUrl);

  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Error in payment callback:", err);
    return res.redirect(`${process.env.FRONTEND_URL}/order-summary?error=server_error`);
  } finally {
    if (connection) connection.release();
  }
};

const getOrderSuccessDetails = async (req, res) => {
  const { orderNumber } = req.params;
  try {
    const [orderRows] = await ConnectDB.query(
      "SELECT order_id, order_number, payment_status, grand_total FROM orders WHERE order_number = ?",
      [orderNumber]
    );

    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found."
      });
    }

    const order = orderRows[0];

    const [paymentRows] = await ConnectDB.query(
      "SELECT payment_method, payment_status, amount FROM payments WHERE order_id = ? ORDER BY payment_id DESC LIMIT 1",
      [order.order_id]
    );
    const payment = paymentRows[0] || null;

    const [shipmentRows] = await ConnectDB.query(
      "SELECT expected_delivery FROM shipment_details WHERE order_id = ?",
      [order.order_id]
    );
    const shipment = shipmentRows[0] || null;

    let expectedDelivery = "N/A";
    if (shipment && shipment.expected_delivery) {
      expectedDelivery = new Date(shipment.expected_delivery).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    } else {
      const estDate = new Date();
      estDate.setDate(estDate.getDate() + 5);
      expectedDelivery = estDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    }

    // Format payment status and method labels nicely
    let methodLabel = payment ? payment.payment_method : "ONLINE";
    if (methodLabel.toLowerCase() === "cod") methodLabel = "Cash On Delivery (COD)";
    else if (methodLabel.toLowerCase() === "upi") methodLabel = "Unified Payments Interface (UPI)";
    else if (methodLabel.toLowerCase() === "card_credit" || methodLabel.toLowerCase() === "credit_card") methodLabel = "Credit Card";
    else if (methodLabel.toLowerCase() === "card_debit" || methodLabel.toLowerCase() === "debit_card") methodLabel = "Debit Card";
    else if (methodLabel.toLowerCase() === "netbanking" || methodLabel.toLowerCase() === "nb") methodLabel = "Net Banking";

    return res.status(200).json({
      success: true,
      orderNumber: order.order_number,
      paymentStatus: order.payment_status,
      paymentMethod: methodLabel,
      amountPaid: order.grand_total,
      expectedDelivery: expectedDelivery
    });

  } catch (err) {
    console.error("❌ Error fetching order success details:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
};

// =========================================================
// GET ADMIN ORDER DETAILS (NO OWNERSHIP CHECKS)
// =========================================================
const getAdminOrderDetails = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const isNumeric = /^\d+$/.test(orderNumber);
    const queryStr = isNumeric
      ? "SELECT * FROM orders WHERE order_id = ?"
      : "SELECT * FROM orders WHERE order_number = ?";

    const [orders] = await ConnectDB.query(queryStr, [orderNumber]);

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const order = orders[0];

    // Fetch products
    const products = await getOrderItemsWithMonograms(order.order_id);

    // Dynamic stitching is removed, use order.stitching_amount from DB directly

    // Fetch customer profile details
    const [userRows] = await ConnectDB.query(
      "SELECT email, name, mobile FROM users WHERE user_id = ?",
      [order.user_id]
    );
    const customer_email = userRows[0]?.email || null;
    const customer_name_profile = userRows[0]?.name || null;
    const customer_phone_profile = userRows[0]?.mobile || null;

    // Fetch address
    const [addressRows] = await ConnectDB.query(
      "SELECT * FROM user_addresses WHERE address_id = ?",
      [order.address_id]
    );
    const address = addressRows[0] || null;

    // Fetch payment
    const [paymentRows] = await ConnectDB.query(
      "SELECT * FROM payments WHERE order_id = ?",
      [order.order_id]
    );
    const payment = paymentRows[0] || null;

    // Fetch status timeline
    const [timeline] = await ConnectDB.query(
      "SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC",
      [order.order_id]
    );

    // Fetch shipment details
    const [shipmentRows] = await ConnectDB.query(
      "SELECT * FROM shipment_details WHERE order_id = ?",
      [order.order_id]
    );
    let shipment = shipmentRows[0] || null;

    let scans = [];
    if (shipment && shipment.awb_number) {
      // Sync fresh status if cache is expired (15 minutes)
      const cacheMinutes = 15;
      const now = new Date();
      const lastSync = shipment.last_tracking_sync ? new Date(shipment.last_tracking_sync) : null;
      const shouldFetchFresh = !lastSync || (now.getTime() - lastSync.getTime() > cacheMinutes * 60 * 1000);

      if (shouldFetchFresh) {
        console.log(` [TRACKING] Syncing fresh tracking data inside admin order fetch for AWB: ${shipment.awb_number}`);
        try {
          const trackingResult = await delhiveryService.getShipmentStatus(shipment.awb_number, order.order_number);
          if (trackingResult.success) {
            await ConnectDB.query(
              `UPDATE shipment_details
               SET shipment_status = ?, pickup_date = ?, expected_delivery = ?, delivered_date = ?, last_tracking_sync = NOW(), updated_at = NOW()
               WHERE order_id = ?`,
              [
                trackingResult.raw_status,
                trackingResult.pickup_date || shipment.pickup_date || null,
                trackingResult.expected_delivery || shipment.expected_delivery || null,
                trackingResult.delivered_date || shipment.delivered_date || null,
                order.order_id
              ]
            );
            // Reload shipment details
            const [updatedShipmentRows] = await ConnectDB.query(
              "SELECT * FROM shipment_details WHERE order_id = ?",
              [order.order_id]
            );
            shipment = updatedShipmentRows[0];
            scans = trackingResult.scans;
          }
        } catch (syncErr) {
          console.error("❌ Failed to sync tracking details in admin order details load:", syncErr.message);
        }
      }
    }

    const normalized_status = shipment && shipment.awb_number
      ? delhiveryService.normalizeDelhiveryStatus(shipment.shipment_status)
      : null;

    const display_status = shipment && shipment.awb_number
      ? normalized_status
      : translateDbStatusToFriendly(order.order_status);

    const deliveryTimeline = delhiveryService.buildDeliveryTimeline(order, shipment, scans, timeline);

    return res.status(200).json({
      success: true,
      message: "Order details fetched successfully by Admin.",
      data: {
        order_id: order.order_id,
        order_number: order.order_number,
        order_status: display_status,
        display_status,
        payment_status: order.payment_status,
        customer_email,
        customer_name: customer_name_profile || address?.full_name || order.customer_name || "N/A",
        customer_phone: customer_phone_profile || address?.mobile || order.customer_phone || "N/A",
        grand_total: order.grand_total,
        created_at: order.created_at,
        subtotal: order.subtotal,
        gst_amount: order.gst_amount,
        stitching_amount: order.stitching_amount,
        shipping_amount: order.shipping_amount,
        products: products.map(item => {
          let parsedImg = item.product_image;
          if (typeof parsedImg === 'string') {
            try {
              const arr = JSON.parse(parsedImg);
              parsedImg = Array.isArray(arr) && arr.length > 0 ? arr[0] : parsedImg;
            } catch (e) {
              // Not JSON, leave as is
            }
          }
          return {
            product_name: item.product_name,
            product_image: parsedImg,
            fit_style: item.fit_style,
            selected_size: item.selected_size,
            selected_length: item.selected_length,
            selected_sleeve: item.selected_sleeve,
            custom_measurement: item.custom_measurement,
            quantity: item.quantity,
            price: item.price,
            monogram: item.monogram
          };
        }),
        address: address ? {
          fullName: address.full_name,
          mobile: address.mobile,
          alternateMobile: address.alternate_mobile,
          houseBuilding: address.house_building,
          streetLocality: address.street_locality,
          landmark: address.landmark,
          city: address.city,
          state: address.state,
          postalCode: address.postal_code,
          country: address.country,
          addressType: address.address_type
        } : null,
        payment: payment ? {
          gateway_name: payment.gateway_name,
          transaction_id: payment.transaction_id,
          payment_method: payment.payment_method,
          bank_name: payment.bank_name,
          payment_status: payment.payment_status,
          amount: payment.amount,
          currency: payment.currency
        } : null,
        timeline,
        delivery_timeline: deliveryTimeline,
        shipment: shipment ? {
          shipment_status: shipment.shipment_status,
          normalized_status,
          expected_delivery: shipment.expected_delivery,
          delivered_date: shipment.delivered_date,
          tracking_url: shipment.tracking_url,
          awb_number: shipment.awb_number,
          courier_name: shipment.courier_name,
          last_tracking_sync: shipment.last_tracking_sync
        } : null
      }
    });
  } catch (error) {
    console.error("❌ Admin Order Details Fetch Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

// =========================================================
// ADMIN: CREATE SHIPMENT (DELHIVERY PHASE 1)
// =========================================================
const createShipment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { expected_delivery, shipping_provider = 'DELHIVERY' } = req.body || {};

    // 1. Fetch Order Details
    const [orders] = await ConnectDB.query(
      "SELECT * FROM orders WHERE order_id = ?",
      [orderId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const order = orders[0];

    // Validate Order Status
    if (order.order_status === "CANCELLED") {
      return res.status(400).json({ success: false, message: "Cannot create shipment for Cancelled orders." });
    }
    if (order.order_status === "DELIVERED") {
      return res.status(400).json({ success: false, message: "Cannot create shipment for already Delivered orders." });
    }

    // 2. Fetch Shipping Address
    const [addressRows] = await ConnectDB.query(
      "SELECT * FROM user_addresses WHERE address_id = ?",
      [order.address_id]
    );

    if (addressRows.length === 0) {
      return res.status(400).json({ success: false, message: "Shipping address not found for this order." });
    }

    const address = addressRows[0];

    // Address Validations
    if (!address.full_name || !address.mobile || !address.city || !address.state || !address.postal_code) {
      return res.status(400).json({
        success: false,
        message: "Shipping address is incomplete. Name, phone, city, state, and postal code are required.",
      });
    }

    const streetAddress = `${address.house_building || ""} ${address.street_locality || ""} ${address.landmark || ""}`.trim();
    if (!streetAddress) {
      return res.status(400).json({
        success: false,
        message: "Shipping address street/locality information is missing.",
      });
    }

    // 3. Fetch Order Items
    const [orderItems] = await ConnectDB.query(
      "SELECT * FROM order_items WHERE order_id = ?",
      [orderId]
    );

    if (orderItems.length === 0) {
      return res.status(400).json({ success: false, message: "Order does not contain any items." });
    }

    const products_desc = orderItems.map(item => item.product_name).join(", ");
    const totalQuantity = orderItems.reduce((acc, item) => acc + Number(item.quantity || 1), 0);

    // 4. Fetch Payment Details
    const [paymentRows] = await ConnectDB.query(
      "SELECT * FROM payments WHERE order_id = ? ORDER BY payment_id DESC LIMIT 1",
      [orderId]
    );

    const latestPayment = paymentRows[0] || null;
    let paymentMode = "Prepaid";
    let codAmount = 0;

    if (latestPayment && String(latestPayment.payment_method).toUpperCase() === "COD") {
      paymentMode = "COD";
      codAmount = Number(order.grand_total);
    }

    // 5. Prevent Duplicate Shipment Creation
    const [shipmentRows] = await ConnectDB.query(
      "SELECT * FROM shipment_details WHERE order_id = ?",
      [orderId]
    );

    const existingShipment = shipmentRows[0] || null;
    if (existingShipment && existingShipment.awb_number) {
      return res.status(200).json({
        success: true,
        alreadyCreated: true,
        message: "Shipment already created",
        data: {
          order_id: order.order_id,
          order_number: order.order_number,
          awb_number: existingShipment.awb_number,
          courier_name: existingShipment.courier_name || "Delhivery",
          tracking_url: existingShipment.tracking_url,
          shipment_status: existingShipment.shipment_status
        }
      });
    }

    // 6. Build Delhivery Shipment Object
    const formatDateForDelhivery = (dateInput) => {
      const d = new Date(dateInput);
      const YYYY = d.getFullYear();
      const MM = String(d.getMonth() + 1).padStart(2, "0");
      const DD = String(d.getDate()).padStart(2, "0");
      const HH = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
    };

    const formattedOrderDate = formatDateForDelhivery(order.created_at);
    const formattedInvoiceDate = formatDateForDelhivery(new Date());

    const shipmentObject = {
      name: address.full_name,
      add: streetAddress,
      pin: address.postal_code,
      city: address.city,
      state: address.state,
      country: "India",
      phone: address.mobile,
      order: order.order_number,
      payment_mode: paymentMode,
      return_pin: process.env.DELHIVERY_PICKUP_PIN || "637211",
      return_city: process.env.DELHIVERY_PICKUP_CITY || "Tiruchengode",
      return_phone: process.env.DELHIVERY_PICKUP_PHONE || "9944944255",
      return_add: process.env.DELHIVERY_PICKUP_ADDRESS || "36/11, CHB Colony Street No-04, Tiruchengode",
      return_state: process.env.DELHIVERY_PICKUP_STATE || "Tamil Nadu",
      return_country: "India",
      products_desc,
      hsn_code: "6109",
      cod_amount: codAmount,
      order_date: formattedOrderDate,
      invoice_date: formattedInvoiceDate,
      invoice_number: `INV-${order.order_number}`,
      invoice_value: Number(order.grand_total),
      total_amount: Number(order.grand_total),
      seller_add: process.env.DELHIVERY_PICKUP_ADDRESS || "36/11, CHB Colony Street No-04, Tiruchengode",
      seller_name: process.env.DELHIVERY_SELLER_NAME || "VIJAYLAKSHMI GLOBAL EMART",
      seller_inv: `INV-${order.order_number}`,
      quantity: totalQuantity,
      seller_gst_tin: process.env.DELHIVERY_SELLER_GST || "33AAICV1234N1Z5",
      shipping_mode: "Surface",
      transport_mode: "Surface",
      address_type: address.address_type || "home",
      // TODO: shipment dimensions & weight should be fetched dynamically from actual package specs later
      shipment_width: 10,
      shipment_height: 10,
      weight: 500
    };

    // 6b. Validate Final Shipment Object Properties strictly before API dispatch
    const requiredShipmentFields = [
      { field: "name", label: "Customer Full Name" },
      { field: "add", label: "Complete Customer Address" },
      { field: "pin", label: "Customer Postal Code" },
      { field: "city", label: "Customer City" },
      { field: "state", label: "Customer State" },
      { field: "phone", label: "Customer Mobile" },
      { field: "order", label: "Order Number" },
      { field: "payment_mode", label: "Payment Mode" },
      { field: "products_desc", label: "Product Description" },
      { field: "order_date", label: "Order Date" },
      { field: "invoice_number", label: "Invoice Number" },
      { field: "invoice_value", label: "Invoice Value" },
      { field: "total_amount", label: "Total Amount" },
      { field: "seller_name", label: "Seller Name" },
      { field: "quantity", label: "Quantity" },
      { field: "weight", label: "Weight" }
    ];

    for (const item of requiredShipmentFields) {
      const val = shipmentObject[item.field];
      if (val === undefined || val === null || val === "" || (typeof val === "number" && isNaN(val))) {
        return res.status(400).json({
          success: false,
          message: `Validation Error: Required shipment field '${item.label}' (${item.field}) is missing or invalid.`
        });
      }
    }

    if (shipping_provider === 'SHIPROCKET') {
      const shiprocketProvider = ShippingFactory.getProvider('SHIPROCKET');

      const shiprocketPayload = {
        order_id: order.order_number,
        order_date: formattedOrderDate,
        billing_customer_name: address.full_name,
        billing_address: streetAddress,
        billing_city: address.city,
        billing_pincode: address.postal_code,
        billing_state: address.state,
        billing_email: order.customer_email || "customer@example.com",
        billing_phone: address.mobile,
        payment_method: paymentMode,
        sub_total: Number(order.grand_total),
        weight: 0.5,
        length: 10,
        breadth: 10,
        height: 10,
        order_items: orderItems.map(item => ({
          name: item.product_name,
          sku: item.product_id,
          units: item.quantity,
          selling_price: item.price
        }))
      };

      const shiprocketResult = await shiprocketProvider.createShipment(shiprocketPayload);

      if (existingShipment) {
        let updateQuery = `UPDATE shipment_details 
           SET awb_number = ?, courier_name = ?, courier_tracking_id = ?, tracking_url = ?, shipment_status = ?, shipping_provider = ?, provider_order_id = ?, provider_shipment_id = ?, provider_pickup_id = ?, provider_response = ?, api_response_updated_at = NOW(), last_tracking_sync = NOW(), updated_at = NOW()`;
        const updateParams = [
          shiprocketResult.awb_number,
          shiprocketResult.courier_name,
          shiprocketResult.courier_tracking_id,
          shiprocketResult.tracking_url,
          'SHIPMENT_CREATED',
          'SHIPROCKET',
          shiprocketResult.provider_order_id,
          shiprocketResult.provider_shipment_id,
          shiprocketResult.provider_pickup_id,
          JSON.stringify(shiprocketResult.provider_response)
        ];

        if (expected_delivery) {
          updateQuery += `, expected_delivery = ?`;
          updateParams.push(expected_delivery);
        }

        updateQuery += ` WHERE order_id = ?`;
        updateParams.push(orderId);

        await ConnectDB.query(updateQuery, updateParams);
      } else {
        const insertQuery = `INSERT INTO shipment_details (
          order_id, shipping_provider, courier_name, awb_number, courier_tracking_id, tracking_url, expected_delivery, shipment_status, provider_order_id, provider_shipment_id, provider_pickup_id, provider_response, label_url, manifest_url, api_response_updated_at, created_at, updated_at, last_tracking_sync
         ) VALUES (?, ?, ?, ?, ?, ?, ${expected_delivery ? '?' : 'DATE_ADD(NOW(), INTERVAL 5 DAY)'}, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW(), NOW())`;

        const insertParams = [
          orderId,
          'SHIPROCKET',
          shiprocketResult.courier_name,
          shiprocketResult.awb_number,
          shiprocketResult.courier_tracking_id,
          shiprocketResult.tracking_url
        ];

        if (expected_delivery) {
          insertParams.push(expected_delivery);
        }

        insertParams.push(
          'SHIPMENT_CREATED',
          shiprocketResult.provider_order_id,
          shiprocketResult.provider_shipment_id,
          shiprocketResult.provider_pickup_id,
          JSON.stringify(shiprocketResult.provider_response),
          shiprocketResult.label_url,
          shiprocketResult.manifest_url
        );

        await ConnectDB.query(insertQuery, insertParams);
      }

      await ConnectDB.query(
        "UPDATE orders SET order_status = 'SHIPMENT_CREATED', updated_at = NOW() WHERE order_id = ?",
        [orderId]
      );

      await ConnectDB.query(
        "INSERT INTO order_status_history (order_id, status, remarks, created_at) VALUES (?, 'SHIPMENT_CREATED', 'Shiprocket AWB generated successfully.', NOW())",
        [orderId]
      );

      // Trigger async shipment email notification
      const emailService = require("../../services/email.service");
      setTimeout(async () => {
        try {
          const orderData = await emailService.getOrderDataForEmail(orderId);
          if (orderData && orderData.customer_email) {
            await emailService.sendShipmentCreatedEmail({
              customer_email: orderData.customer_email,
              customer_name: orderData.address?.full_name || orderData.customer_name,
              order_number: order.order_number,
              awb_number: shiprocketResult.awb_number,
              tracking_url: shiprocketResult.tracking_url
            });
          }
        } catch (emailErr) {
          console.error("❌ [EMAIL] Shipment Created notification failed (Shiprocket):", emailErr.message);
        }
      }, 100);

      return res.status(200).json({
        success: true,
        message: "Shiprocket shipment created successfully.",
        data: {
          order_id: order.order_id,
          order_number: order.order_number,
          awb_number: shiprocketResult.awb_number,
          courier_name: shiprocketResult.courier_name || "Shiprocket",
          tracking_url: shiprocketResult.tracking_url,
          shipment_status: "Shipment Created",
          label_url: shiprocketResult.label_url,
          manifest_url: shiprocketResult.manifest_url
        }
      });
    }

    // 7. Call Delhivery Service
    const delhiveryResult = await delhiveryService.createDelhiveryShipment(shipmentObject);

    const waybill = delhiveryResult.waybill;
    const tracking_url = `https://www.delhivery.com/track/package/${waybill}`;

    // 8. Update Existing shipment_details Row
    if (existingShipment) {
      let updateQuery = `UPDATE shipment_details 
         SET awb_number = ?, courier_name = 'Delhivery', tracking_url = ?, shipment_status = 'SELLER_PREPARING', shipping_provider = 'DELHIVERY', last_tracking_sync = NOW(), updated_at = NOW()`;
      const updateParams = [waybill, tracking_url];

      if (expected_delivery) {
        updateQuery += `, expected_delivery = ?`;
        updateParams.push(expected_delivery);
      }

      updateQuery += ` WHERE order_id = ?`;
      updateParams.push(orderId);

      await ConnectDB.query(updateQuery, updateParams);
    } else {
      // Defensive fallback if row is missing
      if (expected_delivery) {
        await ConnectDB.query(
          `INSERT INTO shipment_details (
            order_id, shipping_provider, courier_name, awb_number, tracking_url, expected_delivery, shipment_status, created_at, updated_at, last_tracking_sync
           ) VALUES (?, 'DELHIVERY', 'Delhivery', ?, ?, ?, 'SELLER_PREPARING', NOW(), NOW(), NOW())`,
          [orderId, waybill, tracking_url, expected_delivery]
        );
      } else {
        await ConnectDB.query(
          `INSERT INTO shipment_details (
            order_id, shipping_provider, courier_name, awb_number, tracking_url, expected_delivery, shipment_status, created_at, updated_at, last_tracking_sync
           ) VALUES (?, 'DELHIVERY', 'Delhivery', ?, ?, DATE_ADD(NOW(), INTERVAL 5 DAY), 'SELLER_PREPARING', NOW(), NOW(), NOW())`,
          [orderId, waybill, tracking_url]
        );
      }
    }

    // Update order status to SELLER_PREPARING
    await ConnectDB.query(
      "UPDATE orders SET order_status = 'SELLER_PREPARING', updated_at = NOW() WHERE order_id = ?",
      [orderId]
    );

    // Insert history timeline entry
    await ConnectDB.query(
      "INSERT INTO order_status_history (order_id, status, remarks, created_at) VALUES (?, 'SELLER_PREPARING', 'Delhivery AWB created. Seller preparing your order.', NOW())",
      [orderId]
    );

    // Trigger async shipment email notification
    const emailService = require("../../services/email.service");
    setTimeout(async () => {
      try {
        const orderData = await emailService.getOrderDataForEmail(orderId);
        if (orderData && orderData.customer_email) {
          await emailService.sendShipmentCreatedEmail({
            customer_email: orderData.customer_email,
            customer_name: orderData.address?.full_name || orderData.customer_name,
            order_number: order.order_number,
            awb_number: waybill,
            tracking_url
          });
        }
      } catch (emailErr) {
        console.error("❌ [EMAIL] Shipment Created notification failed:", emailErr.message);
      }
    }, 100);

    return res.status(200).json({
      success: true,
      message: "Delhivery shipment created successfully.",
      data: {
        order_id: order.order_id,
        order_number: order.order_number,
        awb_number: waybill,
        courier_name: "Delhivery",
        tracking_url,
        shipment_status: "Shipment Created"
      }
    });
  } catch (error) {
    console.error("❌ createShipment Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create Delhivery shipment."
    });
  }
};

// =========================================================
// CUSTOMER: GET SHIPMENT TRACKING TIMELINE / SYNC STATUS
// =========================================================
const getUserOrderTracking = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const { orderNumber } = req.params;

    console.log("========================================");
    console.log("[VIEW DETAILS TRIGGER] Backend endpoint reached");
    console.log("[VIEW DETAILS TRIGGER] Order:", orderNumber);
    console.log("========================================");

    const isNumeric = /^\d+$/.test(orderNumber);
    const queryStr = isNumeric
      ? "SELECT * FROM orders WHERE order_id = ?"
      : "SELECT * FROM orders WHERE order_number = ?";

    const [orders] = await ConnectDB.query(queryStr, [orderNumber]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const order = orders[0];

    // Security check: Only owner or admin can track
    const isAdmin = req.user.email === 'admin@fabricluxure.com';
    if (!isAdmin && order.user_id !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized access to this order." });
    }

    // Fetch status timeline
    const [timeline] = await ConnectDB.query(
      "SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC",
      [order.order_id]
    );

    // Fetch existing shipment details
    const [shipmentRows] = await ConnectDB.query(
      "SELECT * FROM shipment_details WHERE order_id = ?",
      [order.order_id]
    );

    const shipment = shipmentRows[0] || null;

    if (!shipment) {
      console.log("[VIEW DETAILS SYNC] SKIPPED — No shipment record");
      console.log("[VIEW DETAILS SYNC] No AWB exists. Skipping Delhivery sync.");
      return res.status(200).json({
        success: true,
        shipment_created: false,
        message: "Shipment has not been created yet."
      });
    }

    if (!shipment.awb_number) {
      console.log("[VIEW DETAILS SYNC] SKIPPED — No AWB number");
      console.log("[VIEW DETAILS SYNC] No AWB exists. Skipping Delhivery sync.");
      return res.status(200).json({
        success: true,
        shipment_created: false,
        message: "Shipment has not been created yet."
      });
    }

    console.log(`[VIEW DETAILS TRIGGER] AWB found: ${shipment.awb_number}`);
    const isTerminal = order.order_status === "CANCELLED" || order.order_status === "DELIVERED" || order.order_status === "REFUNDED";

    const ShippingFactory = require("../../services/shipping/ShippingFactory");
    const provider = ShippingFactory.getProvider(shipment.shipping_provider || 'DELHIVERY');

    if (isTerminal) {
      console.log("[VIEW DETAILS SYNC] Terminal order status. Skipping tracking sync.");
      if (order.order_status === "CANCELLED") console.log("[VIEW DETAILS SYNC] SKIPPED — Order already CANCELLED");
      if (order.order_status === "DELIVERED") console.log("[VIEW DETAILS SYNC] SKIPPED — Order already DELIVERED");
      if (order.order_status === "REFUNDED") console.log("[VIEW DETAILS SYNC] SKIPPED — Order already REFUNDED");
    } else {
      console.log(`[VIEW DETAILS SYNC] Calling live tracking API for ${shipment.shipping_provider || 'DELHIVERY'}...`);
      try {
        const syncResult = await provider.syncShipment(shipment);
        const rawStatus = (syncResult && syncResult.rawStatus) || shipment.shipment_status;
        const normalizedStatus = (syncResult && syncResult.normalizedStatus) || order.order_status;
        const prevStatus = shipment.shipment_status;
        const changed = syncResult ? syncResult.statusChanged : false;
        const rawResponse = syncResult ? syncResult.rawResponse : null;

        console.log(`[VIEW DETAILS SYNC] Raw tracking response: ${JSON.stringify(rawResponse)}`);
        console.log(`[VIEW DETAILS SYNC] Raw tracking status: ${rawStatus}`);
        console.log(`[VIEW DETAILS SYNC] Normalized status: ${normalizedStatus}`);
        console.log(`[VIEW DETAILS SYNC] Previous DB status: ${prevStatus}`);
        console.log(`[VIEW DETAILS SYNC] Status changed: ${changed}`);
        console.log(`[VIEW DETAILS SYNC] Completed`);

        if (syncResult && syncResult.success) {
          // Reload shipment details
          const [updatedShipmentRows] = await ConnectDB.query(
            "SELECT * FROM shipment_details WHERE order_id = ?",
            [order.order_id]
          );
          const updatedShipment = updatedShipmentRows[0];

          // Reload order object to reflect changes from sync (like updated order_status)
          const [updatedOrders] = await ConnectDB.query(
            "SELECT * FROM orders WHERE order_id = ?",
            [order.order_id]
          );
          const updatedOrder = updatedOrders[0] || order;

          // Fetch updated status history timeline
          const [newTimeline] = await ConnectDB.query(
            "SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC",
            [order.order_id]
          );

          const deliveryTimeline = provider.buildDeliveryTimeline(updatedOrder, updatedShipment, syncResult.scans || [], newTimeline);

          return res.status(200).json({
            success: true,
            shipment_created: true,
            awb_number: updatedShipment.awb_number,
            courier_name: updatedShipment.courier_name,
            tracking_url: updatedShipment.tracking_url,
            raw_status: updatedShipment.shipment_status,
            normalized_status: syncResult.normalizedStatus,
            pickup_date: syncResult.pickupDate,
            expected_delivery: syncResult.expectedDelivery,
            delivered_date: syncResult.deliveredDate,
            last_tracking_sync: new Date(),
            scans: syncResult.scans || [],
            delivery_timeline: deliveryTimeline
          });
        }
      } catch (trackApiErr) {
        console.error(`❌ Failed to sync fresh tracking status from ${shipment.shipping_provider || 'DELHIVERY'}:`, trackApiErr.message);
      }
    }

    // Return cached DB details if API failed or within cache window
    const normalizedStatus = provider.normalizeStatus(shipment.shipment_status);
    const deliveryTimeline = provider.buildDeliveryTimeline(order, shipment, [], timeline);
    return res.status(200).json({
      success: true,
      shipment_created: true,
      awb_number: shipment.awb_number,
      courier_name: shipment.courier_name,
      tracking_url: shipment.tracking_url,
      raw_status: shipment.shipment_status,
      normalized_status: normalizedStatus,
      pickup_date: shipment.pickup_date,
      expected_delivery: shipment.expected_delivery,
      delivered_date: shipment.delivered_date,
      last_tracking_sync: shipment.last_tracking_sync,
      scans: [], // fallback scans list
      delivery_timeline: deliveryTimeline
    });

  } catch (error) {
    console.error("❌ getUserOrderTracking Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

const translateDbStatusToFriendly = (dbStatus) => {
  return dbStatus;
};

// =========================================================
// CUSTOMER/ADMIN: MANUAL SYNC TRACKING API
// =========================================================
const manualSyncTracking = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.user_id;
    const { orderNumber } = req.params;

    const isNumeric = /^\d+$/.test(orderNumber);
    const queryStr = isNumeric
      ? "SELECT * FROM orders WHERE order_id = ?"
      : "SELECT * FROM orders WHERE order_number = ?";

    const [orders] = await ConnectDB.query(queryStr, [orderNumber]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const order = orders[0];

    // Security check: Customers can only sync their own order
    const isAdmin = req.user.email === 'admin@fabricluxure.com';
    if (!isAdmin && order.user_id !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized access to this order." });
    }

    // Fetch existing shipment details
    const [shipmentRows] = await ConnectDB.query(
      "SELECT * FROM shipment_details WHERE order_id = ?",
      [order.order_id]
    );
    const shipment = shipmentRows[0] || null;

    if (!shipment || !shipment.awb_number) {
      return res.status(400).json({
        success: false,
        message: "No AWB generated yet. Shipment has not been created."
      });
    }

    console.log(`[MANUAL SYNC] Initiating tracking update for AWB: ${shipment.awb_number}`);
    const syncResult = await delhiveryService.syncDelhiveryShipmentStatus(shipment);

    // Fetch updated order & shipment details
    const [updatedOrderRows] = await ConnectDB.query(queryStr, [orderNumber]);
    const updatedOrder = updatedOrderRows[0];

    const [updatedShipmentRows] = await ConnectDB.query(
      "SELECT * FROM shipment_details WHERE order_id = ?",
      [order.order_id]
    );
    const updatedShipment = updatedShipmentRows[0];

    // Fetch fresh scans
    let scans = [];
    try {
      const trackingResult = await delhiveryService.getShipmentStatus(updatedShipment.awb_number, updatedOrder.order_number);
      if (trackingResult.success) {
        scans = trackingResult.scans;
      }
    } catch (apiErr) {
      console.error("❌ Failed to fetch scans for manual sync response:", apiErr.message);
    }

    // Fetch status timeline
    const [timeline] = await ConnectDB.query(
      "SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC",
      [order.order_id]
    );

    const deliveryTimeline = delhiveryService.buildDeliveryTimeline(updatedOrder, updatedShipment, scans, timeline);

    return res.status(200).json({
      success: true,
      message: "Tracking synchronized successfully.",
      data: {
        order_number: updatedOrder.order_number,
        order_status: translateDbStatusToFriendly(updatedOrder.order_status),
        shipment: {
          courier_name: updatedShipment.courier_name,
          awb_number: updatedShipment.awb_number,
          tracking_url: updatedShipment.tracking_url,
          shipment_status: updatedShipment.shipment_status,
          expected_delivery: updatedShipment.expected_delivery,
          last_tracking_sync: updatedShipment.last_tracking_sync
        },
        delivery_timeline: deliveryTimeline,
        scans
      }
    });

  } catch (error) {
    console.error("❌ manualSyncTracking Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

const getInvoicePdf = async (req, res) => {
  const { orderId } = req.params;
  try {
    const [[orderData]] = await ConnectDB.query(`
      SELECT o.*, ua.*, u.name as u_name, u.email as u_email, u.mobile as u_phone
      FROM orders o 
      LEFT JOIN user_addresses ua ON o.address_id = ua.address_id
      LEFT JOIN users u ON o.user_id = u.user_id
      WHERE o.order_id = ?
    `, [orderId]);

    if (!orderData) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const products = await getOrderItemsWithMonograms(orderId);

    // Format for invoice generator
    const formattedOrder = {
      ...orderData,
      customer_name: orderData.user_id && orderData.u_name ? orderData.u_name : orderData.full_name,
      customer_email: orderData.user_id ? orderData.u_email : (orderData.email_address || "N/A"),
      customer_phone: orderData.user_id ? orderData.u_phone : orderData.mobile,
      address: {
        fullName: orderData.full_name,
        mobile: orderData.mobile,
        houseBuilding: orderData.house_building,
        streetLocality: orderData.street_locality,
        landmark: orderData.landmark,
        city: orderData.city,
        state: orderData.state,
        postalCode: orderData.postal_code,
        country: orderData.country
      },
      products
    };

    const invoiceService = require("../../services/invoice.service");
    const pdfBuffer = await invoiceService.generateInvoicePdf(formattedOrder);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Invoice_${orderData.order_number}.pdf`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Error generating invoice PDF:", err);
    return res.status(500).json({ success: false, message: "Server error generating PDF" });
  }
};

const exportAdminOrders = async (req, res) => {
  try {
    const {
      search = '',
      status = 'All',
      payment = 'All',
      product_type = 'All',
      date_range = 'All',
      start_date,
      end_date
    } = req.query;

    let queryParams = [];
    let whereClauses = [];

    // Search
    if (search) {
      whereClauses.push(`(
        o.order_number LIKE ? OR
        ua.full_name LIKE ? OR
        ua.mobile LIKE ? OR
        u.email LIKE ?
      )`);
      const val = `%${search}%`;
      queryParams.push(val, val, val, val);
    }

    // Status Filter
    if (status !== 'All') {
      whereClauses.push("o.order_status = ?");
      queryParams.push(status);
    }

    // Payment Filter
    if (payment !== 'All') {
      whereClauses.push("o.payment_status = ?");
      queryParams.push(payment);
    }

    // Product Type Filter
    if (product_type === 'Shirts') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM order_items oi
        INNER JOIN product_master pm ON oi.product_id = pm.pro_id
        LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
        LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
        WHERE oi.order_id = o.order_id AND (LOWER(pt.product_type) LIKE '%shirt%' OR oi.fit_style IS NOT NULL OR oi.selected_size IS NOT NULL)
      )`);
    } else if (product_type === 'Towels') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM order_items oi
        INNER JOIN product_master pm ON oi.product_id = pm.pro_id
        LEFT JOIN product_category pc ON pm.cat_id = pc.cat_id
        LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
        WHERE oi.order_id = o.order_id AND (LOWER(pt.product_type) LIKE '%towel%' OR oi.selected_length IS NOT NULL)
      )`);
    }

    // Date Range Filter
    if (date_range === 'Today') {
      whereClauses.push("DATE(o.created_at) = CURDATE()");
    } else if (date_range === 'Yesterday') {
      whereClauses.push("DATE(o.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)");
    } else if (date_range === 'Last 7 Days') {
      whereClauses.push("o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
    } else if (date_range === 'Last 30 Days') {
      whereClauses.push("o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
    } else if (date_range === 'Custom' && start_date && end_date) {
      whereClauses.push("DATE(o.created_at) BETWEEN ? AND ?");
      queryParams.push(start_date, end_date);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : '';

    // Query to fetch all details including line items, address, payment, shipment
    const exportQuery = `
      SELECT o.order_id, o.order_number, o.created_at, o.subtotal, o.gst_amount, o.stitching_amount, o.shipping_amount, o.grand_total, o.payment_status, o.order_status,
             COALESCE(u.name, ua.full_name) as customer_name, u.email as customer_email, ua.mobile as customer_mobile,
             oi.product_name, oi.price as item_price, oi.quantity as item_quantity, oi.fit_style, oi.selected_sleeve, oi.selected_size, oi.selected_length, oi.custom_measurement,
             om.monogram_text, om.price as monogram_price, om.upload_file as monogram_file, om.upload_file_type as monogram_file_type,
             mp.placement_name as monogram_placement, mc.color_name as monogram_color, mf.font_name as monogram_font,
             ua.full_name as address_fullName, ua.mobile as address_mobile, ua.alternate_mobile as address_alternateMobile,
             ua.house_building as address_houseBuilding, ua.street_locality as address_streetLocality, ua.landmark as address_landmark,
             ua.city as address_city, ua.state as address_state, ua.postal_code as address_postalCode, ua.country as address_country, ua.address_type as address_type,
             p.gateway_name as payment_gateway, p.transaction_id as payment_transactionId, p.payment_method, p.bank_name as payment_bankName, p.amount as payment_amount, p.payment_status as payment_txnStatus,
             sd.courier_name, sd.awb_number, sd.tracking_url, sd.expected_delivery, sd.delivered_date, sd.shipment_status
      FROM orders o
      LEFT JOIN user_addresses ua ON o.address_id = ua.address_id
      LEFT JOIN users u ON o.user_id = u.user_id
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      LEFT JOIN order_monograms om ON oi.order_item_id = om.order_item_id
      LEFT JOIN monogram_placements mp ON om.placement_id = mp.placement_id
      LEFT JOIN monogram_colors mc ON om.color_id = mc.color_id
      LEFT JOIN monogram_fonts mf ON om.font_id = mf.font_id
      LEFT JOIN payments p ON o.order_id = p.order_id
      LEFT JOIN shipment_details sd ON o.order_id = sd.order_id
      ${whereSql}
      ORDER BY o.created_at DESC
    `;

    const [rows] = await ConnectDB.query(exportQuery, queryParams);

    if (rows.length === 0) {
      return res.status(200).json({ success: true, message: "No orders found to export.", data: [] });
    }

    // Fetch timeline records for all matched orders
    const matchedOrderIds = [...new Set(rows.map(r => r.order_id))];
    const [timelineRows] = await ConnectDB.query(
      "SELECT order_id, status, remarks, created_at FROM order_status_history WHERE order_id IN (?) ORDER BY created_at ASC",
      [matchedOrderIds]
    );

    const timelineMap = {};
    timelineRows.forEach(t => {
      if (!timelineMap[t.order_id]) {
        timelineMap[t.order_id] = [];
      }
      timelineMap[t.order_id].push(`${new Date(t.created_at).toISOString()}: ${t.status} (${t.remarks || 'No remarks'})`);
    });

    // Map each row to include its formatted timeline history
    const data = rows.map(r => ({
      ...r,
      timeline_history: (timelineMap[r.order_id] || []).join(" | ")
    }));

    return res.status(200).json({
      success: true,
      message: "Export data fetched successfully.",
      data
    });

  } catch (error) {
    console.error("❌ Admin Export Fetch Error:", error);
    return res.status(500).json({ success: false, message: "Server error.", error: error.message });
  }
};

module.exports = {
  placeOrder,
  getUserOrders,
  getSingleOrder,
  getOrderTimeline,
  getAdminDashboard,
  getAdminSalesDashboard,
  getAdminOrdersList,
  updateOrderStatus,
  updateOrderShipment,
  getAdminAnalytics,
  initiatePayment,
  simulateGateway,
  paymentCallback,
  getOrderSuccessDetails,
  getAdminOrderDetails,
  createShipment,
  getUserOrderTracking,
  manualSyncTracking,
  getInvoicePdf,
  exportAdminOrders
};

