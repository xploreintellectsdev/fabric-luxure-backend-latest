const fitStyleService = require("./fitStyle.service");

// ========================
// Get All Fit Styles
// ========================
const getAllFitStyles = async (req, res) => {
  try {
    const fitStyles = await fitStyleService.getAllFitStyles();
    res.status(200).json({ success: true, fitStyles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ========================
// Get Active Fit Styles by Product Type
// ========================
const getActiveFitStylesByProductType = async (req, res) => {
  try {
    let pro_type_id = req.params.pro_type_id;

    // If pro_type_id is not provided in params, check query
    if (!pro_type_id || pro_type_id === 'undefined') {
      const pType = req.query.product_type;
      if (pType) {
        const ConnectDB = require("../../config/db");
        const [ptRows] = await ConnectDB.execute("SELECT pro_type_id FROM product_type WHERE product_type = ? AND is_deleted = 0 LIMIT 1", [pType]);
        if (ptRows.length > 0) pro_type_id = ptRows[0].pro_type_id;
      }
    }

    if (!pro_type_id) {
       return res.status(400).json({ success: false, message: "pro_type_id or product_type query param required" });
    }

    const fitStyles = await fitStyleService.getActiveFitStylesByProductType(pro_type_id);
    res.status(200).json({ success: true, fitStyles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ========================
// Get Fit Style by ID
// ========================
const getFitStyleById = async (req, res) => {
  try {
    const fitStyle = await fitStyleService.getFitStyleById(req.params.id);
    if (!fitStyle) {
      return res.status(404).json({ success: false, message: "Fit Style not found" });
    }
    res.status(200).json({ success: true, fitStyle });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ========================
// Create Fit Style
// ========================
const createFitStyle = async (req, res) => {
  try {
    const { pro_type_id, fit_style_name, display_order, is_active } = req.body;
    
    if (!pro_type_id || !fit_style_name) {
      return res.status(400).json({ success: false, message: "Product Type and Fit Style Name are required" });
    }

    const newFitStyle = await fitStyleService.createFitStyle({
      pro_type_id,
      fit_style_name,
      display_order: display_order || 0,
      is_active: is_active !== undefined ? is_active : 1
    });

    res.status(201).json({ success: true, message: "Fit Style created successfully", fitStyle: newFitStyle });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ========================
// Update Fit Style
// ========================
const updateFitStyle = async (req, res) => {
  try {
    const { pro_type_id, fit_style_name, display_order, is_active } = req.body;
    
    if (!pro_type_id || !fit_style_name) {
      return res.status(400).json({ success: false, message: "Product Type and Fit Style Name are required" });
    }

    const updated = await fitStyleService.updateFitStyle(req.params.id, {
      pro_type_id,
      fit_style_name,
      display_order: display_order || 0,
      is_active: is_active !== undefined ? is_active : 1
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: "Fit Style not found" });
    }

    res.status(200).json({ success: true, message: "Fit Style updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ========================
// Delete / Toggle Status
// ========================
const deleteFitStyle = async (req, res) => {
  try {
    const { is_active } = req.body;
    // If is_active is provided, toggle. Else default to soft delete (0)
    const statusToSet = is_active !== undefined ? is_active : 0;
    
    const updated = await fitStyleService.toggleFitStyleStatus(req.params.id, statusToSet);
    
    if (!updated) {
      return res.status(404).json({ success: false, message: "Fit Style not found" });
    }

    res.status(200).json({ success: true, message: "Fit Style status updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllFitStyles,
  getActiveFitStylesByProductType,
  getFitStyleById,
  createFitStyle,
  updateFitStyle,
  deleteFitStyle
};
