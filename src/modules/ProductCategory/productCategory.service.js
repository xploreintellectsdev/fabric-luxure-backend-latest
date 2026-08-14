const ConnectDB = require("../../config/db");

// ========================
// Get All Product Categories
// ========================
const getAllProductCategories = async () => {
  const query = `
        SELECT pc.cat_id, pc.pro_type_id, pc.category_name, pc.category_desc, pc.category_img, pt.product_type AS product_type_name, pc.is_active,
               pc.cover_description, pc.desc1_title, pc.desc1_text, pc.desc2_title, pc.desc2_text, pc.desc3_title, pc.desc3_text, pc.desc4_text
        FROM product_category pc
        LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
        WHERE pc.is_deleted = 0
        ORDER BY pc.cat_id ASC
    `;

  const [rows] = await ConnectDB.execute(query);
  return rows;
};

// ========================
// Get Product Category By ID
// ========================
const getProductCategoryById = async (id) => {
  const query = `
        SELECT pc.cat_id, pc.pro_type_id, pc.category_name, pc.category_desc, pc.category_img, pt.product_type AS product_type_name, pc.is_active,
               pc.cover_description, pc.desc1_title, pc.desc1_text, pc.desc2_title, pc.desc2_text, pc.desc3_title, pc.desc3_text, pc.desc4_text
        FROM product_category pc
        LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
        WHERE pc.cat_id = ? AND pc.is_deleted = 0
    `;

  const [rows] = await ConnectDB.execute(query, [id]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Get Product Category By Name and Type
// ========================
const getProductCategoryByNameAndType = async (name, proTypeId) => {
  const query = `
        SELECT *
        FROM product_category
        WHERE LOWER(TRIM(category_name)) = LOWER(TRIM(?)) AND pro_type_id = ? AND is_deleted = 0
    `;

  const [rows] = await ConnectDB.execute(query, [name, proTypeId]);
  return rows.length > 0 ? rows[0] : null;
};

// ========================
// Create Product Category
// ========================
const createProductCategory = async (categoryData) => {
  const { 
    pro_type_id, category_name, category_desc, category_img,
    cover_description, desc1_title, desc1_text, desc2_title, desc2_text, desc3_title, desc3_text, desc4_text
  } = categoryData;

  const query = `
        INSERT INTO product_category
        (pro_type_id, category_name, category_desc, category_img, cover_description, desc1_title, desc1_text, desc2_title, desc2_text, desc3_title, desc3_text, desc4_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

  const [result] = await ConnectDB.execute(query, [
    pro_type_id,
    category_name,
    category_desc,
    category_img,
    cover_description || null,
    desc1_title || null,
    desc1_text || null,
    desc2_title || null,
    desc2_text || null,
    desc3_title || null,
    desc3_text || null,
    desc4_text || null
  ]);

  return {
    cat_id: result.insertId,
    ...categoryData,
  };
};

// ========================
// Update Product Category
// ========================
const updateProductCategory = async (id, categoryData) => {
  const { 
    pro_type_id, category_name, category_desc, category_img,
    cover_description, desc1_title, desc1_text, desc2_title, desc2_text, desc3_title, desc3_text, desc4_text
  } = categoryData;

  const query = `
        UPDATE product_category
        SET pro_type_id = ?, category_name = ?, category_desc = ?, category_img = ?,
            cover_description = ?, desc1_title = ?, desc1_text = ?, desc2_title = ?, desc2_text = ?, desc3_title = ?, desc3_text = ?, desc4_text = ?
        WHERE cat_id = ?
    `;

  const [result] = await ConnectDB.execute(query, [
    pro_type_id,
    category_name,
    category_desc,
    category_img,
    cover_description || null,
    desc1_title || null,
    desc1_text || null,
    desc2_title || null,
    desc2_text || null,
    desc3_title || null,
    desc3_text || null,
    desc4_text || null,
    id,
  ]);

  if (result.affectedRows === 0) {
    return null;
  }

  return getProductCategoryById(id);
};

// ========================
// Delete Product Category
// ========================
const deleteProductCategory = async (id) => {
  const query = `
        UPDATE product_category
        SET is_deleted = 1, deleted_at = NOW()
        WHERE cat_id = ?
    `;

  const [result] = await ConnectDB.execute(query, [id]);
  if (result.affectedRows === 0) {
    return null;
  }
  return {
    message: "Product Category deleted successfully.",
  };
};

// ========================
// Toggle Product Category Status
// ========================
const toggleProductCategoryStatus = async (id, status) => {
  const query = `
        UPDATE product_category
        SET is_active = ?
        WHERE cat_id = ?
    `;

  const [result] = await ConnectDB.execute(query, [status, id]);
  if (result.affectedRows === 0) {
    return null;
  }
  return {
    message: "Product Category status updated successfully.",
  };
};

const getCategoriesByProductTypeId = async (productTypeId) => {
  const query = `
        SELECT pc.cat_id, pc.pro_type_id, pc.category_name, pc.category_desc, pc.category_img, pt.product_type AS product_type_name,
               pc.cover_description, pc.desc1_title, pc.desc1_text, pc.desc2_title, pc.desc2_text, pc.desc3_title, pc.desc3_text, pc.desc4_text
        FROM product_category pc
        LEFT JOIN product_type pt ON pc.pro_type_id = pt.pro_type_id
        WHERE pc.pro_type_id = ? AND pc.is_deleted = 0
        ORDER BY pc.cat_id ASC
    `;

  const [rows] = await ConnectDB.execute(query, [productTypeId]);
  return rows;
};

module.exports = {
  getAllProductCategories,
  getProductCategoryById,
  getProductCategoryByNameAndType,
  createProductCategory,
  updateProductCategory,
  deleteProductCategory,
  getCategoriesByProductTypeId,
  toggleProductCategoryStatus,
};
