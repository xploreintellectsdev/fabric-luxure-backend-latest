const ConnectDB = require("../../config/db");

// ========================
// Get All Templates
// ========================
const getAllTemplates = async () => {
  const query = `
    SELECT sct.template_id, sct.pro_type_id, sct.template_name, sct.image_path, sct.is_active, sct.created_at, sct.updated_at, pt.product_type
    FROM size_chart_templates sct
    LEFT JOIN product_type pt ON sct.pro_type_id = pt.pro_type_id
    WHERE sct.is_active = 1
    ORDER BY sct.template_id DESC
  `;
  const [rows] = await ConnectDB.execute(query);
  return rows;
};

// ========================
// Get Template By ID
// ========================
const getTemplateById = async (id) => {
  const query = `
    SELECT sct.template_id, sct.pro_type_id, sct.template_name, sct.image_path, sct.is_active, sct.created_at, sct.updated_at, pt.product_type
    FROM size_chart_templates sct
    LEFT JOIN product_type pt ON sct.pro_type_id = pt.pro_type_id
    WHERE sct.template_id = ? AND sct.is_active = 1
  `;
  const [rows] = await ConnectDB.execute(query, [id]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Create Template
// ========================
const createTemplate = async ({ pro_type_id, template_name, image_path, is_active }) => {
  const query = `
    INSERT INTO size_chart_templates
    (pro_type_id, template_name, image_path, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, NOW(), NOW())
  `;
  const [result] = await ConnectDB.execute(query, [
    pro_type_id,
    template_name,
    image_path,
    is_active ? 1 : 0
  ]);
  
  return {
    template_id: result.insertId,
    pro_type_id,
    template_name,
    image_path,
    is_active
  };
};

// ========================
// Update Template
// ========================
const updateTemplate = async (id, { pro_type_id, template_name, image_path, is_active }) => {
  const query = `
    UPDATE size_chart_templates
    SET pro_type_id = ?, template_name = ?, image_path = ?, is_active = ?, updated_at = NOW()
    WHERE template_id = ?
  `;
  const [result] = await ConnectDB.execute(query, [
    pro_type_id,
    template_name,
    image_path,
    is_active ? 1 : 0,
    id
  ]);
  
  if (result.affectedRows === 0) {
    return null;
  }
  return {
    template_id: Number(id),
    pro_type_id,
    template_name,
    image_path,
    is_active
  };
};

// ========================
// Delete Template
// ========================
const deleteTemplate = async (id) => {
  const query = `
    UPDATE size_chart_templates
    SET is_active = 0
    WHERE template_id = ?
  `;
  const [result] = await ConnectDB.execute(query, [id]);
  if (result.affectedRows === 0) {
    return null;
  }
  return {
    message: "Size chart template deleted successfully."
  };
};

module.exports = {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate
};
