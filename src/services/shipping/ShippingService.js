class ShippingService {
  constructor() {
    if (new.target === ShippingService) {
      throw new Error("Cannot instantiate ShippingService directly.");
    }
  }

  async createShipment(shipmentObject) {
    throw new Error("Method 'createShipment()' must be implemented.");
  }

  async syncShipment(shipment, connection = null) {
    throw new Error("Method 'syncShipment()' must be implemented.");
  }

  async cancelShipment(waybill) {
    throw new Error("Method 'cancelShipment()' must be implemented.");
  }

  async getShipmentStatus(waybill, refid) {
    throw new Error("Method 'getShipmentStatus()' must be implemented.");
  }

  normalizeStatus(rawStatus) {
    throw new Error("Method 'normalizeStatus()' must be implemented.");
  }

  buildDeliveryTimeline(order, shipment, scans = [], statusHistory = []) {
    throw new Error("Method 'buildDeliveryTimeline()' must be implemented.");
  }

  getStatusPriority(status) {
    throw new Error("Method 'getStatusPriority()' must be implemented.");
  }
}

module.exports = ShippingService;
