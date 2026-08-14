const ConnectDB = require("../../config/db");

// ========================
// Get All Sizes (Admin)
// ========================
const getAllSizes = async (pro_type_id = 1, fit_style_id = null) => {
  let query = `
    SELECT s.*, p.product_type AS product_type_name, f.fit_style_name
    FROM shirt_size_chart s
    LEFT JOIN product_type p ON s.pro_type_id = p.pro_type_id
    LEFT JOIN fit_style_master f ON s.fit_style_id = f.fit_style_id
    WHERE s.pro_type_id = ?
  `;
  const params = [pro_type_id];

  if (fit_style_id) {
    query += ` AND s.fit_style_id = ?`;
    params.push(fit_style_id);
  }

  query += ` ORDER BY s.display_order ASC`;
  
  const [rows] = await ConnectDB.execute(query, params);
  return rows;
};

// ========================
// Get Active Sizes (Frontend Customer)
// ========================
const getActiveSizes = async (pro_type_id = 1, fit_style_id = null) => {
  let query = `
    SELECT s.*, p.product_type AS product_type_name, f.fit_style_name
    FROM shirt_size_chart s
    LEFT JOIN product_type p ON s.pro_type_id = p.pro_type_id
    LEFT JOIN fit_style_master f ON s.fit_style_id = f.fit_style_id
    WHERE s.is_active = 1 AND s.pro_type_id = ?
  `;
  const params = [pro_type_id];

  if (fit_style_id) {
    query += ` AND s.fit_style_id = ?`;
    params.push(fit_style_id);
  }

  query += ` ORDER BY s.display_order ASC`;
  
  const [rows] = await ConnectDB.execute(query, params);
  return rows;
};

// ========================
// Get Size By ID
// ========================
const getSizeById = async (id) => {
  const query = `
    SELECT * FROM shirt_size_chart
    WHERE size_chart_id = ? AND is_active = 1
  `;
  const [rows] = await ConnectDB.execute(query, [id]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Get Size By Name & Fit Style ID
// ========================
const getSizeByName = async (name, fit_style_id, pro_type_id = 1) => {
  const query = `
    SELECT * FROM shirt_size_chart
    WHERE LOWER(TRIM(size_name)) = LOWER(TRIM(?)) AND fit_style_id = ? AND pro_type_id = ? AND is_active = 1
  `;
  const [rows] = await ConnectDB.execute(query, [name, fit_style_id, pro_type_id]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Get Size By Display Order & Fit Style ID
// ========================
const getSizeByDisplayOrder = async (order, fit_style_id, pro_type_id = 1) => {
  const query = `
    SELECT * FROM shirt_size_chart
    WHERE display_order = ? AND fit_style_id = ? AND pro_type_id = ? AND is_active = 1
  `;
  const [rows] = await ConnectDB.execute(query, [order, fit_style_id, pro_type_id]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Create Size Chart Row
// ========================
const createSize = async ({ pro_type_id, fit_style_id, size_name, chest, length, shoulder, sleeve, display_order, is_active }) => {
  const query = `
    INSERT INTO shirt_size_chart
    (pro_type_id, fit_style_id, size_name, chest, length, shoulder, sleeve, display_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;
  const [result] = await ConnectDB.execute(query, [
    pro_type_id,
    fit_style_id,
    size_name.trim(),
    chest,
    length,
    shoulder,
    sleeve,
    display_order,
    is_active ? 1 : 0
  ]);
  
  return {
    size_chart_id: result.insertId,
    pro_type_id,
    fit_style_id,
    size_name,
    chest,
    length,
    shoulder,
    sleeve,
    display_order,
    is_active
  };
};

// ========================
// Update Size Chart Row
// ========================
const updateSize = async (id, { pro_type_id, fit_style_id, size_name, chest, length, shoulder, sleeve, display_order, is_active }) => {
  const query = `
    UPDATE shirt_size_chart
    SET pro_type_id = ?, fit_style_id = ?, size_name = ?, chest = ?, length = ?, shoulder = ?, sleeve = ?, display_order = ?, is_active = ?, updated_at = NOW()
    WHERE size_chart_id = ?
  `;
  const [result] = await ConnectDB.execute(query, [
    pro_type_id,
    fit_style_id,
    size_name.trim(),
    chest,
    length,
    shoulder,
    sleeve,
    display_order,
    is_active ? 1 : 0,
    id
  ]);

  return result.affectedRows > 0;
};

// ========================
// Delete Size Chart Row
// ========================
const deleteSize = async (id) => {
  const query = `
    UPDATE shirt_size_chart
    SET is_active = 0
    WHERE size_chart_id = ?
  `;
  const [result] = await ConnectDB.execute(query, [id]);
  if (result.affectedRows === 0) {
    return null;
  }
  return {
    message: "Size chart row deleted successfully."
  };
};

module.exports = {
  getAllSizes,
  getActiveSizes,
  getSizeById,
  getSizeByName,
  getSizeByDisplayOrder,
  createSize,
  updateSize,
  deleteSize
};
