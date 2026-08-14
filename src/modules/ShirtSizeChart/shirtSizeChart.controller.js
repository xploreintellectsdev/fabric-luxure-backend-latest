const shirtSizeChartService = require("./shirtSizeChart.service");

// ========================
// GET ALL SIZES (Admin list)
// ========================
const getAllSizes = async (req, res) => {
  try {
    const pro_type_id = req.query.pro_type_id ? Number(req.query.pro_type_id) : 1;
    const fit_style_id = req.query.fit_style_id ? Number(req.query.fit_style_id) : null;
    const result = await shirtSizeChartService.getAllSizes(pro_type_id, fit_style_id);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("❌ Get All Sizes Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ========================
// GET ACTIVE SIZES (Customer website)
// ========================
const getActiveSizes = async (req, res) => {
  try {
    const pro_type_id = req.query.pro_type_id ? Number(req.query.pro_type_id) : 1;
    const fit_style_id = req.query.fit_style_id ? Number(req.query.fit_style_id) : null;
    const result = await shirtSizeChartService.getActiveSizes(pro_type_id, fit_style_id);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("❌ Get Active Sizes Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ========================
// CREATE SIZE CHART ROW
// ========================
const createSize = async (req, res) => {
  try {
    const { pro_type_id, fit_style_id, size_name, chest, length, shoulder, sleeve, display_order, is_active } = req.body;

    if (!pro_type_id || !fit_style_id) {
        return res.status(400).json({ success: false, error: "Product Type and Fit Style are required." });
    }

    // Validation
    if (!size_name || !size_name.trim()) {
      return res.status(400).json({ success: false, error: "Size Name is required." });
    }
    if (display_order === undefined || display_order === null || display_order === "") {
      return res.status(400).json({ success: false, error: "Display Order is required." });
    }
    if (isNaN(display_order)) {
      return res.status(400).json({ success: false, error: "Display Order must be a number." });
    }
    if (isNaN(chest) || isNaN(length) || isNaN(shoulder) || isNaN(sleeve)) {
      return res.status(400).json({ success: false, error: "Measurements must be numeric values." });
    }

    // Name uniqueness check within same fit style
    const existingName = await shirtSizeChartService.getSizeByName(size_name.trim(), fit_style_id, pro_type_id);
    if (existingName) {
      return res.status(409).json({ success: false, error: `Size Name already exists for this fit style.` });
    }

    // Display order uniqueness check within same fit style
    const existingOrder = await shirtSizeChartService.getSizeByDisplayOrder(Number(display_order), fit_style_id, pro_type_id);
    if (existingOrder) {
      return res.status(409).json({ success: false, error: `Display Order already exists for this fit style.` });
    }

    const isActiveVal = is_active === "true" || is_active === true || is_active === 1 || is_active === "1";

    const result = await shirtSizeChartService.createSize({
      pro_type_id: Number(pro_type_id),
      fit_style_id: Number(fit_style_id),
      size_name: size_name.trim(),
      chest: Number(chest),
      length: Number(length),
      shoulder: Number(shoulder),
      sleeve: Number(sleeve),
      display_order: Number(display_order),
      is_active: isActiveVal
    });

    return res.status(201).json({
      success: true,
      message: "Size chart row created successfully",
      data: result
    });
  } catch (error) {
    console.error("❌ Create Size Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ========================
// UPDATE SIZE CHART ROW
// ========================
const updateSize = async (req, res) => {
  try {
    const { id } = req.params;
    const { pro_type_id, fit_style_id, size_name, chest, length, shoulder, sleeve, display_order, is_active } = req.body;

    if (!pro_type_id || !fit_style_id) {
        return res.status(400).json({ success: false, error: "Product Type and Fit Style are required." });
    }

    const existingData = await shirtSizeChartService.getSizeById(id);
    if (!existingData) {
      return res.status(404).json({ success: false, error: "Size not found." });
    }

    // Name uniqueness check within same fit style (ignoring current row)
    const existingName = await shirtSizeChartService.getSizeByName(size_name.trim(), fit_style_id, pro_type_id);
    if (existingName && existingName.size_chart_id !== Number(id)) {
      return res.status(409).json({ success: false, error: `Size Name already exists for this fit style.` });
    }

    // Display order uniqueness check within same fit style (ignoring current row)
    const existingOrder = await shirtSizeChartService.getSizeByDisplayOrder(Number(display_order), fit_style_id, pro_type_id);
    if (existingOrder && existingOrder.size_chart_id !== Number(id)) {
      return res.status(409).json({ success: false, error: `Display Order already exists for this fit style.` });
    }

    const isActiveVal = is_active === "true" || is_active === true || is_active === 1 || is_active === "1";

    const updated = await shirtSizeChartService.updateSize(id, {
      pro_type_id: Number(pro_type_id),
      fit_style_id: Number(fit_style_id),
      size_name: size_name.trim(),
      chest: Number(chest),
      length: Number(length),
      shoulder: Number(shoulder),
      sleeve: Number(sleeve),
      display_order: Number(display_order),
      is_active: isActiveVal
    });

    if (!updated) {
        return res.status(404).json({ success: false, error: "Size not found." });
    }

    return res.status(200).json({
      success: true,
      message: "Size chart row updated successfully"
    });
  } catch (error) {
    console.error("❌ Update Size Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ========================
// DELETE (Soft Delete / Toggle)
// ========================
const deleteSize = async (req, res) => {
  try {
    const { id } = req.params;

    const existingData = await shirtSizeChartService.getSizeById(id);
    if (!existingData) {
      return res.status(404).json({ success: false, error: "Size not found." });
    }

    // We can also toggle status if we wanted, but the service explicitly does `is_active = 0` 
    // for `deleteSize`. Wait, let me check the existing shirtSizeChart.service.js `deleteSize`.
    // It sets is_active = 0.
    
    await shirtSizeChartService.deleteSize(id);

    return res.status(200).json({
      success: true,
      message: "Size chart row soft deleted successfully"
    });
  } catch (error) {
    console.error("❌ Delete Size Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  getAllSizes,
  getActiveSizes,
  createSize,
  updateSize,
  deleteSize
};
