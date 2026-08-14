const axios = require("axios");
const ConnectDB = require("../../config/db");
const ShippingService = require("./ShippingService");

class ShiprocketService extends ShippingService {
  constructor() {
    super();
    this.apiToken = process.env.SHIPROCKET_API_TOKEN;
    this.baseUrl = "https://apiv2.shiprocket.in/v1/external";
  }

  async getHeaders() {
    if (!this.apiToken) {
      throw new Error("SHIPROCKET_API_TOKEN is not defined in environment variables.");
    }
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiToken}`
    };
  }

  async createShipment(shipmentObject) {
    console.log("[SHIPROCKET] Initiating Create Shipment flow for order:", shipmentObject.order_id);
    const headers = await this.getHeaders();
    
    let provider_order_id = null;
    let provider_shipment_id = null;
    let awb_number = null;
    let courier_name = null;
    let courier_tracking_id = null;
    let provider_pickup_id = null;
    let label_url = null;
    let manifest_url = null;
    let tracking_url = null;
    let provider_response = {};

    try {
      // 1. Create Custom Order
      const createOrderPayload = {
        order_id: shipmentObject.order_id,
        order_date: shipmentObject.order_date,
        pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || "Primary",
        billing_customer_name: shipmentObject.billing_customer_name,
        billing_last_name: shipmentObject.billing_last_name || "",
        billing_address: shipmentObject.billing_address,
        billing_address_2: shipmentObject.billing_address_2 || "",
        billing_city: shipmentObject.billing_city,
        billing_pincode: shipmentObject.billing_pincode,
        billing_state: shipmentObject.billing_state,
        billing_country: shipmentObject.billing_country || "India",
        billing_email: shipmentObject.billing_email,
        billing_phone: shipmentObject.billing_phone,
        shipping_is_billing: true,
        order_items: shipmentObject.order_items || [],
        payment_method: shipmentObject.payment_method || "Prepaid",
        sub_total: shipmentObject.sub_total,
        length: shipmentObject.length || 10,
        breadth: shipmentObject.breadth || 10,
        height: shipmentObject.height || 10,
        weight: shipmentObject.weight || 0.5
      };

      console.log("[SHIPROCKET] Creating Order...", createOrderPayload.order_id);
      const orderRes = await axios.post(`${this.baseUrl}/orders/create/adhoc`, createOrderPayload, { headers });
      provider_response.create_order = orderRes.data;
      
      provider_order_id = orderRes.data.order_id;
      provider_shipment_id = orderRes.data.shipment_id;

      if (!provider_shipment_id) {
        throw new Error("Failed to generate shipment_id from Shiprocket.");
      }

      // 2. Generate AWB
      console.log("[SHIPROCKET] Assigning AWB for shipment:", provider_shipment_id);
      const awbPayload = { shipment_id: provider_shipment_id };
      const awbRes = await axios.post(`${this.baseUrl}/courier/assign/awb`, awbPayload, { headers });
      provider_response.assign_awb = awbRes.data;

      if (awbRes.data.awb_assign_status === 0) {
        const errorMsg = awbRes.data.response?.data?.message || awbRes.data.message || "Awb not Assigned";
        throw new Error(errorMsg);
      }

      if (awbRes.data.response && awbRes.data.response.data && awbRes.data.response.data.awb_code) {
        awb_number = awbRes.data.response.data.awb_code;
        courier_name = awbRes.data.response.data.courier_name;
        courier_tracking_id = awbRes.data.response.data.awb_code;
      } else {
        throw new Error("Failed to assign AWB from Shiprocket: missing awb_code in response.");
      }

      // 3. Request Pickup
      console.log("[SHIPROCKET] Requesting Pickup for shipment:", provider_shipment_id);
      try {
        const pickupPayload = { shipment_id: [provider_shipment_id] };
        const pickupRes = await axios.post(`${this.baseUrl}/courier/generate/pickup`, pickupPayload, { headers });
        provider_response.generate_pickup = pickupRes.data;
        
        if (pickupRes.data.response && pickupRes.data.response.pickup_token_number) {
          provider_pickup_id = pickupRes.data.response.pickup_token_number;
        }
      } catch (pickupErr) {
        console.warn("[SHIPROCKET] Pickup request warning:", pickupErr.response?.data?.message || pickupErr.message);
        provider_response.generate_pickup_error = pickupErr.response?.data || pickupErr.message;
      }

      // 4. Generate Tracking URL
      tracking_url = `https://shiprocket.co/tracking/${awb_number}`;

      // 5. Generate Label
      console.log("[SHIPROCKET] Generating Label for shipment:", provider_shipment_id);
      try {
        const labelPayload = { shipment_id: [provider_shipment_id] };
        const labelRes = await axios.post(`${this.baseUrl}/courier/generate/label`, labelPayload, { headers });
        provider_response.generate_label = labelRes.data;
        if (labelRes.data.label_created === 1) {
          label_url = labelRes.data.label_url;
        }
      } catch (labelErr) {
        console.warn("[SHIPROCKET] Label generation warning:", labelErr.message);
        provider_response.generate_label_error = labelErr.message;
      }

      // 6. Generate Manifest
      console.log("[SHIPROCKET] Generating Manifest for shipment:", provider_shipment_id);
      try {
        const manifestPayload = { shipment_id: [provider_shipment_id] };
        const manifestRes = await axios.post(`${this.baseUrl}/manifests/generate`, manifestPayload, { headers });
        provider_response.generate_manifest = manifestRes.data;
        if (manifestRes.data.status === 1) {
          manifest_url = manifestRes.data.manifest_url;
        }
      } catch (manifestErr) {
        console.warn("[SHIPROCKET] Manifest generation warning:", manifestErr.message);
        provider_response.generate_manifest_error = manifestErr.message;
      }

      return {
        success: true,
        provider_order_id,
        provider_shipment_id,
        awb_number,
        courier_name,
        courier_tracking_id,
        provider_pickup_id,
        tracking_url,
        label_url,
        manifest_url,
        provider_response,
        shipment_status: 'SHIPMENT_CREATED'
      };

    } catch (error) {
      console.error("❌ [SHIPROCKET API ERROR]:", error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || error.message || "Shiprocket Shipment Creation Failed.";
      throw new Error(`Shiprocket API Error: ${errorMessage}`);
    }
  }

  async cancelShipment(awb) {
    try {
      const headers = await this.getHeaders();
      const ConnectDB = require("../../config/db");

      // We must cancel by Shiprocket's internal order_id, not the AWB
      const [rows] = await ConnectDB.query(
        "SELECT provider_response FROM shipment_details WHERE awb_number = ?",
        [awb]
      );
      
      let providerOrderId = null;
      if (rows.length > 0 && rows[0].provider_response) {
        let providerRes = rows[0].provider_response;
        if (typeof providerRes === 'string') {
          try { providerRes = JSON.parse(providerRes); } catch(e) {}
        }
        // Could be in tracking_data.shipment_track[0].order_id or create_order.order_id
        if (providerRes.tracking_data?.shipment_track?.[0]?.order_id) {
          providerOrderId = providerRes.tracking_data.shipment_track[0].order_id;
        } else if (providerRes.create_order?.order_id) {
          providerOrderId = providerRes.create_order.order_id;
        }
      }

      if (!providerOrderId) {
         throw new Error("Could not find Shiprocket Order ID in database for this AWB.");
      }

      const response = await axios.post(
        `${this.baseUrl}/orders/cancel`,
        { ids: [providerOrderId] },
        { headers }
      );
      
      return {
        status: true,
        message: "Shipment cancelled successfully in Shiprocket."
      };
    } catch (error) {
      console.error("❌ [SHIPROCKET CANCEL ERROR]:", error.response?.data || error.message);
      return {
        status: false,
        message: error.response?.data?.message || "Failed to cancel shipment in Shiprocket."
      };
    }
  }

  async syncShipment(shipment, connection = null) {
    const awb = shipment.awb_number;
    const executeQuery = async (query, params) => {
      if (connection) return connection.query(query, params);
      return ConnectDB.query(query, params);
    };

    const [orderRows] = await executeQuery("SELECT order_status, order_number FROM orders WHERE order_id = ?", [shipment.order_id]);
    const orderObj = orderRows[0];
    if (!orderObj || orderObj.order_status === "CANCELLED" || orderObj.order_status === "DELIVERED") {
      console.log(`[SHIPMENT SYNC SKIP] Skipping sync for AWB ${awb} because order status is terminal: ${orderObj?.order_status}`);
      return {
        success: true,
        awbNumber: awb,
        rawStatus: shipment.shipment_status,
        normalizedStatus: orderObj?.order_status,
        statusChanged: false
      };
    }

    const trackingResult = await this.getShipmentStatus(awb, orderObj.order_number || orderObj.order_id);
    if (!trackingResult.success) {
      throw new Error(`Shiprocket tracking API failed: ${trackingResult.message}`);
    }

    const rawStatus = trackingResult.raw_status;
    const normalizedStatus = this.normalizeStatus(rawStatus);
    const prevNormalizedStatus = orderObj.order_status;
    const prevRawStatus = shipment.shipment_status;

    const prevPriority = this.getStatusPriority(prevNormalizedStatus);
    const newPriority = this.getStatusPriority(normalizedStatus);

    let statusChanged = false;
    if (newPriority > prevPriority || (prevPriority === -1 && newPriority !== -1)) {
      statusChanged = true;
    }

    const isException = normalizedStatus === "CANCELLED";
    if (isException && normalizedStatus !== prevNormalizedStatus) {
      statusChanged = true;
    }

    const rawStatusChanged = rawStatus !== prevRawStatus;

    if (statusChanged || rawStatusChanged) {
      console.log(`[SHIPMENT SYNC] Updating AWB ${awb}: Raw(${prevRawStatus} -> ${rawStatus}), Internal(${prevNormalizedStatus} -> ${normalizedStatus})`);

      await executeQuery(
        `UPDATE shipment_details
         SET shipment_status = ?, expected_delivery = ?, delivered_date = ?, provider_response = ?, api_response_updated_at = NOW(), last_tracking_sync = NOW(), updated_at = NOW()
         WHERE order_id = ?`,
        [
          rawStatus, // NOW SAVING EXACT PROVIDER RAW STATUS
          trackingResult.expected_delivery || shipment.expected_delivery || null,
          trackingResult.delivered_date || shipment.delivered_date || null,
          JSON.stringify(trackingResult.rawResponse),
          shipment.order_id
        ]
      );

      if (statusChanged) {
        await executeQuery(
          `UPDATE orders
           SET order_status = ?, updated_at = NOW()
           WHERE order_id = ?`,
          [normalizedStatus, shipment.order_id]
        );

        await executeQuery(
          `INSERT INTO order_status_history (order_id, status, remarks, created_at)
           VALUES (?, ?, ?, NOW())`,
          [shipment.order_id, normalizedStatus, `Status updated to ${normalizedStatus} via Shiprocket`]
        );

        try {
          const emailService = require("../email.service");
          const [orderRows2] = await executeQuery("SELECT * FROM orders WHERE order_id = ?", [shipment.order_id]);
          const order2 = orderRows2[0];
          if (order2) {
            const [userRows] = await executeQuery("SELECT email FROM users WHERE user_id = ?", [order2.user_id]);
            const email = userRows[0]?.email;
            if (email) {
              const [addressRows] = await executeQuery("SELECT full_name FROM user_addresses WHERE address_id = ?", [order2.address_id]);
              const customerName = addressRows[0]?.full_name || "Customer";

              await emailService.sendStatusUpdateEmail({
                toEmail: email,
                orderNumber: order2.order_number,
                status: normalizedStatus,
                customerName,
                awbNumber: awb,
                trackingUrl: shipment.tracking_url || `https://shiprocket.co/tracking/${awb}`,
                expectedDelivery: trackingResult.expected_delivery || shipment.expected_delivery || null
              });
            }
          }
        } catch (emailErr) {
          console.error(`❌ [SHIPMENT SYNC EMAIL ERROR] Failed to send status change email:`, emailErr.message);
        }
      }
    } else {
      await executeQuery(
        `UPDATE shipment_details
         SET expected_delivery = ?, delivered_date = ?, provider_response = ?, api_response_updated_at = NOW(), last_tracking_sync = NOW()
         WHERE order_id = ?`,
        [
          trackingResult.expected_delivery || shipment.expected_delivery || null,
          trackingResult.delivered_date || shipment.delivered_date || null,
          JSON.stringify(trackingResult.rawResponse),
          shipment.order_id
        ]
      );
    }

    return {
      success: true,
      awbNumber: awb,
      rawStatus,
      normalizedStatus,
      statusChanged,
      expectedDelivery: trackingResult.expected_delivery || shipment.expected_delivery || null,
      pickupDate: trackingResult.pickup_date || shipment.pickup_date || null,
      deliveredDate: trackingResult.delivered_date || shipment.delivered_date || null,
      scans: trackingResult.scans || [],
      rawResponse: trackingResult.rawResponse || null
    };
  }

  async cancelShipment(waybill) {
    try {
      const headers = await this.getHeaders();
      const cancelUrl = `${this.baseUrl}/orders/cancel`;
      console.log(`[SHIPROCKET] Cancelling AWB: ${waybill}`);
      
      const payload = { awbs: [waybill] };
      
      const response = await axios.post(cancelUrl, payload, { headers });
      const resData = response.data;
      
      return { status: true, message: "Cancelled Successfully", raw: resData };
    } catch (error) {
      console.error("❌ [SHIPROCKET CANCEL ERROR]:", error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || error.message || "Cancellation Failed.";
      return { status: false, remark: errorMessage, message: errorMessage };
    }
  }

  async getShipmentStatus(waybill, refid) {
    try {
      const headers = await this.getHeaders();
      const trackingUrl = `${this.baseUrl}/courier/track/awb/${waybill}`;
      console.log(`[SHIPROCKET] Tracking AWB: ${waybill}`);
      const response = await axios.get(trackingUrl, { headers });
      
      const resData = response.data;
      if (!resData || !resData.tracking_data || resData.tracking_data.track_status !== 1) {
        return { success: false, message: "No tracking details found for AWB." };
      }

      const trackingData = resData.tracking_data;
      // Shiprocket tracking API usually returns an integer for shipment_status, but string in shipment_track[0].current_status
      let rawStatus = trackingData.shipment_status || "NEW";
      
      if (trackingData.shipment_track && trackingData.shipment_track.length > 0) {
        if (trackingData.shipment_track[0].current_status) {
           rawStatus = trackingData.shipment_track[0].current_status;
        }
      }
      
      // Ensure rawStatus is a string before passing to normalizeStatus
      rawStatus = String(rawStatus);
      const normalizedStatus = this.normalizeStatus(rawStatus);
      
      let deliveredDate = null;
      if (normalizedStatus === 'DELIVERED' && trackingData.shipment_track && trackingData.shipment_track.length > 0) {
          deliveredDate = new Date(trackingData.shipment_track[0].delivered_date);
      }
      
      const expectedDelivery = trackingData.etd ? new Date(trackingData.etd) : null;
      
      const scans = (trackingData.shipment_track_activities || []).map(s => ({
        status: s.activity,
        date: s.date,
        location: s.location,
        remarks: s.activity
      }));

      return {
        success: true,
        awb_number: waybill,
        raw_status: rawStatus,
        normalized_status: normalizedStatus,
        pickup_date: null,
        expected_delivery: expectedDelivery,
        delivered_date: deliveredDate,
        last_tracking_sync: new Date(),
        scans,
        rawResponse: resData
      };
    } catch (error) {
      console.error("❌ [SHIPROCKET TRACKING ERROR]:", error.message);
      return { success: false, message: `Tracking API Call Failed: ${error.message}` };
    }
  }

  normalizeStatus(rawStatus) {
    if (!rawStatus) return "CREATED";
    const status = String(rawStatus).toUpperCase().replace(/ /g, '_').trim();
    
    // DELIVERED
    if (status === "DELIVERED") return "DELIVERED";
    
    // CANCELLED
    if (["CANCELLED", "RTO_INITIATED", "RTO_IN_TRANSIT", "RTO_OUT_FOR_DELIVERY", "RTO_DELIVERED", "RTO_DELIVERED_TO_SELLER", "LOST", "DAMAGED"].includes(status)) {
      return "CANCELLED";
    }
    
    // OUT FOR DELIVERY
    if (status === "OUT_FOR_DELIVERY") return "OUT_FOR_DELIVERY";
    
    // ON THE WAY
    if (["PICKED_UP", "SHIPPED", "IN_TRANSIT", "REACHED_DESTINATION"].includes(status)) {
      return "ON_THE_WAY";
    }
    
    // SELLER PREPARING
    if (["AWAITING_PICKUP", "PICKUP_SCHEDULED", "PICKUP_GENERATED", "AWB_ASSIGNED", "LABEL_GENERATED", "READY_TO_SHIP", "OUT_FOR_PICKUP"].includes(status)) {
      return "CREATED";
    }

    // ORDER PLACED
    if (status === "NEW") return "ORDER_PLACED";
    
    return "CREATED";
  }

  buildDeliveryTimeline(order, shipment, scans = [], statusHistory = []) {
    const history = Array.isArray(statusHistory) ? statusHistory : [];
    const isCancelled = order.order_status === "CANCELLED";

    const findScanTime = (keywords) => {
      if (!Array.isArray(scans)) return null;
      const found = scans.find(s => {
        const sName = (s.status || "").toLowerCase();
        return keywords.some(k => sName.includes(k));
      });
      return found ? found.date : null;
    };

    const findHistoryTime = (statusKey) => {
      const found = history.find(h => h.status === statusKey);
      return found ? found.created_at : null;
    };

    if (isCancelled) {
      const timeline = [];
      timeline.push({
        key: "ORDER_PLACED",
        label: "Order Placed",
        completed: true,
        current: false,
        timestamp: findHistoryTime("ORDER_PLACED") || order.created_at
      });

      const hasPreparing = history.some(h => ["CREATED", "SELLER_PREPARING", "SHIPMENT_CREATED"].includes(h.status));
      if (hasPreparing) {
        timeline.push({
          key: "CREATED",
          label: "Seller Preparing your Order",
          completed: true,
          current: false,
          timestamp: findHistoryTime("CREATED") || findHistoryTime("SELLER_PREPARING") || (shipment && shipment.created_at) || order.updated_at
        });
      }

      timeline.push({
        key: "CANCELLED",
        label: "Cancelled",
        completed: true,
        current: true,
        timestamp: findHistoryTime("CANCELLED") || order.updated_at
      });

      return timeline;
    }

    const timelineKeys = [
      { key: "ORDER_PLACED", label: "Order Placed" },
      { key: "CREATED", label: "Seller Preparing your Order" },
      { key: "ON_THE_WAY", label: "On the Way" },
      { key: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
      { key: "DELIVERED", label: "Delivered" }
    ];

    const getIndex = (status) => {
      if (!status) return -1;
      if (status === "DELIVERED") return 4;
      if (status === "OUT_FOR_DELIVERY") return 3;
      if (["ON_THE_WAY", "IN_TRANSIT"].includes(status)) return 2;
      if (["CREATED", "SELLER_PREPARING", "AWB_ASSIGNED", "READY_FOR_PICKUP", "PICKUP_REQUESTED", "SHIPMENT_CREATED"].includes(status)) return 1;
      return 0;
    };

    const currentDbIndex = getIndex(order.order_status);
    const normalizedStatus = shipment && shipment.awb_number
      ? this.normalizeStatus(shipment.shipment_status)
      : null;
    const normalizedIndex = normalizedStatus ? getIndex(normalizedStatus) : -1;
    const currentIndex = normalizedIndex > currentDbIndex ? normalizedIndex : currentDbIndex;

    return timelineKeys.map((item, idx) => {
      const completed = idx <= currentIndex;
      const current = idx === currentIndex;
      let timestamp = null;

      if (completed) {
        timestamp = findHistoryTime(item.key);
        if (!timestamp) {
          if (item.key === "ORDER_PLACED") {
            timestamp = order.created_at;
          } else if (item.key === "CREATED") {
            timestamp = (shipment && shipment.created_at) || order.updated_at;
          } else if (item.key === "ON_THE_WAY") {
            timestamp = findScanTime(["pick", "transit", "dispatched", "scan"]);
          } else if (item.key === "OUT_FOR_DELIVERY") {
            timestamp = findScanTime(["out for", "delivering", "ofd"]);
          } else if (item.key === "DELIVERED") {
            timestamp = (shipment && shipment.delivered_date) || findScanTime(["deliver"]);
          }
        }
      }

      return {
        key: item.key,
        label: item.label,
        completed,
        current,
        timestamp
      };
    });
  }

  getStatusPriority(status) {
    const priorities = {
      "ORDER_PLACED": 0,
      "CREATED": 1,
      "SHIPMENT_CREATED": 1,
      "SELLER_PREPARING": 1,
      "AWB_ASSIGNED": 2,
      "READY_FOR_PICKUP": 3,
      "PICKUP_REQUESTED": 4,
      "ON_THE_WAY": 5,
      "IN_TRANSIT": 6,
      "OUT_FOR_DELIVERY": 7,
      "DELIVERED": 8
    };
    return priorities[status] !== undefined ? priorities[status] : -1;
  }
}

module.exports = ShiprocketService;
