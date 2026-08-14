const DelhiveryService = require("./DelhiveryService");
const ShiprocketService = require("./ShiprocketService");

class ShippingFactory {
  static getProvider(providerName) {
    const provider = String(providerName).toUpperCase().trim();

    if (provider === "DELHIVERY") {
      return new DelhiveryService();
    } else if (provider === "SHIPROCKET") {
      return new ShiprocketService();
    } else {
      console.warn(`[SHIPPING FACTORY] Unknown provider "${providerName}", falling back to DELHIVERY`);
      // Default to Delhivery for backward compatibility
      return new DelhiveryService();
    }
  }
}

module.exports = ShippingFactory;
