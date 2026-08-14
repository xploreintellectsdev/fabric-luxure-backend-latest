const ConnectDB = require("../../config/db");

// ========================
// Get All Fit Styles
// ========================
const getAllFitStyles = async () => {
  const query = `
    SELECT f.*, p.product_type AS product_type_name
    FROM fit_style_master f
    LEFT JOIN product_type p ON f.pro_type_id = p.pro_type_id
    ORDER BY f.display_order ASC
  `;
  const [rows] = await ConnectDB.execute(query);
  return rows;
};

// ========================
// Get Active Fit Styles by Product Type
// ========================
const getActiveFitStylesByProductType = async (pro_type_id) => {
  const query = `
    SELECT * FROM fit_style_master
    WHERE is_active = 1 AND pro_type_id = ?
    ORDER BY display_order ASC
  `;
  const [rows] = await ConnectDB.execute(query, [pro_type_id]);
  return rows;
};

// ========================
// Get Fit Style By ID
// ========================
const getFitStyleById = async (id) => {
  const query = `
    SELECT f.*, p.product_type AS product_type_name
    FROM fit_style_master f
    LEFT JOIN product_type p ON f.pro_type_id = p.pro_type_id
    WHERE f.fit_style_id = ?
  `;
  const [rows] = await ConnectDB.execute(query, [id]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Create Fit Style
// ========================
const createFitStyle = async ({ pro_type_id, fit_style_name, display_order, is_active }) => {
  const query = `
    INSERT INTO fit_style_master (pro_type_id, fit_style_name, display_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, NOW(), NOW())
  `;
  const [result] = await ConnectDB.execute(query, [
    pro_type_id,
    fit_style_name.trim(),
    display_order,
    is_active ? 1 : 0
  ]);
  
  return {
    fit_style_id: result.insertId,
    pro_type_id,
    fit_style_name,
    display_order,
    is_active
  };
};

// ========================
// Update Fit Style
// ========================
const updateFitStyle = async (id, { pro_type_id, fit_style_name, display_order, is_active }) => {
  const query = `
    UPDATE fit_style_master
    SET pro_type_id = ?, fit_style_name = ?, display_order = ?, is_active = ?, updated_at = NOW()
    WHERE fit_style_id = ?
  `;
  const [result] = await ConnectDB.execute(query, [
    pro_type_id,
    fit_style_name.trim(),
    display_order,
    is_active ? 1 : 0,
    id
  ]);

  return result.affectedRows > 0;
};

// ========================
// Toggle Status / Soft Delete
// ========================
const toggleFitStyleStatus = async (id, is_active) => {
  const query = `
    UPDATE fit_style_master
    SET is_active = ?, updated_at = NOW()
    WHERE fit_style_id = ?
  `;
  const [result] = await ConnectDB.execute(query, [is_active, id]);
  return result.affectedRows > 0;
};

module.exports = {
  getAllFitStyles,
  getActiveFitStylesByProductType,
  getFitStyleById,
  createFitStyle,
  updateFitStyle,
  toggleFitStyleStatus
};
