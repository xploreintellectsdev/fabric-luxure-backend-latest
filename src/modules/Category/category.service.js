const ConnectDB = require("../../config/db");

// ========================
// Create Category
// ========================
const createCategory = async (categoryData) => {
  const { name, description, categoryImage } = categoryData;

  const query = `
        INSERT INTO category
        (name, description, categoryImage, createAt)
        VALUES (?, ?, ?, NOW())
    `;

  const [result] = await ConnectDB.execute(query, [
    name,
    description,
    categoryImage,
  ]);

  return {
    category_id: result.insertId,
    ...categoryData,
  };
};

// ========================
// Get All Categories
// ========================
const getAllCategories = async () => {
  const query = `
        SELECT *
        FROM category
        ORDER BY category_id DESC
    `;

  const [rows] = await ConnectDB.execute(query);

  return rows;
};

// ========================
// Get Category By ID
// ========================
const getCategoryById = async (categoryId) => {
  const query = `
        SELECT *
        FROM category
        WHERE category_id = ?
    `;

  const [rows] = await ConnectDB.execute(query, [categoryId]);

  if (rows.length === 0) {
    throw new Error("Category not found.");
  }

  return rows[0];
};

// ========================
// Update Category
// ========================
const updateCategory = async (categoryId, categoryData) => {
  const { name, description, categoryImage } = categoryData;

  const query = `
        UPDATE category
        SET
            name = ?,
            description = ?,
            categoryImage = ?
        WHERE category_id = ?
    `;

  const [result] = await ConnectDB.execute(query, [
    name,
    description,
    categoryImage,
    categoryId,
  ]);

  if (result.affectedRows === 0) {
    throw new Error("Category not found.");
  }

  return await getCategoryById(categoryId);
};

// ========================
// Delete Category
// ========================
const deleteCategory = async (categoryId) => {
  const query = `
        DELETE FROM category
        WHERE category_id = ?
    `;

  const [result] = await ConnectDB.execute(query, [categoryId]);

  if (result.affectedRows === 0) {
    throw new Error("Category not found.");
  }

  return {
    message: "Category deleted successfully.",
  };
};

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};