const ShippingFactory = require("./shipping/ShippingFactory");

// Instantiate the Delhivery provider once for this module to act as an adapter
const delhiveryProvider = ShippingFactory.getProvider("DELHIVERY");

module.exports = {
  createDelhiveryShipment: (shipmentObject) => delhiveryProvider.createShipment(shipmentObject),
  normalizeDelhiveryStatus: (rawStatus) => delhiveryProvider.normalizeStatus(rawStatus),
  getShipmentStatus: (waybill, refid) => delhiveryProvider.getShipmentStatus(waybill, refid),
  buildDeliveryTimeline: (order, shipment, scans, statusHistory) => delhiveryProvider.buildDeliveryTimeline(order, shipment, scans, statusHistory),
  getStatusPriority: (status) => delhiveryProvider.getStatusPriority(status),
  syncDelhiveryShipmentStatus: (shipment, connection) => delhiveryProvider.syncShipment(shipment, connection),
  cancelDelhiveryShipment: (waybill) => delhiveryProvider.cancelShipment(waybill)
};
