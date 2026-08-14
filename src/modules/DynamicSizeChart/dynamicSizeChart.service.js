const ConnectDB = require("../../config/db");

// Core table mapping mapping frontend product type names to backend tables
const SIZE_TABLES = {
  "shirt": "shirt_size_chart",
  "pant": "pant_size_chart",
  "blazer": "blazer_size_chart",
  "blazers": "blazer_size_chart",
  "shorts": "short_size_chart"
};

const STANDARD_COLUMNS = [
  'size_chart_id', 
  'pro_type_id', 
  'fit_style_id', 
  'size_name', 
  'display_order', 
  'is_active', 
  'created_at', 
  'updated_at'
];

const getTableName = (productTypeStr) => {
  if (!productTypeStr) return null;
  return SIZE_TABLES[productTypeStr.toLowerCase()] || null;
};

// Dynamically fetch the specific measurement columns for a given table
const getMeasurementColumns = async (tableName) => {
  const query = `
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
  `;
  const [rows] = await ConnectDB.execute(query, [tableName]);
  return rows.map(r => r.COLUMN_NAME).filter(col => !STANDARD_COLUMNS.includes(col));
};

// ========================
// Get All Sizes (Admin)
// ========================
const getAllSizes = async (tableName, pro_type_id = 1, fit_style_id = null) => {
  let query = `
    SELECT s.*, p.product_type AS product_type_name, f.fit_style_name
    FROM ${tableName} s
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
  const columns = await getMeasurementColumns(tableName);
  return { rows, columns };
};

// ========================
// Get Active Sizes (Frontend Customer)
// ========================
const getActiveSizes = async (tableName, pro_type_id = 1, fit_style_id = null) => {
  let query = `
    SELECT s.*, p.product_type AS product_type_name, f.fit_style_name
    FROM ${tableName} s
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
  const columns = await getMeasurementColumns(tableName);
  return { rows, columns };
};

// ========================
// Get Size By ID
// ========================
const getSizeById = async (tableName, id) => {
  const query = `
    SELECT * FROM ${tableName}
    WHERE size_chart_id = ? AND is_active = 1
  `;
  const [rows] = await ConnectDB.execute(query, [id]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Get Size By Name & Fit Style ID
// ========================
const getSizeByName = async (tableName, name, fit_style_id, pro_type_id = 1) => {
  const query = `
    SELECT * FROM ${tableName}
    WHERE LOWER(TRIM(size_name)) = LOWER(TRIM(?)) AND fit_style_id = ? AND pro_type_id = ? AND is_active = 1
  `;
  const [rows] = await ConnectDB.execute(query, [name, fit_style_id, pro_type_id]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Get Size By Display Order & Fit Style ID
// ========================
const getSizeByDisplayOrder = async (tableName, order, fit_style_id, pro_type_id = 1) => {
  const query = `
    SELECT * FROM ${tableName}
    WHERE display_order = ? AND fit_style_id = ? AND pro_type_id = ? AND is_active = 1
  `;
  const [rows] = await ConnectDB.execute(query, [order, fit_style_id, pro_type_id]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Create Size Chart Row
// ========================
const createSize = async (tableName, { pro_type_id, fit_style_id, size_name, display_order, is_active, measurements }) => {
  const measurementKeys = Object.keys(measurements);
  const measurementValues = Object.values(measurements).map(val => Number(val));
  
  const columnsStr = measurementKeys.length > 0 ? `, ${measurementKeys.join(', ')}` : '';
  const placeholdersStr = measurementKeys.length > 0 ? `, ${measurementKeys.map(() => '?').join(', ')}` : '';

  const query = `
    INSERT INTO ${tableName}
    (pro_type_id, fit_style_id, size_name, display_order, is_active, created_at, updated_at${columnsStr})
    VALUES (?, ?, ?, ?, ?, NOW(), NOW()${placeholdersStr})
  `;
  
  const params = [
    pro_type_id,
    fit_style_id,
    size_name.trim(),
    display_order,
    is_active ? 1 : 0,
    ...measurementValues
  ];

  const [result] = await ConnectDB.execute(query, params);
  return { insertId: result.insertId };
};

// ========================
// Update Size Chart Row
// ========================
const updateSize = async (tableName, id, { pro_type_id, fit_style_id, size_name, display_order, is_active, measurements }) => {
  const measurementKeys = Object.keys(measurements);
  const measurementValues = Object.values(measurements).map(val => Number(val));
  
  const setMeasurementsStr = measurementKeys.length > 0 ? `, ${measurementKeys.map(k => `${k} = ?`).join(', ')}` : '';

  const query = `
    UPDATE ${tableName}
    SET pro_type_id = ?, fit_style_id = ?, size_name = ?, display_order = ?, is_active = ?, updated_at = NOW()${setMeasurementsStr}
    WHERE size_chart_id = ?
  `;
  
  const params = [
    pro_type_id,
    fit_style_id,
    size_name.trim(),
    display_order,
    is_active ? 1 : 0,
    ...measurementValues,
    id
  ];

  const [result] = await ConnectDB.execute(query, params);
  return result.affectedRows;
};

// ========================
// Soft Delete Size Option
// ========================
const deleteSize = async (tableName, id) => {
  const query = `UPDATE ${tableName} SET is_active = 0, updated_at = NOW() WHERE size_chart_id = ?`;
  const [result] = await ConnectDB.execute(query, [id]);
  return result.affectedRows;
};

module.exports = {
  getTableName,
  getMeasurementColumns,
  getAllSizes,
  getActiveSizes,
  getSizeById,
  getSizeByName,
  getSizeByDisplayOrder,
  createSize,
  updateSize,
  deleteSize
};
