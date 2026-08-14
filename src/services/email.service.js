const nodemailer = require("nodemailer");
const ConnectDB = require("../config/db");

// Required environment variables validation
const requiredEnvVars = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM_NAME",
  "MAIL_FROM_EMAIL",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required email configuration: ${envVar}`);
  }
}

// Construct Nodemailer Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Verify the SMTP transporter connection.
 * Resolves safely on success/failure to prevent server crashes.
 */
const verifyConnection = async () => {
  try {
    await transporter.verify();
    console.log("[Email Service] SMTP connection verified successfully");
    return true;
  } catch (error) {
    console.error("[Email Service] SMTP verification failed:", error.message);
    return false;
  }
};

/**
 * Send an email.
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} options.html - HTML body
 * @param {Array} [options.attachments] - Optional attachments list
 */
const sendEmail = async (options) => {
  const { to, subject, text, html, attachments } = options;

  if (!to) {
    throw new Error("Recipient email (to) is required.");
  }

  const mailOptions = {
    from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_EMAIL}>`,
    replyTo: process.env.MAIL_FROM_EMAIL,
    to,
    subject,
    text,
    html,
    attachments: attachments || [],
    headers: {
      "X-Priority": "1 (Highest)",
      "X-Mailer": "Nodemailer",
    }
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("❌ Send Email Error:", error.message);
    throw new Error(`Email sending failed: ${error.message}`);
  }
};

module.exports = {
  verifyConnection,
  sendEmail,

  /**
   * Fetch complete order data needed for invoice and email templates
   * @param {number} orderId
   * @returns {Promise<Object|null>}
   */
  getOrderDataForEmail: async (orderId) => {
    try {
      const [orders] = await ConnectDB.query("SELECT * FROM orders WHERE order_id = ?", [orderId]);
      if (orders.length === 0) return null;
      const order = orders[0];

      const [productsRows] = await ConnectDB.query(`
        SELECT oi.*, 
               om.order_monogram_id, om.monogram_text, om.price as monogram_price,
               om.upload_file, om.upload_file_type,
               mp.placement_name, mc.color_name, mf.font_name
        FROM order_items oi
        LEFT JOIN order_monograms om ON oi.order_item_id = om.order_item_id
        LEFT JOIN monogram_placements mp ON om.placement_id = mp.placement_id
        LEFT JOIN monogram_colors mc ON om.color_id = mc.color_id
        LEFT JOIN monogram_fonts mf ON om.font_id = mf.font_id
        WHERE oi.order_id = ?
      `, [order.order_id]);
      
      const products = productsRows.map(item => {
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
        return {
          ...item,
          monogram
        };
      });
      
      const [userRows] = await ConnectDB.query("SELECT email, name, mobile FROM users WHERE user_id = ?", [order.user_id]);
      const customer_email = userRows[0]?.email || null;
      const customer_name = userRows[0]?.name || null;
      const customer_phone = userRows[0]?.mobile || null;

      const [addressRows] = await ConnectDB.query("SELECT * FROM user_addresses WHERE address_id = ?", [order.address_id]);
      const address = addressRows[0] || null;

      const [paymentRows] = await ConnectDB.query("SELECT * FROM payments WHERE order_id = ?", [order.order_id]);
      const payment = paymentRows[0] || null;

      return {
        ...order,
        customer_email,
        customer_name,
        customer_phone,
        products,
        address,
        payment
      };
    } catch (error) {
      console.error("❌ Error fetching email order details:", error);
      throw error;
    }
  },
  
  /**
   * Send Customer Order Confirmation Email
   * @param {Object} orderData
   * @param {Buffer} invoiceBuffer
   */
  sendOrderConfirmationEmail: async (orderData, invoiceBuffer) => {
    if (!orderData.customer_email) {
      throw new Error("Customer email is missing.");
    }

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #081A42; margin-bottom: 5px;">Thank You For Your Order!</h2>
          <p style="color: #666; font-size: 14px; margin-top: 0;">Your order has been successfully placed.</p>
        </div>

        <p style="font-size: 14px; color: #333; line-height: 1.5;">
          Hi ${orderData.customer_name || 'Customer'},
        </p>

        <p style="font-size: 14px; color: #333; line-height: 1.5;">
          Thank you for shopping with Fabric Luxure! We have received your order <strong>#${orderData.order_number}</strong>.
        </p>
        
        <p style="font-size: 14px; color: #333; line-height: 1.5;">
          Please find your detailed order invoice attached to this email as a PDF document.
        </p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 13px;">
          <h4 style="margin-top: 0; color: #081A42; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px;">Shipping Address</h4>
          ${
            orderData.address
              ? `
            <p style="margin: 5px 0;"><strong>${orderData.address.full_name}</strong></p>
            <p style="margin: 5px 0;">${orderData.address.house_building || ""}</p>
            <p style="margin: 5px 0;">${orderData.address.street_locality || ""}</p>
            <p style="margin: 5px 0;">${orderData.address.city}, ${orderData.address.state} - ${orderData.address.postal_code}</p>
          `
              : "<p style='margin: 0; color: #999;'>No delivery address details registered.</p>"
          }
        </div>

        <p style="font-size: 13px; color: #555; text-align: center; margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 15px;">
          We will notify you when your order is packed and shipped. For any questions, please contact our support team.
        </p>
      </div>
    `;

    return sendEmail({
      to: orderData.customer_email,
      subject: `Order Confirmed - ${orderData.order_number} | Fabric Luxure`,
      text: `Thank you for shopping with Fabric Luxure. Your order ${orderData.order_number} has been confirmed. Grand Total: ₹${orderData.grand_total}`,
      html: emailHtml,
      attachments: [
        {
          filename: `Invoice-${orderData.order_number}.pdf`,
          content: invoiceBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  },

  /**
   * Send Shipment Created Notification Email
   * @param {Object} data 
   * @param {string} data.customer_email
   * @param {string} data.customer_name
   * @param {string} data.order_number
   * @param {string} data.awb_number
   * @param {string} data.tracking_url
   */
  sendShipmentCreatedEmail: async (data) => {
    if (!data.customer_email) {
      throw new Error("Customer email is missing for shipment email.");
    }

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333333;">
        <div style="text-align: center; border-bottom: 2px solid #D4AF37; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="color: #081A42; margin: 0; letter-spacing: 1px;">FABRIC LUXURE</h2>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Premium Tailoring & Custom Fabrics</p>
        </div>
        
        <p>Hello <strong>${data.customer_name || "Valued Customer"}</strong>,</p>
        <p>Great news!</p>
        <p>Your order has been shipped successfully.</p>
        <p>Below are your shipment details.</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 14px;">
          <p style="margin: 8px 0;"><strong>Order Number:</strong><br/>${data.order_number}</p>
          <p style="margin: 8px 0;"><strong>Courier Partner:</strong><br/>Delhivery</p>
          <p style="margin: 8px 0;"><strong>AWB Number:</strong><br/>${data.awb_number}</p>
          <p style="margin: 8px 0;"><strong>Tracking URL:</strong><br/><a href="${data.tracking_url}" target="_blank" style="color: #D4AF37;">${data.tracking_url}</a></p>
          <p style="margin: 8px 0;"><strong>Shipment Date:</strong><br/>${new Date().toLocaleDateString()}</p>
        </div>

        <p>You can track your shipment anytime using the button below.</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.tracking_url}" target="_blank" style="background-color: #D4AF37; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block;">Track Shipment</a>
        </div>
        
        <p>Thank you for shopping with Fabric Luxure.</p>
        
        <p style="margin-top: 30px;">Regards,<br/>Fabric Luxure Team</p>
      </div>
    `;

    return sendEmail({
      to: data.customer_email,
      subject: "Your Fabric Luxure Order Has Been Shipped",
      text: `Hello ${data.customer_name || "Valued Customer"},\n\nGreat news! Your order ${data.order_number} has been shipped successfully via Delhivery. AWB Number: ${data.awb_number}. Track here: ${data.tracking_url}\n\nRegards,\nFabric Luxure Team`,
      html: emailHtml,
    });
  },

  /**
   * Send Admin Notification Email
   * @param {Object} orderData
   */
  sendAdminNewOrderEmail: async (orderData) => {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      throw new Error("ADMIN_EMAIL environment variable is missing.");
    }

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333333;">
        <div style="text-align: center; border-bottom: 2px solid #D4AF37; padding-bottom: 15px; margin-bottom: 20px; background-color: #081A42; color: #white; padding: 10px;">
          <h2 style="color: #D4AF37; margin: 0; letter-spacing: 1px;">NEW ORDER RECEIVED</h2>
        </div>
        
        <p>A new paid order has been successfully created and is ready for processing.</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #081A42; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px;">Order Details</h4>
          <table style="width: 100%; font-size: 13px; line-height: 1.6;">
            <tr>
              <td><strong>Order Number:</strong></td>
              <td>${orderData.order_number}</td>
            </tr>
            <tr>
              <td><strong>Customer Name:</strong></td>
              <td>${orderData.address?.full_name || orderData.customer_name || "N/A"}</td>
            </tr>
            <tr>
              <td><strong>Customer Email:</strong></td>
              <td>${orderData.customer_email || "N/A"}</td>
            </tr>
            <tr>
              <td><strong>Customer Phone:</strong></td>
              <td>${orderData.address?.mobile || "N/A"}</td>
            </tr>
            <tr>
              <td><strong>Order Date:</strong></td>
              <td>${new Date(orderData.created_at).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td><strong>Order Status:</strong></td>
              <td>CONFIRMED</td>
            </tr>
            <tr>
              <td><strong>Payment Status:</strong></td>
              <td>SUCCESS</td>
            </tr>
            <tr>
              <td><strong>Payment Method:</strong></td>
              <td>${orderData.payment?.payment_method || "Online"}</td>
            </tr>
            <tr>
              <td><strong>Total Amount:</strong></td>
              <td><strong>₹${Number(orderData.grand_total).toLocaleString()}</strong></td>
            </tr>
            <tr>
              <td><strong>Number of Items:</strong></td>
              <td>${orderData.products.reduce((acc, item) => acc + item.quantity, 0)}</td>
            </tr>
            <tr>
              <td><strong>Shipping Destination:</strong></td>
              <td>${orderData.address?.city || "N/A"}, ${orderData.address?.state || "N/A"}</td>
            </tr>
          </table>
        </div>
        
        <p style="font-size: 12px; color: #777; text-align: center;">
          Please log into the Admin Portal to process this order.
        </p>
      </div>
    `;

    return sendEmail({
      to: adminEmail,
      subject: `New Order Received - ${orderData.order_number}`,
      text: `A new paid order has been successfully created: ${orderData.order_number}. Grand Total: ₹${orderData.grand_total}. Customer: ${orderData.address?.full_name || orderData.customer_name}`,
      html: emailHtml,
    });
  },

  /**
   * Send Admin Order Cancelled Notification Email
   * @param {Object} data - { orderNumber, customerName, customerEmail, grandTotal, cancellationReason, refundMethod, refundAmount, paymentMethod }
   */
  sendAdminOrderCancelledEmail: async (data) => {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      throw new Error("ADMIN_EMAIL environment variable is missing.");
    }

    const refundMethodLabel = {
      WALLET: "Store Wallet Credit",
      ORIGINAL_PAYMENT: "Original Payment Method (Bank/Gateway)",
      SPLIT: "Split — Wallet + Gateway",
    }[data.refundMethod] || data.refundMethod || "N/A";

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333333;">
        <div style="text-align: center; border-bottom: 2px solid #e53935; padding-bottom: 15px; margin-bottom: 20px; background-color: #081A42; padding: 10px;">
          <h2 style="color: #ff6b6b; margin: 0; letter-spacing: 1px;">ORDER CANCELLED BY CUSTOMER</h2>
        </div>

        <p>A customer has successfully cancelled their order. Please review the details below.</p>

        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #081A42; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px;">Cancellation Details</h4>
          <table style="width: 100%; font-size: 13px; line-height: 1.6;">
            <tr>
              <td><strong>Order Number:</strong></td>
              <td>${data.orderNumber}</td>
            </tr>
            <tr>
              <td><strong>Customer Name:</strong></td>
              <td>${data.customerName || "N/A"}</td>
            </tr>
            <tr>
              <td><strong>Customer Email:</strong></td>
              <td>${data.customerEmail || "N/A"}</td>
            </tr>
            <tr>
              <td><strong>Order Total:</strong></td>
              <td><strong>₹${Number(data.grandTotal || 0).toLocaleString()}</strong></td>
            </tr>
            <tr>
              <td><strong>Refund Amount:</strong></td>
              <td><strong style="color: #e53935;">₹${Number(data.refundAmount || 0).toLocaleString()}</strong></td>
            </tr>
            <tr>
              <td><strong>Refund Method:</strong></td>
              <td>${refundMethodLabel}</td>
            </tr>
            <tr>
              <td><strong>Payment Method:</strong></td>
              <td>${data.paymentMethod || "N/A"}</td>
            </tr>
            <tr>
              <td><strong>Cancellation Reason:</strong></td>
              <td>${data.cancellationReason || "No reason provided"}</td>
            </tr>
            <tr>
              <td><strong>Cancelled At:</strong></td>
              <td>${new Date().toLocaleString("en-IN")}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 12px; color: #777; text-align: center;">
          Please log into the Admin Portal to review this cancellation and process any pending actions.
        </p>
      </div>
    `;

    return sendEmail({
      to: adminEmail,
      subject: `Order Cancelled - ${data.orderNumber} | Fabric Luxure`,
      text: `Customer ${data.customerName || "N/A"} (${data.customerEmail || "N/A"}) has cancelled order ${data.orderNumber}. Refund Amount: ₹${data.refundAmount}. Reason: ${data.cancellationReason || "No reason provided"}.`,
      html: emailHtml,
    });
  },

  /**
   * Send corporate order notification email to Admin
   * @param {Object} options 
   */
  sendCorporateOrderEmail: async (options) => {
    // If ADMIN_EMAIL is not defined in env, fallback to MAIL_FROM_EMAIL
    const adminEmail = process.env.ADMIN_EMAIL || process.env.MAIL_FROM_EMAIL;
    
    return sendEmail({
      to: adminEmail,
      subject: options.subject,
      html: options.html,
      text: options.text || 'New Corporate Order Enquiry'
    });
  },

  sendStatusUpdateEmail: async ({ toEmail, orderNumber, status, customerName, awbNumber, trackingUrl, expectedDelivery }) => {
    let subject = `Order #${orderNumber} Update - Fabric Luxure`;
    let messageBody = "";
    let displayStatus = status;

    if (status === "ORDER_PLACED") {
      subject = `Your order ${orderNumber} has been placed`;
      displayStatus = "Order Placed";
      messageBody = "Your order has been successfully placed. We will notify you once preparation begins.";
    } else if (status === "SELLER_PREPARING") {
      subject = `We're preparing your order ${orderNumber}`;
      displayStatus = "Seller Preparing your Order";
      messageBody = "We're preparing your order. Your items are being packaged and prepared for shipping.";
    } else if (status === "ON_THE_WAY") {
      subject = `Your order ${orderNumber} is on the way`;
      displayStatus = "On the Way";
      messageBody = "Great news! Your order is now on the way and has been handed over to our courier partner Delhivery.";
    } else if (status === "OUT_FOR_DELIVERY") {
      subject = `Your order ${orderNumber} is out for delivery`;
      displayStatus = "Out for Delivery";
      messageBody = "Your package is out for delivery today. Please ensure someone is available at the address.";
    } else if (status === "DELIVERED") {
      subject = `Your order ${orderNumber} has been delivered`;
      displayStatus = "Delivered";
      messageBody = "Your order has been successfully delivered. Thank you for shopping with Fabric Luxure!";
    } else if (status === "CANCELLED") {
      subject = `Your order ${orderNumber} has been cancelled`;
      displayStatus = "Cancelled";
      messageBody = "Your order has been cancelled. Please check your account or contact support for details.";
    } else {
      messageBody = `Your order status has been updated to: ${status}.`;
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #081A42; border-bottom: 2px solid #D4AF37; padding-bottom: 10px;">Order Status Updated</h2>
        <p style="font-size: 16px; color: #333;">Dear ${customerName || "Customer"},</p>
        <p style="font-size: 16px; color: #333;">${messageBody}</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #D4AF37; margin: 20px 0; font-family: monospace; font-size: 13px;">
          <p style="margin: 0; font-size: 14px; color: #555;"><strong>Order Number:</strong> ${orderNumber}</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;"><strong>Current Status:</strong> <span style="color: #D4AF37; font-weight: bold;">${displayStatus}</span></p>
          ${awbNumber ? `<p style="margin: 5px 0 0 0; font-size: 14px; color: #555;"><strong>AWB Number:</strong> ${awbNumber}</p>` : ""}
          ${trackingUrl ? `<p style="margin: 5px 0 0 0; font-size: 14px; color: #555;"><strong>Tracking Link:</strong> <a href="${trackingUrl}" target="_blank" style="color: #D4AF37; text-decoration: underline;">Track on Delhivery</a></p>` : ""}
          ${expectedDelivery ? `<p style="margin: 5px 0 0 0; font-size: 14px; color: #555;"><strong>Expected Delivery:</strong> ${new Date(expectedDelivery).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>` : ""}
        </div>
        
        <p style="font-size: 14px; color: #777;">If you have any questions, please contact our support team.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin-top: 30px;" />
        <p style="font-size: 12px; color: #aaa; text-align: center;">Fabric Luxure &copy; 2026. All rights reserved.</p>
      </div>
    `;

    return sendEmail({
      to: toEmail,
      subject,
      html
    });
  },

  /**
   * Send OTP Email for Authentication (Signup / Forgot Password)
   * @param {string} toEmail 
   * @param {string} otp 
   * @param {string} purpose 
   */
  sendOtpEmail: async (toEmail, otp, purpose) => {
    let subject = "Your OTP from Fabric Luxure";
    let messageBody = "Please use the following OTP to proceed.";

    if (purpose === "signup") {
      subject = "Verify your email - Fabric Luxure";
      messageBody = "Thank you for registering with Fabric Luxure! Please use the OTP below to verify your email address and complete your registration. This OTP is valid for 5 minutes.";
    } else if (purpose === "forgot_password") {
      subject = "Password Reset OTP - Fabric Luxure";
      messageBody = "We received a request to reset your password. Please use the OTP below to set a new password. This OTP is valid for 5 minutes. If you did not request this, please ignore this email.";
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333333; text-align: center;">
        <div style="border-bottom: 2px solid #D4AF37; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="color: #081A42; margin: 0; letter-spacing: 1px;">FABRIC LUXURE</h2>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Premium Tailoring & Custom Fabrics</p>
        </div>
        
        <p style="font-size: 16px; color: #333;">${messageBody}</p>
        
        <div style="margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #081A42; padding: 10px 20px; background-color: #f9f9f9; border-radius: 6px; border: 1px solid #ddd;">${otp}</span>
        </div>

        <p style="font-size: 13px; color: #888;">If you did not request this OTP, please contact our support immediately.</p>

        <div style="margin-top: 30px; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 15px;">
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} Fabric Luxure. All rights reserved.</p>
        </div>
      </div>
    `;

    return sendEmail({
      to: toEmail,
      subject,
      html
    });
  },

  /**
   * Send Automatic Reply for Corporate Order
   * @param {Object} customerData
   */
  sendCorporateOrderConfirmationEmail: async (customerData) => {
    const subject = "Thank you for contacting Fabric Luxure";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333;">
        <p>Hello ${customerData.name},</p>
        <p>Thank you for submitting your Corporate Order enquiry.</p>
        <p>We have successfully received your request.</p>
        <p>Our team will review your enquiry and contact you shortly.</p>
        <p>If you have any urgent questions, please reply to this email.</p>
        <br/>
        <p>Regards,<br/>Fabric Luxure Team</p>
      </div>
    `;

    return sendEmail({
      to: customerData.email,
      subject,
      html
    });
  },

  /**
   * Send Admin Notification for Corporate Order
   * @param {Object} customerData
   */
  sendCorporateOrderAdminNotification: async (customerData) => {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@fabricluxure.com";
    const subject = "New Corporate Order Enquiry Received";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333;">
        <h2>New Corporate Order Enquiry</h2>
        <p><strong>Customer Name:</strong> ${customerData.name}</p>
        <p><strong>Company Name:</strong> ${customerData.company_name}</p>
        <p><strong>Email:</strong> ${customerData.email}</p>
        <p><strong>Phone Number:</strong> ${customerData.mobile}</p>
        <p><strong>Message:</strong></p>
        <p style="background-color: #f9f9f9; padding: 10px; border-left: 3px solid #D4AF37;">${customerData.message}</p>
        <p><strong>Submitted Date & Time:</strong> ${new Date().toLocaleString('en-IN')}</p>
      </div>
    `;

    return sendEmail({
      to: adminEmail,
      subject,
      html
    });
  },

  /**
   * Send Wallet Recharge Successful Email
   * @param {Object} data { name, email, amount, gateway, transactionId, balanceBefore, balanceAfter, date }
   */
  sendWalletRechargeEmail: async (data) => {
    const subject = "Wallet Recharge Successful | Fabric Luxure";
    
    const text = `Hello ${data.name},\n\nYour wallet has been successfully recharged.\n\nRecharge Amount: ₹${Number(data.amount).toLocaleString()}\nPayment Gateway: ${data.gateway}\nTransaction ID: ${data.transactionId}\nPrevious Balance: ₹${Number(data.balanceBefore).toLocaleString()}\nCurrent Balance: ₹${Number(data.balanceAfter).toLocaleString()}\nRecharge Date: ${new Date(data.date).toLocaleString()}\n\nRegards,\nFabric Luxure`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #f4f4f4;">
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333333; background-color: #ffffff;">
        <div style="text-align: center; border-bottom: 2px solid #D4AF37; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="color: #081A42; margin: 0; letter-spacing: 1px;">FABRIC LUXURE</h2>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Premium Tailoring & Custom Fabrics</p>
        </div>
        
        <div style="margin-bottom: 25px;">
          <h3 style="color: #D4AF37; margin-bottom: 10px;">Wallet Recharge Successful</h3>
          <p style="font-size: 14px; line-height: 1.5; color: #555;">
            Hello ${data.name},<br><br>
            Your wallet has been successfully recharged.
          </p>
        </div>

        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin-bottom: 25px; border-left: 4px solid #081A42;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 4px 0;"><strong>Recharge Amount:</strong></td>
              <td style="text-align: right; color: #081A42; font-weight: bold;">₹${Number(data.amount).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Payment Gateway:</strong></td>
              <td style="text-align: right;">${data.gateway}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Transaction ID:</strong></td>
              <td style="text-align: right;">${data.transactionId}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Previous Balance:</strong></td>
              <td style="text-align: right;">₹${Number(data.balanceBefore).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Current Balance:</strong></td>
              <td style="text-align: right; color: #2e7d32; font-weight: bold;">₹${Number(data.balanceAfter).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Recharge Date:</strong></td>
              <td style="text-align: right;">${new Date(data.date).toLocaleString()}</td>
            </tr>
          </table>
        <div style="font-size: 11px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 15px;">
          <p style="margin: 0;">If you didn't initiate this recharge or need help, contact our support team immediately.</p>
          <p style="margin: 5px 0 0 0;">&copy; ${new Date().getFullYear()} Fabric Luxure. All Rights Reserved.</p>
        </div>
      </div>
</body>
</html>`;
    return sendEmail({ to: data.email, subject, text, html });
  },

  /**
   * Send Super Admin Password Change OTP
   * @param {Object} data { email, otp }
   */
  sendSuperAdminOtpEmail: async (data) => {
    const subject = "Security Verification Code | Fabric Luxure";
    
    const text = `Hello Super Admin,\n\nA request has been made to change your Super Admin account password.\n\nYour verification code is: ${data.otp}\n\nThis OTP is valid for 5 minutes.\n\nIf you did not initiate this request, please ignore this email immediately.\n\nRegards,\nFabric Luxure`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #f4f4f4;">
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333333; background-color: #ffffff;">
        <div style="text-align: center; border-bottom: 2px solid #D4AF37; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="color: #081A42; margin: 0; letter-spacing: 1px;">FABRIC LUXURE</h2>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Premium Tailoring & Custom Fabrics</p>
        </div>
        
        <div style="margin-bottom: 25px;">
          <h3 style="color: #D4AF37; margin-bottom: 10px;">Security Verification Code</h3>
          <p style="font-size: 14px; line-height: 1.5; color: #555;">
            Hello Super Admin,<br><br>
            A request has been made to change your Super Admin account password.
          </p>
        </div>

        <div style="background-color: #f8fafc; padding: 20px; border-radius: 6px; margin-bottom: 25px; border-left: 4px solid #081A42; text-align: center;">
          <p style="font-size: 14px; color: #555; margin-bottom: 10px;">Your verification code is</p>
          <p style="font-size: 28px; font-weight: bold; color: #081A42; letter-spacing: 4px; margin: 0;">${data.otp}</p>
        </div>
        
        <p style="font-size: 14px; line-height: 1.5; color: #555;">
          This OTP is valid for <strong>5 minutes</strong>.
        </p>
        <p style="font-size: 13px; line-height: 1.5; color: #888;">
          If you did not initiate this request, please ignore this email immediately.
        </p>

        <div style="font-size: 11px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 15px; margin-top: 30px;">
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} Fabric Luxure. All Rights Reserved.</p>
        </div>
      </div>
</body>
</html>`;

    return sendEmail({
      to: data.email,
      subject,
      text,
      html
    });
  },

  /**
   * Send Wallet Payment Used For Order Email
   * @param {Object} data { name, email, orderNumber, amount, balanceBefore, balanceAfter, date }
   */
  sendWalletPaymentEmail: async (data) => {
    const subject = "Wallet Payment Successful | Fabric Luxure";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333333;">
        <div style="text-align: center; border-bottom: 2px solid #D4AF37; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="color: #081A42; margin: 0; letter-spacing: 1px;">FABRIC LUXURE</h2>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Premium Tailoring & Custom Fabrics</p>
        </div>
        
        <div style="margin-bottom: 25px;">
          <h3 style="color: #D4AF37; margin-bottom: 10px;">Wallet Payment Successful</h3>
          <p style="font-size: 14px; line-height: 1.5; color: #555;">
            Hello ${data.name},<br><br>
            Your wallet balance has been used successfully for your recent order.
          </p>
        </div>

        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin-bottom: 25px; border-left: 4px solid #081A42;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 4px 0;"><strong>Order Number:</strong></td>
              <td style="text-align: right; color: #081A42; font-weight: bold;">${data.orderNumber}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Amount Deducted:</strong></td>
              <td style="text-align: right; color: #d32f2f; font-weight: bold;">-₹${Number(data.amount).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Previous Balance:</strong></td>
              <td style="text-align: right;">₹${Number(data.balanceBefore).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Current Balance:</strong></td>
              <td style="text-align: right;">₹${Number(data.balanceAfter).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Order Date:</strong></td>
              <td style="text-align: right;">${new Date(data.date).toLocaleString()}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 13px; color: #555; text-align: center; margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 15px;">
          For any questions, please contact our support team.
        </p>
      </div>
    `;
    return sendEmail({ to: data.email, subject, html });
  },

  /**
   * Send Wallet Refund Successful Email
   * @param {Object} data { name, email, orderNumber, amount, balanceBefore, balanceAfter, date }
   */
  sendWalletRefundEmail: async (data) => {
    const subject = "Wallet Refund Processed | Fabric Luxure";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333333;">
        <div style="text-align: center; border-bottom: 2px solid #D4AF37; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="color: #081A42; margin: 0; letter-spacing: 1px;">FABRIC LUXURE</h2>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Premium Tailoring & Custom Fabrics</p>
        </div>
        
        <div style="margin-bottom: 25px;">
          <h3 style="color: #D4AF37; margin-bottom: 10px;">Wallet Refund Processed</h3>
          <p style="font-size: 14px; line-height: 1.5; color: #555;">
            Hello ${data.name},<br><br>
            Your refund has been credited successfully to your wallet.
          </p>
        </div>

        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin-bottom: 25px; border-left: 4px solid #081A42;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 4px 0;"><strong>Order Number:</strong></td>
              <td style="text-align: right; color: #081A42; font-weight: bold;">${data.orderNumber}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Refund Amount:</strong></td>
              <td style="text-align: right; color: #2e7d32; font-weight: bold;">+₹${Number(data.amount).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Previous Balance:</strong></td>
              <td style="text-align: right;">₹${Number(data.balanceBefore).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Current Balance:</strong></td>
              <td style="text-align: right; font-weight: bold;">₹${Number(data.balanceAfter).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Refund Date:</strong></td>
              <td style="text-align: right;">${new Date(data.date).toLocaleString()}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 13px; color: #555; text-align: center; margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 15px;">
          For any questions, please contact our support team.
        </p>
      </div>
    `;
    return sendEmail({ to: data.email, subject, html });
  },

  /**
   * Send Admin Wallet Credit Email
   * @param {Object} data { name, email, amount, reason, remarks, balanceBefore, balanceAfter, date }
   */
  sendWalletAdminCreditEmail: async (data) => {
    const subject = "Wallet Credited By Admin | Fabric Luxure";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333333;">
        <div style="text-align: center; border-bottom: 2px solid #D4AF37; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="color: #081A42; margin: 0; letter-spacing: 1px;">FABRIC LUXURE</h2>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #777;">Premium Tailoring & Custom Fabrics</p>
        </div>
        
        <div style="margin-bottom: 25px;">
          <h3 style="color: #D4AF37; margin-bottom: 10px;">Wallet Credited</h3>
          <p style="font-size: 14px; line-height: 1.5; color: #555;">
            Hello ${data.name},<br><br>
            Our team has credited funds to your wallet.
          </p>
        </div>

        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin-bottom: 25px; border-left: 4px solid #081A42;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 4px 0;"><strong>Amount Credited:</strong></td>
              <td style="text-align: right; color: #2e7d32; font-weight: bold;">+₹${Number(data.amount).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Reason:</strong></td>
              <td style="text-align: right;">${data.reason}</td>
            </tr>
            ${data.remarks ? `
            <tr>
              <td style="padding: 4px 0;"><strong>Remarks:</strong></td>
              <td style="text-align: right;">${data.remarks}</td>
            </tr>
            ` : ""}
            <tr>
              <td style="padding: 4px 0;"><strong>Previous Balance:</strong></td>
              <td style="text-align: right;">₹${Number(data.balanceBefore).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Current Balance:</strong></td>
              <td style="text-align: right; font-weight: bold;">₹${Number(data.balanceAfter).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Date:</strong></td>
              <td style="text-align: right;">${new Date(data.date).toLocaleString()}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 13px; color: #555; text-align: center; margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 15px;">
          For any questions, please contact our support team.
        </p>
      </div>
    `;
    return sendEmail({ to: data.email, subject, html });
  }
};
