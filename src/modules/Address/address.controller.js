const addressService = require("./address.service");

/**
 * Create a new address
 */
const createAddress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      fullName,
      mobile,
      alternateMobile,
      houseBuilding,
      streetLocality,
      landmark,
      city,
      state,
      country,
      postalCode,
      addressType,
      isDefault,
    } = req.body;

    // Validation checks
    if (
      !fullName ||
      !mobile ||
      !houseBuilding ||
      !streetLocality ||
      !city ||
      !state ||
      !postalCode ||
      !addressType
    ) {
      return res.status(400).json({
        success: false,
        error: "All required fields (fullName, mobile, houseBuilding, streetLocality, city, state, postalCode, addressType) must be completed.",
      });
    }

    const newAddress = await addressService.createAddress({
      userId,
      fullName,
      mobile,
      alternateMobile,
      houseBuilding,
      streetLocality,
      landmark,
      city,
      state,
      country,
      postalCode,
      addressType,
      isDefault: !!isDefault,
    });

    return res.status(201).json({
      success: true,
      message: "Address created successfully.",
      data: newAddress,
    });
  } catch (error) {
    console.error("❌ Create Address Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
};

/**
 * Get all addresses of the logged-in user
 */
const getAddresses = async (req, res) => {
  try {
    const userId = req.user.userId;
    const addresses = await addressService.getUserAddresses(userId);

    // Map DB fields to camelCase response formatting
    const formatted = addresses.map((addr) => ({
      addressId: addr.address_id,
      userId: addr.user_id,
      addressOrder: addr.address_order,
      fullName: addr.full_name,
      mobile: addr.mobile,
      alternateMobile: addr.alternate_mobile,
      houseBuilding: addr.house_building,
      streetLocality: addr.street_locality,
      landmark: addr.landmark,
      city: addr.city,
      state: addr.state,
      country: addr.country,
      postalCode: addr.postal_code,
      addressType: addr.address_type,
      isDefault: addr.is_default === 1 || addr.is_default === true,
      createdAt: addr.created_at,
      updatedAt: addr.updated_at,
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error("❌ Get Addresses Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
};

/**
 * Get a single address by id
 */
const getAddressById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const addressId = req.params.id;

    const address = await addressService.getAddressById(addressId, userId);
    if (!address) {
      return res.status(404).json({
        success: false,
        error: "Address not found or access denied.",
      });
    }

    const formatted = {
      addressId: address.address_id,
      userId: address.user_id,
      addressOrder: address.address_order,
      fullName: address.full_name,
      mobile: address.mobile,
      alternateMobile: address.alternate_mobile,
      houseBuilding: address.house_building,
      streetLocality: address.street_locality,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
      country: address.country,
      postalCode: address.postal_code,
      addressType: address.address_type,
      isDefault: address.is_default === 1 || address.is_default === true,
      createdAt: address.created_at,
      updatedAt: address.updated_at,
    };

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error("❌ Get Address By ID Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
};

/**
 * Update an existing address
 */
const updateAddress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const addressId = req.params.id;
    const {
      fullName,
      mobile,
      alternateMobile,
      houseBuilding,
      streetLocality,
      landmark,
      city,
      state,
      country,
      postalCode,
      addressType,
      isDefault,
    } = req.body;

    // Validate if it exists first
    const address = await addressService.getAddressById(addressId, userId);
    if (!address) {
      return res.status(404).json({
        success: false,
        error: "Address not found or access denied.",
      });
    }

    // Validation checks
    if (
      !fullName ||
      !mobile ||
      !houseBuilding ||
      !streetLocality ||
      !city ||
      !state ||
      !postalCode ||
      !addressType
    ) {
      return res.status(400).json({
        success: false,
        error: "All required fields must be completed.",
      });
    }

    const updated = await addressService.updateAddress(addressId, userId, {
      fullName,
      mobile,
      alternateMobile,
      houseBuilding,
      streetLocality,
      landmark,
      city,
      state,
      country,
      postalCode,
      addressType,
      isDefault: !!isDefault,
    });

    return res.status(200).json({
      success: true,
      message: "Address updated successfully.",
      data: updated,
    });
  } catch (error) {
    console.error("❌ Update Address Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
};

/**
 * Delete an address
 */
const deleteAddress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const addressId = req.params.id;

    // Validate ownership
    const address = await addressService.getAddressById(addressId, userId);
    if (!address) {
      return res.status(404).json({
        success: false,
        error: "Address not found or access denied.",
      });
    }

    await addressService.deleteAddress(addressId, userId);

    return res.status(200).json({
      success: true,
      message: "Address deleted and reordered successfully.",
    });
  } catch (error) {
    console.error("❌ Delete Address Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
};

module.exports = {
  createAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
};
