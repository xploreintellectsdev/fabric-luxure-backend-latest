const categoryService = require("./category.service");

// ========================
// CREATE CATEGORY
// ========================
const createCategoryEntry = async (req, res) => {
  try {
    const { name, description } = req.body;
    const categoryImage = req.file ? req.file.path : null;

    console.log("📥 Incoming Category Data:", req.body);
    console.log("📥 Incoming File:", req.file);

    if (!name || !description || !categoryImage) {
      return res.status(400).json({
        success: false,
        error: "All fields (name, description, categoryImage) are required.",
      });
    }

    const result = await categoryService.createCategory({
      name,
      description,
      categoryImage,
    });

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Create Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// GET ALL CATEGORIES
// ========================
const getAllCategories = async (req, res) => {
  try {
    const result = await categoryService.getAllCategories();

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Get All Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// GET CATEGORY BY ID
// ========================
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await categoryService.getCategoryById(id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Get By ID Error:", error.message);

    return res.status(404).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// UPDATE CATEGORY
// ========================
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const categoryImage = req.file ? req.file.path : null;

    const result = await categoryService.updateCategory(id, {
      name,
      description,
      categoryImage,
    });

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Update Error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// DELETE CATEGORY
// ========================
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await categoryService.deleteCategory(id);

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Delete Error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  createCategoryEntry,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};