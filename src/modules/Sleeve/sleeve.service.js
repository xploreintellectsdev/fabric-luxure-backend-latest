const ConnectDB = require("../../config/db");

// ========================
// Get All Sleeves
// ========================
const getAllSleeves = async () => {
  const query = `
    SELECT s.*, p.product_type AS product_type_name
    FROM sleeve_master s
    LEFT JOIN product_type p ON s.pro_type_id = p.pro_type_id
    ORDER BY s.display_order ASC
  `;
  const [rows] = await ConnectDB.execute(query);
  return rows;
};

// ========================
// Get Active Sleeves by Product Type
// ========================
const getActiveSleevesByProductType = async (pro_type_id) => {
  const query = `
    SELECT * FROM sleeve_master
    WHERE is_active = 1 AND pro_type_id = ?
    ORDER BY display_order ASC
  `;
  const [rows] = await ConnectDB.execute(query, [pro_type_id]);
  return rows;
};

// ========================
// Get Sleeve By ID
// ========================
const getSleeveById = async (id) => {
  const query = `
    SELECT s.*, p.product_type AS product_type_name
    FROM sleeve_master s
    LEFT JOIN product_type p ON s.pro_type_id = p.pro_type_id
    WHERE s.sleeve_id = ?
  `;
  const [rows] = await ConnectDB.execute(query, [id]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Create Sleeve
// ========================
const createSleeve = async ({ pro_type_id, sleeve_name, display_order, is_active }) => {
  const query = `
    INSERT INTO sleeve_master (pro_type_id, sleeve_name, display_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, NOW(), NOW())
  `;
  const [result] = await ConnectDB.execute(query, [
    pro_type_id,
    sleeve_name.trim(),
    display_order,
    is_active ? 1 : 0
  ]);

  return {
    sleeve_id: result.insertId,
    pro_type_id,
    sleeve_name,
    display_order,
    is_active
  };
};

// ========================
// Update Sleeve
// ========================
const updateSleeve = async (id, { pro_type_id, sleeve_name, display_order, is_active }) => {
  const query = `
    UPDATE sleeve_master
    SET pro_type_id = ?, sleeve_name = ?, display_order = ?, is_active = ?, updated_at = NOW()
    WHERE sleeve_id = ?
  `;
  const [result] = await ConnectDB.execute(query, [
    pro_type_id,
    sleeve_name.trim(),
    display_order,
    is_active ? 1 : 0,
    id
  ]);

  return result.affectedRows > 0;
};

// ========================
// Toggle Status / Soft Delete
// ========================
const toggleSleeveStatus = async (id, is_active) => {
  const query = `
    UPDATE sleeve_master
    SET is_active = ?, updated_at = NOW()
    WHERE sleeve_id = ?
  `;
  const [result] = await ConnectDB.execute(query, [is_active, id]);
  return result.affectedRows > 0;
};

module.exports = {
  getAllSleeves,
  getActiveSleevesByProductType,
  getSleeveById,
  createSleeve,
  updateSleeve,
  toggleSleeveStatus
};
