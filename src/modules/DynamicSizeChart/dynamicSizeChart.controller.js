const dynamicSizeChartService = require("./dynamicSizeChart.service");
const ConnectDB = require("../../config/db");

const resolveTableName = (req) => {
  // Can be passed via query string or body depending on HTTP method
  const productType = req.query.product_type || req.body.product_type;
  if (!productType) {
    throw new Error("Missing 'product_type' parameter.");
  }
  const tableName = dynamicSizeChartService.getTableName(productType);
  if (!tableName) {
    throw new Error(`Invalid or unsupported product_type: ${productType}`);
  }
  return tableName;
};

// ========================
// GET ALL SIZES (Admin list)
// ========================
const getAllSizes = async (req, res) => {
  try {
    const tableName = resolveTableName(req);
    const pro_type_id = req.query.pro_type_id ? Number(req.query.pro_type_id) : 1;
    const fit_style_id = req.query.fit_style_id ? Number(req.query.fit_style_id) : null;

    const result = await dynamicSizeChartService.getAllSizes(tableName, pro_type_id, fit_style_id);

    return res.status(200).json({
      success: true,
      columns: result.columns,
      data: result.rows
    });
  } catch (error) {
    console.error("❌ Get All Sizes Error:", error.message);
    return res.status(error.message.includes("Missing") || error.message.includes("Invalid") ? 400 : 500).json({
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
    const tableName = resolveTableName(req);
    let pro_type_id = req.query.pro_type_id ? Number(req.query.pro_type_id) : null;
    let fit_style_id = req.query.fit_style_id ? Number(req.query.fit_style_id) : null;

    // Resolve IDs if missing but string names are provided (e.g., from cart page)
    if (!pro_type_id && (req.query.product_type || req.body.product_type)) {
      const pType = req.query.product_type || req.body.product_type;
      const [ptRows] = await ConnectDB.execute("SELECT pro_type_id FROM product_type WHERE product_type = ? AND is_deleted = 0 LIMIT 1", [pType]);
      if (ptRows.length > 0) pro_type_id = ptRows[0].pro_type_id;
    }

    if (!fit_style_id && req.query.fitStyle) {
      let queryStr = "SELECT fit_style_id FROM fit_style_master WHERE fit_style_name = ? AND is_active = 1";
      const queryParams = [req.query.fitStyle];
      
      if (pro_type_id) {
          queryStr += " AND pro_type_id = ?";
          queryParams.push(pro_type_id);
      }
      queryStr += " LIMIT 1";

      const [fsRows] = await ConnectDB.execute(queryStr, queryParams);
      if (fsRows.length > 0) {
        fit_style_id = fsRows[0].fit_style_id;
      } else {
        // If a specific fitStyle name was requested but it doesn't exist for this product, return empty array.
        return res.status(200).json({
          success: true,
          columns: [],
          data: []
        });
      }
    }

    if (!pro_type_id) pro_type_id = 1; // fallback

    const result = await dynamicSizeChartService.getActiveSizes(tableName, pro_type_id, fit_style_id);

    return res.status(200).json({
      success: true,
      columns: result.columns,
      data: result.rows
    });
  } catch (error) {
    console.error("❌ Get Active Sizes Error:", error.message);
    return res.status(error.message.includes("Missing") || error.message.includes("Invalid") ? 400 : 500).json({
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
    const tableName = resolveTableName(req);
    const { pro_type_id, fit_style_id, size_name, display_order, is_active, ...measurements } = req.body;

    // Remove product_type from measurements since it was just used to resolve table name
    delete measurements.product_type;

    if (!pro_type_id || !fit_style_id) {
      return res.status(400).json({ success: false, error: "Product Type ID and Fit Style ID are required." });
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

    // Check if measurement fields match schema and are numeric
    const expectedColumns = await dynamicSizeChartService.getMeasurementColumns(tableName);
    for (const col of expectedColumns) {
      if (measurements[col] === undefined || isNaN(measurements[col])) {
        return res.status(400).json({ success: false, error: `Measurement '${col}' is required and must be numeric.` });
      }
    }

    // Name uniqueness check within same fit style
    const existingName = await dynamicSizeChartService.getSizeByName(tableName, size_name.trim(), fit_style_id, pro_type_id);
    if (existingName) {
      return res.status(409).json({ success: false, error: `Size Name already exists for this fit style.` });
    }

    // Display order uniqueness check within same fit style
    const existingOrder = await dynamicSizeChartService.getSizeByDisplayOrder(tableName, Number(display_order), fit_style_id, pro_type_id);
    if (existingOrder) {
      return res.status(409).json({ success: false, error: `Display Order already exists for this fit style.` });
    }

    const isActiveVal = is_active === "true" || is_active === true || is_active === 1 || is_active === "1";

    const result = await dynamicSizeChartService.createSize(tableName, {
      pro_type_id: Number(pro_type_id),
      fit_style_id: Number(fit_style_id),
      size_name: size_name.trim(),
      display_order: Number(display_order),
      is_active: isActiveVal,
      measurements
    });

    return res.status(201).json({
      success: true,
      message: "Size chart row created successfully",
      data: result
    });
  } catch (error) {
    console.error("❌ Create Size Error:", error.message);
    return res.status(error.message.includes("Missing") || error.message.includes("Invalid") ? 400 : 500).json({
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
    const tableName = resolveTableName(req);
    const { pro_type_id, fit_style_id, size_name, display_order, is_active, ...measurements } = req.body;

    delete measurements.product_type;

    if (!pro_type_id || !fit_style_id) {
      return res.status(400).json({ success: false, error: "Product Type ID and Fit Style ID are required." });
    }

    const existingData = await dynamicSizeChartService.getSizeById(tableName, id);
    if (!existingData) {
      return res.status(404).json({ success: false, error: "Size not found." });
    }

    // Check if measurement fields match schema and are numeric
    const expectedColumns = await dynamicSizeChartService.getMeasurementColumns(tableName);
    for (const col of expectedColumns) {
      if (measurements[col] === undefined || isNaN(measurements[col])) {
        return res.status(400).json({ success: false, error: `Measurement '${col}' is required and must be numeric.` });
      }
    }

    // Name uniqueness check within same fit style (ignoring current row)
    const existingName = await dynamicSizeChartService.getSizeByName(tableName, size_name.trim(), fit_style_id, pro_type_id);
    if (existingName && existingName.size_chart_id !== Number(id)) {
      return res.status(409).json({ success: false, error: `Size Name already exists for this fit style.` });
    }

    // Display order uniqueness check within same fit style (ignoring current row)
    const existingOrder = await dynamicSizeChartService.getSizeByDisplayOrder(tableName, Number(display_order), fit_style_id, pro_type_id);
    if (existingOrder && existingOrder.size_chart_id !== Number(id)) {
      return res.status(409).json({ success: false, error: `Display Order already exists for this fit style.` });
    }

    const isActiveVal = is_active === "true" || is_active === true || is_active === 1 || is_active === "1";

    const updated = await dynamicSizeChartService.updateSize(tableName, id, {
      pro_type_id: Number(pro_type_id),
      fit_style_id: Number(fit_style_id),
      size_name: size_name.trim(),
      display_order: Number(display_order),
      is_active: isActiveVal,
      measurements
    });

    return res.status(200).json({
      success: true,
      message: "Size chart row updated successfully",
      data: updated
    });
  } catch (error) {
    console.error("❌ Update Size Error:", error.message);
    return res.status(error.message.includes("Missing") || error.message.includes("Invalid") ? 400 : 500).json({
      success: false,
      error: error.message
    });
  }
};

// ========================
// DELETE SIZE CHART ROW
// ========================
const deleteSize = async (req, res) => {
  try {
    const { id } = req.params;
    const tableName = resolveTableName(req);

    const existingData = await dynamicSizeChartService.getSizeById(tableName, id);
    if (!existingData) {
      return res.status(404).json({ success: false, error: "Size not found." });
    }

    const result = await dynamicSizeChartService.deleteSize(tableName, id);

    return res.status(200).json({
      success: true,
      message: "Size soft deleted successfully",
      data: result
    });
  } catch (error) {
    console.error("❌ Delete Size Error:", error.message);
    return res.status(error.message.includes("Missing") || error.message.includes("Invalid") ? 400 : 500).json({
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
