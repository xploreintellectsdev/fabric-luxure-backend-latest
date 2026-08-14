const productTypeService = require("./productType.service");

// ========================
// GET ALL PRODUCT TYPES
// ========================
const getAllProductTypes = async (req, res) => {
  try {
    const result = await productTypeService.getAllProductTypes();
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Get All Product Types Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// CREATE PRODUCT TYPE
// ========================
const createProductType = async (req, res) => {
  try {
    const { name } = req.body;
    const trimmed = name ? name.trim() : "";

    if (!trimmed) {
      return res.status(400).json({
        success: false,
        error: "Product Type name cannot be empty.",
      });
    }

    const existing = await productTypeService.getProductTypeByName(trimmed);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Product Type already exists.",
      });
    }

    const result = await productTypeService.createProductType(trimmed);
    return res.status(201).json({
      success: true,
      message: "Product Type created successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Create Product Type Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// UPDATE PRODUCT TYPE
// ========================
const updateProductType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const trimmed = name ? name.trim() : "";

    if (!trimmed) {
      return res.status(400).json({
        success: false,
        error: "Product Type name cannot be empty.",
      });
    }

    const existingRecord = await productTypeService.getProductTypeById(id);
    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        error: "Product Type not found.",
      });
    }

    const duplicate = await productTypeService.getProductTypeByName(trimmed);
    if (duplicate && duplicate.pro_type_id !== Number(id)) {
      return res.status(409).json({
        success: false,
        error: "Product Type already exists.",
      });
    }

    const result = await productTypeService.updateProductType(id, trimmed);
    return res.status(200).json({
      success: true,
      message: "Product Type updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Update Product Type Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// DELETE PRODUCT TYPE
// ========================
const deleteProductType = async (req, res) => {
  try {
    const { id } = req.params;

    const existingRecord = await productTypeService.getProductTypeById(id);
    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        error: "Product Type not found.",
      });
    }

    const result = await productTypeService.deleteProductType(id);
    return res.status(200).json({
      success: true,
      message: "Product Type deleted successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Delete Product Type Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// TOGGLE PRODUCT TYPE STATUS
// ========================
const toggleProductTypeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "is_active must be a boolean value.",
      });
    }

    const existingRecord = await productTypeService.getProductTypeById(id);
    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        error: "Product Type not found.",
      });
    }

    const result = await productTypeService.toggleProductTypeStatus(id, is_active ? 1 : 0);
    return res.status(200).json({
      success: true,
      message: "Product Type status updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Toggle Product Type Status Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  getAllProductTypes,
  createProductType,
  updateProductType,
  deleteProductType,
  toggleProductTypeStatus,
};
