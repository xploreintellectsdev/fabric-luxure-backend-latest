const cron = require("node-cron");
const ConnectDB = require("../config/db");
const delhiveryService = require("./delhivery.service");

let isRunning = false;

const runTrackingSync = async () => {
  if (isRunning) {
    console.log("[DELHIVERY SYNC] Previous tracking sync still running. Skipping overlapping execution.");
    return;
  }

  isRunning = true;
  console.log("[DELHIVERY SYNC] Starting tracking sync...");

  try {
    const [shipments] = await ConnectDB.query(
      `SELECT sd.*, o.order_number FROM shipment_details sd
       INNER JOIN orders o ON sd.order_id = o.order_id
       WHERE sd.awb_number IS NOT NULL
         AND o.order_status NOT IN ('DELIVERED', 'CANCELLED')`
    );

    console.log(`[DELHIVERY SYNC] Found ${shipments.length} active shipments to synchronize.`);

    for (const shipment of shipments) {
      try {
        console.log(`[DELHIVERY SYNC] Checking AWB: ${shipment.awb_number} (Order: ${shipment.order_number})`);
        const syncResult = await delhiveryService.syncDelhiveryShipmentStatus(shipment);
        console.log(`[DELHIVERY SYNC] Raw status: ${syncResult.rawStatus}`);
        console.log(`[DELHIVERY SYNC] Normalized status: ${syncResult.normalizedStatus}`);
        console.log(`[DELHIVERY SYNC] Status updated: ${syncResult.statusChanged}`);
      } catch (shipmentErr) {
        console.error(`❌ [DELHIVERY SYNC ERROR] Failed to sync AWB ${shipment.awb_number}:`, shipmentErr.message);
      }
    }

    console.log("[DELHIVERY SYNC] Completed");
  } catch (error) {
    console.error("❌ [DELHIVERY SYNC FATAL ERROR] Scheduler run failed:", error.message);
  } finally {
    isRunning = false;
  }
};

const initScheduler = () => {
  console.log("[DELHIVERY SYNC] Scheduler initialization requested but disabled (Using event-triggered sync).");
  // cron.schedule("*/15 * * * *", runTrackingSync);
};

module.exports = {
  initScheduler,
  runTrackingSync
};
