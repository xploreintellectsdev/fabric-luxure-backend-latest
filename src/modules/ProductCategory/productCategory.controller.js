const productCategoryService = require("./productCategory.service");

// ========================
// GET ALL PRODUCT CATEGORIES
// ========================
const getAllProductCategories = async (req, res) => {
  try {
    const { productTypeId } = req.query;
    let result;
    if (productTypeId) {
      result = await productCategoryService.getCategoriesByProductTypeId(productTypeId);
    } else {
      result = await productCategoryService.getAllProductCategories();
    }
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Get All Product Categories Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// CREATE PRODUCT CATEGORY
// ========================
const createProductCategory = async (req, res) => {
  try {
    const { 
      pro_type_id, category_name, category_desc,
      cover_description, desc1_title, desc1_text, desc2_title, desc2_text, desc3_title, desc3_text, desc4_text
    } = req.body;

    if (!category_name || !category_name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Category Name is required.",
      });
    }

    if (!pro_type_id) {
      return res.status(400).json({
        success: false,
        error: "Product Type is required.",
      });
    }

    const trimmedName = category_name.trim();

    // Prevent duplicates inside the same Product Type
    const existing = await productCategoryService.getProductCategoryByNameAndType(trimmedName, pro_type_id);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Category already exists under this Product Type.",
      });
    }

    const category_img = req.file ? `/uploads/category/${req.file.filename}` : (req.body.category_img || "/images/home/cat-01.webp");

    const result = await productCategoryService.createProductCategory({
      pro_type_id: Number(pro_type_id),
      category_name: trimmedName,
      category_desc: category_desc || "",
      category_img,
      cover_description,
      desc1_title,
      desc1_text,
      desc2_title,
      desc2_text,
      desc3_title,
      desc3_text,
      desc4_text
    });

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Create Category Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// UPDATE PRODUCT CATEGORY
// ========================
const updateProductCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      pro_type_id, category_name, category_desc,
      cover_description, desc1_title, desc1_text, desc2_title, desc2_text, desc3_title, desc3_text, desc4_text
    } = req.body;

    if (!category_name || !category_name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Category Name is required.",
      });
    }

    if (!pro_type_id) {
      return res.status(400).json({
        success: false,
        error: "Product Type is required.",
      });
    }

    const trimmedName = category_name.trim();

    // Check if category exists
    const categoryRecord = await productCategoryService.getProductCategoryById(id);
    if (!categoryRecord) {
      return res.status(404).json({
        success: false,
        error: "Category not found.",
      });
    }

    // Prevent duplicates inside the same Product Type
    const duplicate = await productCategoryService.getProductCategoryByNameAndType(trimmedName, pro_type_id);
    if (duplicate && duplicate.cat_id !== Number(id)) {
      return res.status(409).json({
        success: false,
        error: "Category already exists under this Product Type.",
      });
    }

    const category_img = req.file ? `/uploads/category/${req.file.filename}` : (req.body.category_img || categoryRecord.category_img);

    const result = await productCategoryService.updateProductCategory(id, {
      pro_type_id: Number(pro_type_id),
      category_name: trimmedName,
      category_desc: category_desc || "",
      category_img,
      cover_description,
      desc1_title,
      desc1_text,
      desc2_title,
      desc2_text,
      desc3_title,
      desc3_text,
      desc4_text
    });

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Update Category Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// DELETE PRODUCT CATEGORY
// ========================
const deleteProductCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const categoryRecord = await productCategoryService.getProductCategoryById(id);
    if (!categoryRecord) {
      return res.status(404).json({
        success: false,
        error: "Category not found.",
      });
    }

    const result = await productCategoryService.deleteProductCategory(id);
    return res.status(200).json({
      success: true,
      message: "Category deleted successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Delete Category Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// GET PRODUCT CATEGORY BY ID
// ========================
const getProductCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await productCategoryService.getProductCategoryById(id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: "Category not found.",
      });
    }
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Get Category By ID Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// TOGGLE PRODUCT CATEGORY STATUS
// ========================
const toggleProductCategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "is_active must be a boolean value.",
      });
    }

    const categoryRecord = await productCategoryService.getProductCategoryById(id);
    if (!categoryRecord) {
      return res.status(404).json({
        success: false,
        error: "Category not found.",
      });
    }

    const result = await productCategoryService.toggleProductCategoryStatus(id, is_active ? 1 : 0);
    return res.status(200).json({
      success: true,
      message: "Category status updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Toggle Category Status Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  getAllProductCategories,
  getProductCategoryById,
  createProductCategory,
  updateProductCategory,
  deleteProductCategory,
  toggleProductCategoryStatus,
};
