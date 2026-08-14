const ConnectDB = require("../../config/db");

/**
 * Get all addresses of a user ordered by address_order
 */
const getUserAddresses = async (userId) => {
  const query = `
    SELECT 
      address_id,
      user_id,
      address_order,
      full_name,
      mobile,
      alternate_mobile,
      house_building,
      street_locality,
      landmark,
      city,
      state,
      country,
      postal_code,
      address_type,
      is_default,
      created_at,
      updated_at
    FROM user_addresses
    WHERE user_id = ?
    ORDER BY address_order ASC
  `;
  const [rows] = await ConnectDB.execute(query, [userId]);
  return rows;
};

/**
 * Get single address details belonging to a specific user
 */
const getAddressById = async (addressId, userId) => {
  const query = `
    SELECT * 
    FROM user_addresses
    WHERE address_id = ? AND user_id = ?
  `;
  const [rows] = await ConnectDB.execute(query, [addressId, userId]);
  return rows[0] || null;
};

/**
 * Calculate the next address_order for a user
 */
const getNextAddressOrder = async (userId) => {
  const query = `
    SELECT COALESCE(MAX(address_order), 0) AS max_order
    FROM user_addresses
    WHERE user_id = ?
  `;
  const [rows] = await ConnectDB.execute(query, [userId]);
  return rows[0].max_order + 1;
};

/**
 * Clear default address flag from all addresses of a user
 */
const clearDefaultFlags = async (userId) => {
  const query = `
    UPDATE user_addresses
    SET is_default = 0
    WHERE user_id = ?
  `;
  await ConnectDB.execute(query, [userId]);
};

/**
 * Create a new user address
 */
const createAddress = async (addressData) => {
  const {
    userId,
    fullName,
    mobile,
    alternateMobile,
    houseBuilding,
    streetLocality,
    landmark,
    city,
    state,
    country = "India",
    postalCode,
    addressType,
    isDefault,
  } = addressData;

  const nextOrder = await getNextAddressOrder(userId);

  if (isDefault) {
    await clearDefaultFlags(userId);
  }

  const query = `
    INSERT INTO user_addresses (
      user_id, address_order, full_name, mobile, alternate_mobile, 
      house_building, street_locality, landmark, city, state, 
      country, postal_code, address_type, is_default, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  const [result] = await ConnectDB.execute(query, [
    userId,
    nextOrder,
    fullName,
    mobile,
    alternateMobile || null,
    houseBuilding,
    streetLocality,
    landmark || null,
    city,
    state,
    country,
    postalCode,
    addressType,
    isDefault ? 1 : 0,
  ]);

  return {
    addressId: result.insertId,
    addressOrder: nextOrder,
    ...addressData,
  };
};

/**
 * Update address fields
 */
const updateAddress = async (addressId, userId, updateData) => {
  const {
    fullName,
    mobile,
    alternateMobile,
    houseBuilding,
    streetLocality,
    landmark,
    city,
    state,
    country = "India",
    postalCode,
    addressType,
    isDefault,
  } = updateData;

  if (isDefault) {
    await clearDefaultFlags(userId);
  }

  const query = `
    UPDATE user_addresses
    SET 
      full_name = ?,
      mobile = ?,
      alternate_mobile = ?,
      house_building = ?,
      street_locality = ?,
      landmark = ?,
      city = ?,
      state = ?,
      country = ?,
      postal_code = ?,
      address_type = ?,
      is_default = ?,
      updated_at = NOW()
    WHERE address_id = ? AND user_id = ?
  `;

  await ConnectDB.execute(query, [
    fullName,
    mobile,
    alternateMobile || null,
    houseBuilding,
    streetLocality,
    landmark || null,
    city,
    state,
    country,
    postalCode,
    addressType,
    isDefault ? 1 : 0,
    addressId,
    userId,
  ]);

  return {
    addressId,
    ...updateData,
  };
};

/**
 * Delete address and reorder remaining addresses sequentially
 */
const deleteAddress = async (addressId, userId) => {
  // Delete target address
  const deleteQuery = `
    DELETE FROM user_addresses
    WHERE address_id = ? AND user_id = ?
  `;
  await ConnectDB.execute(deleteQuery, [addressId, userId]);

  // Fetch remaining addresses ordered by original address_order
  const remaining = await getUserAddresses(userId);

  // Update order sequences sequentially starting from 1
  for (let idx = 0; idx < remaining.length; idx++) {
    const addr = remaining[idx];
    const updateOrderQuery = `
      UPDATE user_addresses
      SET address_order = ?
      WHERE address_id = ?
    `;
    await ConnectDB.execute(updateOrderQuery, [idx + 1, addr.address_id]);
  }
};

module.exports = {
  getUserAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  deleteAddress,
};
