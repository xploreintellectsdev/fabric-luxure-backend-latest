const productService = require("./products.service");

// ========================
// GET ALL PRODUCTS
// ========================
const getAllProducts = async (req, res) => {
  try {
    const result = await productService.getAllProducts();
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Get All Products Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// SEARCH PRODUCTS
// ========================
const searchProducts = async (req, res) => {
  try {
    const filters = req.query;
    const result = await productService.searchProducts(filters);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Search Products Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// GET PRODUCT BY ID
// ========================
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await productService.getProductById(id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: "Product not found.",
      });
    }
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Get Product By ID Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// CREATE PRODUCT
// ========================
const createProduct = async (req, res) => {
  try {
    const {
      pro_name,
      cat_id,
      price,
      cover_description,
      is_top_pics,
      is_exclusive,
      fabric_type_id,
      origin_id,
      style_id,
      weave_id,
      color_id,
      pattern_id,
      standard_size,
      stock_quantity,
      stock_unit,
      stitching_price,
      disclaimer,
    } = req.body;

    // Parse descriptions and specifications arrays
    let descriptions = [];
    if (req.body.descriptions) {
      try {
        descriptions = typeof req.body.descriptions === "string"
          ? JSON.parse(req.body.descriptions)
          : req.body.descriptions;
      } catch (e) {
        descriptions = [];
      }
    }

    let specifications = [];
    if (req.body.specifications) {
      try {
        specifications = typeof req.body.specifications === "string"
          ? JSON.parse(req.body.specifications)
          : req.body.specifications;
      } catch (e) {
        specifications = [];
      }
    }

    // Required Field Validations
    if (!pro_name || !pro_name.trim()) {
      return res.status(400).json({ success: false, error: "Product Name is required." });
    }
    if (!cat_id) {
      return res.status(400).json({ success: false, error: "Category is required." });
    }
    if (!price || isNaN(price)) {
      return res.status(400).json({ success: false, error: "Price is required." });
    }

    // Cover description validation
    if (!cover_description || !cover_description.trim()) {
      return res.status(400).json({ success: false, error: "Cover Description is required." });
    }

    // Validation: Exactly 4 descriptions
    if (!descriptions || descriptions.length !== 4) {
      return res.status(400).json({ success: false, error: "Exactly four descriptions must exist." });
    }

    // Validate desc 1, 2, 3 (Title and Text)
    for (let i = 0; i < 3; i++) {
      const desc = descriptions[i];
      if (!desc || !desc.title || !desc.title.trim() || !desc.text || !desc.text.trim()) {
        return res.status(400).json({ success: false, error: `Description ${i + 1} Title and Text are required.` });
      }
    }

    // Validate desc 4 (Text only)
    const desc4 = descriptions[3];
    if (!desc4 || !desc4.text || !desc4.text.trim()) {
      return res.status(400).json({ success: false, error: "Description 4 Text is required." });
    }

    // Limit counts
    let topPicksCount = 0;
    const topPickChecked = is_top_pics === "true" || is_top_pics === true || is_top_pics === 1 || is_top_pics === "1";
    if (topPickChecked) {
      const [countResult] = await require("../../config/db").execute(
        `SELECT COUNT(*) AS total FROM product_master WHERE is_top_pics = 1 AND is_deleted = 0`
      );
      topPicksCount = countResult[0].total;
    }

    let exclusiveCount = 0;
    const exclusiveChecked = is_exclusive === "true" || is_exclusive === true || is_exclusive === 1 || is_exclusive === "1";
    if (exclusiveChecked) {
      const [countResult] = await require("../../config/db").execute(
        `SELECT COUNT(*) AS total FROM product_master WHERE is_exclusive = 1 AND is_deleted = 0`
      );
      exclusiveCount = countResult[0].total;
    }

    const rejectTopPicks = topPickChecked && topPicksCount >= 10;
    const rejectExclusive = exclusiveChecked && exclusiveCount >= 4;

    // Resolve files
    const coverImageFile = req.files && req.files["coverImage"] ? req.files["coverImage"][0] : null;
    if (!coverImageFile) {
      return res.status(400).json({ success: false, error: "Cover Image is required while creating." });
    }
    const pro_img = `/uploads/products/${coverImageFile.filename}`;

    const additionalImagesFiles = req.files && req.files["additionalImages"] ? req.files["additionalImages"] : [];
    const additionalImages = additionalImagesFiles.map(f => `/uploads/products/${f.filename}`);

    const trimmedName = pro_name.trim();

    // Duplicate Check
    const existing = await productService.getProductByNameAndCategory(trimmedName, cat_id);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Product with this name already exists in this category.",
      });
    }

    const result = await productService.createProduct({
      cat_id: Number(cat_id),
      pro_name: trimmedName,
      price: Number(price),
      stock_quantity: Number(stock_quantity) || 0,
      stock_unit: stock_unit || 'PCS',
      pro_img,
      cover_description,
      is_top_pics: rejectTopPicks ? false : topPickChecked,
      is_exclusive: rejectExclusive ? false : exclusiveChecked,
      fabric_type_id: fabric_type_id ? Number(fabric_type_id) : null,
      origin_id: origin_id ? Number(origin_id) : null,
      style_id: style_id ? Number(style_id) : null,
      weave_id: weave_id ? Number(weave_id) : null,
      color_id: color_id ? Number(color_id) : null,
      pattern_id: pattern_id ? Number(pattern_id) : null,
      standard_size: standard_size || null,
      descriptions,
      specifications: specifications.filter(s => s.key.trim() !== "" || s.value.trim() !== ""),
      additionalImages,
      disclaimer: disclaimer || "",
    });

    let message = "Product created successfully";
    if (rejectTopPicks) {
      message = "Maximum Top Picks limit reached.";
    } else if (rejectExclusive) {
      message = "Maximum Exclusive limit reached.";
    }

    return res.status(201).json({
      success: true,
      message,
      data: result,
      topPicksLimitReached: rejectTopPicks,
      exclusiveLimitReached: rejectExclusive,
    });
  } catch (error) {
    console.error("❌ Create Product Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// UPDATE PRODUCT
// ========================
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      pro_name,
      cat_id,
      price,
      cover_description,
      is_top_pics,
      is_exclusive,
      pro_img: existing_pro_img,
      fabric_type_id,
      origin_id,
      style_id,
      weave_id,
      color_id,
      pattern_id,
      standard_size,
      stock_quantity,
      stock_unit,
      stitching_price,
      disclaimer,
    } = req.body;

    // Parse descriptions and specifications arrays
    let descriptions = [];
    if (req.body.descriptions) {
      try {
        descriptions = typeof req.body.descriptions === "string"
          ? JSON.parse(req.body.descriptions)
          : req.body.descriptions;
      } catch (e) {
        descriptions = [];
      }
    }

    let specifications = [];
    if (req.body.specifications) {
      try {
        specifications = typeof req.body.specifications === "string"
          ? JSON.parse(req.body.specifications)
          : req.body.specifications;
      } catch (e) {
        specifications = [];
      }
    }

    // Required Field Validations
    if (!pro_name || !pro_name.trim()) {
      return res.status(400).json({ success: false, error: "Product Name is required." });
    }
    if (!cat_id) {
      return res.status(400).json({ success: false, error: "Category is required." });
    }
    if (!price || isNaN(price)) {
      return res.status(400).json({ success: false, error: "Price is required." });
    }

    // Cover description validation
    if (!cover_description || !cover_description.trim()) {
      return res.status(400).json({ success: false, error: "Cover Description is required." });
    }

    // Validation: Exactly 4 descriptions
    if (!descriptions || descriptions.length !== 4) {
      return res.status(400).json({ success: false, error: "Exactly four descriptions must exist." });
    }

    // Validate desc 1, 2, 3 (Title and Text)
    for (let i = 0; i < 3; i++) {
      const desc = descriptions[i];
      if (!desc || !desc.title || !desc.title.trim() || !desc.text || !desc.text.trim()) {
        return res.status(400).json({ success: false, error: `Description ${i + 1} Title and Text are required.` });
      }
    }

    // Validate desc 4 (Text only)
    const desc4 = descriptions[3];
    if (!desc4 || !desc4.text || !desc4.text.trim()) {
      return res.status(400).json({ success: false, error: "Description 4 Text is required." });
    }

    const productRecord = await productService.getProductById(id);
    if (!productRecord) {
      return res.status(404).json({ success: false, error: "Product not found." });
    }

    const trimmedName = pro_name.trim();

    // Duplicate Check
    const duplicate = await productService.getProductByNameAndCategory(trimmedName, cat_id);
    if (duplicate && duplicate.pro_id !== Number(id)) {
      return res.status(409).json({
        success: false,
        error: "Product with this name already exists in this category.",
      });
    }

    // Limit counts
    let topPicksCount = 0;
    const topPickChecked = is_top_pics === "true" || is_top_pics === true || is_top_pics === 1 || is_top_pics === "1";
    if (topPickChecked) {
      const [countResult] = await require("../../config/db").execute(
        `SELECT COUNT(*) AS total FROM product_master WHERE is_top_pics = 1 AND is_deleted = 0 AND pro_id != ?`,
        [id]
      );
      topPicksCount = countResult[0].total;
    }

    let exclusiveCount = 0;
    const exclusiveChecked = is_exclusive === "true" || is_exclusive === true || is_exclusive === 1 || is_exclusive === "1";
    if (exclusiveChecked) {
      const [countResult] = await require("../../config/db").execute(
        `SELECT COUNT(*) AS total FROM product_master WHERE is_exclusive = 1 AND is_deleted = 0 AND pro_id != ?`,
        [id]
      );
      exclusiveCount = countResult[0].total;
    }

    const rejectTopPicks = topPickChecked && topPicksCount >= 10;
    const rejectExclusive = exclusiveChecked && exclusiveCount >= 4;

    // Resolve files
    const coverImageFile = req.files && req.files["coverImage"] ? req.files["coverImage"][0] : null;
    const pro_img = coverImageFile 
      ? `/uploads/products/${coverImageFile.filename}` 
      : (existing_pro_img || productRecord.pro_img);

    // Kept existing additional images
    let existingImages = [];
    if (req.body.existingImages) {
      try {
        existingImages = typeof req.body.existingImages === "string"
          ? JSON.parse(req.body.existingImages)
          : req.body.existingImages;
      } catch (e) {
        existingImages = [];
      }
    }

    // Newly uploaded additional images
    const additionalImagesFiles = req.files && req.files["additionalImages"] ? req.files["additionalImages"] : [];
    const newUploadedImages = additionalImagesFiles.map(f => `/uploads/products/${f.filename}`);

    const additionalImages = [...existingImages, ...newUploadedImages];

    const result = await productService.updateProduct(id, {
      cat_id: Number(cat_id),
      pro_name: trimmedName,
      price: Number(price),
      stock_quantity: Number(stock_quantity) || 0,
      stock_unit: stock_unit || 'PCS',
      pro_img,
      cover_description,
      is_top_pics: rejectTopPicks ? false : topPickChecked,
      is_exclusive: rejectExclusive ? false : exclusiveChecked,
      fabric_type_id: fabric_type_id ? Number(fabric_type_id) : null,
      origin_id: origin_id ? Number(origin_id) : null,
      style_id: style_id ? Number(style_id) : null,
      weave_id: weave_id ? Number(weave_id) : null,
      color_id: color_id ? Number(color_id) : null,
      pattern_id: pattern_id ? Number(pattern_id) : null,
      standard_size: standard_size || null,
      descriptions,
      specifications: specifications.filter(s => s.key.trim() !== "" || s.value.trim() !== ""),
      additionalImages,
      stitching_price,
      disclaimer: disclaimer || "",
    });

    let message = "Product updated successfully";
    if (rejectTopPicks) {
      message = "Maximum Top Picks limit reached.";
    } else if (rejectExclusive) {
      message = "Maximum Exclusive limit reached.";
    }

    return res.status(200).json({
      success: true,
      message,
      data: result,
      topPicksLimitReached: rejectTopPicks,
      exclusiveLimitReached: rejectExclusive,
    });
  } catch (error) {
    console.error("❌ Update Product Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// DELETE PRODUCT
// ========================
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const productRecord = await productService.getProductById(id);
    if (!productRecord) {
      return res.status(404).json({
        success: false,
        error: "Product not found.",
      });
    }

    const success = await productService.deleteProduct(id);
    if (!success) {
      return res.status(500).json({
        success: false,
        error: "Failed to delete product.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("❌ Delete Product Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const updateProductFlags = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_top_pics, is_exclusive } = req.body;

    await productService.updateProductFlags(id, { is_top_pics, is_exclusive });
    return res.status(200).json({
      success: true,
      message: "Product flags updated successfully."
    });
  } catch (error) {
    console.error("❌ Update Product Flags Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const updateStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { stock_quantity } = req.body;

    if (stock_quantity === undefined || stock_quantity === null) {
      return res.status(400).json({ success: false, error: "stock_quantity is required" });
    }

    const success = await productService.updateProductStock(id, stock_quantity);
    if (!success) {
      return res.status(404).json({ success: false, error: "Product not found or stock update failed." });
    }

    return res.status(200).json({
      success: true,
      message: "Product stock updated successfully."
    });
  } catch (error) {
    console.error("❌ Update Product Stock Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================
// TOGGLE PRODUCT STATUS
// ========================
const toggleProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "is_active must be a boolean value.",
      });
    }

    const existingProduct = await productService.getProductById(id);
    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        error: "Product not found.",
      });
    }

    const result = await productService.toggleProductStatus(id, is_active ? 1 : 0);
    return res.status(200).json({
      success: true,
      message: "Product status updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Toggle Product Status Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductFlags,
  updateStock,
  deleteProduct,
  toggleProductStatus,
  searchProducts
};
