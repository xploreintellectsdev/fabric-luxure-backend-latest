const ConnectDB = require("../../config/db");

// ========================
// Get All Product Types
// ========================
const getAllProductTypes = async () => {
  const query = `
        SELECT *
        FROM product_type
        WHERE is_deleted = 0
        ORDER BY pro_type_id ASC
    `;

  const [rows] = await ConnectDB.execute(query);
  return rows;
};

// ========================
// Get Product Type By ID
// ========================
const getProductTypeById = async (id) => {
  const query = `
        SELECT *
        FROM product_type
        WHERE pro_type_id = ? AND is_deleted = 0
    `;

  const [rows] = await ConnectDB.execute(query, [id]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Get Product Type By Name
// ========================
const getProductTypeByName = async (name) => {
  const query = `
        SELECT *
        FROM product_type
        WHERE LOWER(TRIM(product_type)) = LOWER(TRIM(?)) AND is_deleted = 0
    `;

  const [rows] = await ConnectDB.execute(query, [name]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Create Product Type
// ========================
const createProductType = async (name) => {
  const query = `
        INSERT INTO product_type
        (product_type)
        VALUES (?)
    `;

  const [result] = await ConnectDB.execute(query, [name]);
  return {
    pro_type_id: result.insertId,
    product_type: name,
  };
};

// ========================
// Update Product Type
// ========================
const updateProductType = async (id, name) => {
  const query = `
        UPDATE product_type
        SET product_type = ?
        WHERE pro_type_id = ?
    `;

  const [result] = await ConnectDB.execute(query, [name, id]);
  if (result.affectedRows === 0) {
    return null;
  }
  return {
    pro_type_id: Number(id),
    product_type: name,
  };
};

// ========================
// Delete Product Type
// ========================
const deleteProductType = async (id) => {
  const query = `
        UPDATE product_type
        SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP
        WHERE pro_type_id = ?
    `;

  const [result] = await ConnectDB.execute(query, [id]);
  if (result.affectedRows === 0) {
    return null;
  }
  return {
    message: "Product Type deleted successfully.",
  };
};

// ========================
// Toggle Product Type Status
// ========================
const toggleProductTypeStatus = async (id, status) => {
  const query = `
        UPDATE product_type
        SET is_active = ?
        WHERE pro_type_id = ?
    `;

  const [result] = await ConnectDB.execute(query, [status, id]);
  if (result.affectedRows === 0) {
    return null;
  }
  return {
    message: "Product Type status updated successfully.",
  };
};

module.exports = {
  getAllProductTypes,
  getProductTypeById,
  getProductTypeByName,
  createProductType,
  updateProductType,
  deleteProductType,
  toggleProductTypeStatus,
};
